/*
 * NullCord Hack Client (local dev/admin overlay)
 *
 * Load from the browser console:
 *   const s=document.createElement('script');s.src='/hack-client.js';document.head.append(s)
 *
 * Or open https://<your-host>/hack-client.js and paste it into the console.
 * It only edits this browser's local NullCord state; it does not call admin APIs.
 */
(function () {
  if (window.__nullcordHackClient) return;
  window.__nullcordHackClient = true;

  const KEY = (k) => `nullcord:${k}`;
  const targetUi = location.pathname.startsWith("/stoat") ? "stoat" : "nullcord";
  let session = { token: "", userId: "", sessionId: "" };

  async function detectSession() {
    const found = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key) || "";
        if (!found.token && /^[A-Za-z0-9_-]{40,}$/.test(value)) {
          found.token = value;
          found.sessionId = key;
        }
        if (!found.userId && /^[A-Z0-9]{26}$/.test(value)) found.userId = value;
      }
    } catch (e) {}

    try {
      const dbs = indexedDB.databases ? await indexedDB.databases() : [{ name: "localforage" }];
      for (const info of dbs) {
        if (!info.name) continue;
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open(info.name);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        for (const storeName of Array.from(db.objectStoreNames)) {
          const auth = await new Promise((resolve) => {
            try {
              const tx = db.transaction(storeName, "readonly");
              const req = tx.objectStore(storeName).get("auth");
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => resolve(undefined);
            } catch (e) {
              resolve(undefined);
            }
          });
          const ses = auth?.session || auth?.sessions?.[0]?.session;
          if (ses?.token) {
            found.token = ses.token;
            found.userId = ses.userId || ses.user_id || found.userId;
            found.sessionId = ses._id || found.sessionId;
          }
          if (found.token && found.userId) break;
        }
        db.close();
        if (found.token && found.userId) break;
      }
    } catch (e) {}

    session = {
      token: found.token || "",
      userId: found.userId || "",
      sessionId: found.sessionId || found.userId || "",
    };
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "") ?? fallback;
    } catch (e) {
      return fallback;
    }
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function currentUserId() {
    return document.getElementById("nc-hack-uid").value.trim() || session.userId;
  }

  function toast(text) {
    const el = document.getElementById("nc-hack-toast");
    el.textContent = text;
    el.style.opacity = "1";
    clearTimeout(el._timer);
    el._timer = setTimeout(() => (el.style.opacity = "0"), 1800);
  }

  function applyToken() {
    const token = document.getElementById("nc-hack-token").value.trim();
    const userId = document.getElementById("nc-hack-uid").value.trim();
    const sessionId = document.getElementById("nc-hack-session").value.trim() || userId;
    if (!token || !userId) return toast("Token and user ID are required.");
    localStorage.setItem(
      "nullcord:handoff",
      JSON.stringify({
        token,
        userId,
        sessionId,
        expires: Date.now() + 120000,
        target: targetUi,
      }),
    );
    toast("Token installed. Reloading…");
    setTimeout(() => location.reload(), 500);
  }

  function setOrbs() {
    const uid = currentUserId();
    const value = Number(document.getElementById("nc-hack-orbs").value);
    if (!uid || !Number.isFinite(value)) return toast("Enter a user ID and Orbs.");
    localStorage.setItem(KEY(`orbs:${uid}`), String(Math.max(0, Math.floor(value))));
    toast("Orbs updated.");
    refresh();
  }

  function setNitro() {
    const uid = currentUserId();
    const tier = document.getElementById("nc-hack-nitro").value;
    if (!uid) return toast("Enter a user ID.");
    if (tier === "none") localStorage.removeItem(KEY(`nitro:${uid}`));
    else localStorage.setItem(KEY(`nitro:${uid}`), tier);
    toast("Nitro tier updated.");
  }

  function unclaimQuests() {
    const uid = currentUserId();
    if (!uid) return toast("Enter a user ID.");
    const key = KEY(`quests:${uid}`);
    const claims = readJson(key, {});
    for (const id of Object.keys(claims)) {
      if (claims[id] === today()) delete claims[id];
    }
    localStorage.setItem(key, JSON.stringify(claims));
    toast("Today's quest claims cleared.");
  }

  function setUiMode() {
    localStorage.setItem("nullcord:ui-mode", document.getElementById("nc-hack-ui").value);
    toast("UI mode saved. Reload to apply.");
  }

  function togglePlugin(id, enabled) {
    const states = readJson("nullcord:plugins", {});
    states[id] = enabled;
    localStorage.setItem("nullcord:plugins", JSON.stringify(states));
  }

  function wipeNullCord() {
    if (!confirm("Remove all nullcord:* localStorage keys on this device?")) return;
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("nullcord:")) localStorage.removeItem(key);
    }
    localStorage.removeItem("nullcord:plugins");
    toast("NullCord data removed.");
  }

  function refresh() {
    const uid = currentUserId();
    const orbs = localStorage.getItem(KEY(`orbs:${uid}`));
    if (orbs !== null) document.getElementById("nc-hack-orbs").value = orbs;
    const nitro = localStorage.getItem(KEY(`nitro:${uid}`));
    document.getElementById("nc-hack-nitro").value = nitro || "none";
    const states = readJson("nullcord:plugins", {});
    for (const id of ["server-tags", "quest-helper", "no-snow"]) {
      const checkbox = document.getElementById(`nc-hack-plugin-${id}`);
      if (checkbox) checkbox.checked = states[id] ?? true;
    }
    document.getElementById("nc-hack-token").value = session.token;
    document.getElementById("nc-hack-uid").value = uid || session.userId;
    document.getElementById("nc-hack-session").value = session.sessionId;
    document.getElementById("nc-hack-dump").value = Object.keys(localStorage)
      .filter((k) => k.startsWith("nullcord:"))
      .map((k) => `${k} = ${localStorage.getItem(k)}`)
      .join("\n");
  }

  function style() {
    const css = document.createElement("style");
    css.textContent = `
      #nc-hack-fab{position:fixed;left:14px;bottom:14px;z-index:2147483646;border:1px solid #6ee7ff;background:#101823;color:#e6edf7;border-radius:999px;padding:10px 14px;font:700 12px Inter,sans-serif;cursor:pointer;box-shadow:0 8px 30px #0008}
      #nc-hack-panel{position:fixed;left:14px;bottom:64px;width:min(560px,calc(100vw - 28px));max-height:calc(100vh - 90px);overflow:auto;z-index:2147483647;background:#101823f7;color:#e6edf7;border:1px solid #334155;border-radius:18px;box-shadow:0 20px 80px #000c;font:13px/1.45 Inter,sans-serif;backdrop-filter:blur(18px)}
      #nc-hack-panel *{box-sizing:border-box}
      #nc-hack-panel .hd{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #263244;font-weight:800;font-size:16px}
      #nc-hack-panel .bd{padding:16px 18px;display:grid;gap:14px}
      #nc-hack-panel section{border:1px solid #263244;border-radius:12px;padding:12px;display:grid;gap:8px;background:#0b1220}
      #nc-hack-panel h3{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#8ea3bd}
      #nc-hack-panel label{display:grid;gap:4px;font-size:11px;color:#9fb0c7}
      #nc-hack-panel input,#nc-hack-panel select,#nc-hack-panel textarea{width:100%;background:#08101c;color:#e6edf7;border:1px solid #334155;border-radius:8px;padding:8px 10px;font:12px/1.4 ui-monospace,monospace}
      #nc-hack-panel textarea{min-height:90px;resize:vertical}
      #nc-hack-panel button{border:0;border-radius:8px;padding:8px 11px;font-weight:700;background:#7dd3fc;color:#07202e;cursor:pointer}
      #nc-hack-panel .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      #nc-hack-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;background:#0b1220ee;color:#e6edf7;border:1px solid #334155;border-radius:999px;padding:8px 14px;opacity:0;transition:.2s;font:600 12px Inter,sans-serif;pointer-events:none}
      #nc-hack-panel .muted{font-size:11px;color:#8ea3bd}
    `;
    document.head.appendChild(css);
  }

  function ui() {
    style();
    const fab = document.createElement("button");
    fab.id = "nc-hack-fab";
    fab.textContent = "NullCord Hack";
    fab.onclick = () => {
      const panel = document.getElementById("nc-hack-panel");
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    };
    document.body.appendChild(fab);

    const panel = document.createElement("div");
    panel.id = "nc-hack-panel";
    panel.style.display = "none";
    panel.innerHTML = `
      <div class="hd"><span>NullCord Hack Client</span><button id="nc-hack-close" style="background:#1e293b;color:#e6edf7">Close</button></div>
      <div class="bd">
        <section>
          <h3>Session token</h3>
          <div class="muted">Writes a one-shot 2-minute handoff for this client and reloads.</div>
          <label>Token<input id="nc-hack-token" placeholder="session token"></label>
          <label>User ID<input id="nc-hack-uid" placeholder="01..."></label>
          <label>Session ID<input id="nc-hack-session" placeholder="session id"></label>
          <div class="row"><button id="nc-hack-apply">Apply token</button><button id="nc-hack-copy" style="background:#334155;color:#fff">Copy token</button></div>
        </section>
        <section>
          <h3>Economy</h3>
          <label>Orbs<input id="nc-hack-orbs" type="number" min="0" step="1"></label>
          <div class="row"><button id="nc-hack-set-orbs">Set Orbs</button></div>
          <label>Nitro tier<select id="nc-hack-nitro"><option value="none">None</option><option value="basic">Nitro Basic</option><option value="nitro">Nitro</option></select></label>
          <div class="row"><button id="nc-hack-set-nitro">Set Nitro</button></div>
          <div class="row"><button id="nc-hack-unclaim" style="background:#fbbf24">Clear today's quest claims</button></div>
        </section>
        <section>
          <h3>Plugins</h3>
          <label><span><input type="checkbox" id="nc-hack-plugin-server-tags" style="width:auto"> Server Tags</span></label>
          <label><span><input type="checkbox" id="nc-hack-plugin-quest-helper" style="width:auto"> Quest Helper</span></label>
          <label><span><input type="checkbox" id="nc-hack-plugin-no-snow" style="width:auto"> No Snow</span></label>
        </section>
        <section>
          <h3>UI mode</h3>
          <label>Mode<select id="nc-hack-ui"><option value="regular">Regular</option><option value="combined">Combined</option><option value="stoat">Stoat CSS</option></select></label>
          <div class="row"><button id="nc-hack-set-ui">Set UI mode</button></div>
        </section>
        <section>
          <h3>Storage</h3>
          <textarea id="nc-hack-dump" readonly></textarea>
          <div class="row"><button id="nc-hack-refresh" style="background:#334155;color:#fff">Refresh</button><button id="nc-hack-wipe" style="background:#ef4444;color:#fff">Wipe nullcord:*</button></div>
        </section>
      </div>
    `;
    document.body.appendChild(panel);
    const toastEl = document.createElement("div");
    toastEl.id = "nc-hack-toast";
    document.body.appendChild(toastEl);

    const on = (id, fn) => document.getElementById(id).addEventListener("click", fn);
    on("nc-hack-close", () => (panel.style.display = "none"));
    on("nc-hack-apply", applyToken);
    on("nc-hack-copy", () => {
      navigator.clipboard?.writeText(document.getElementById("nc-hack-token").value);
      toast("Token copied.");
    });
    on("nc-hack-set-orbs", setOrbs);
    on("nc-hack-set-nitro", setNitro);
    on("nc-hack-unclaim", unclaimQuests);
    on("nc-hack-set-ui", setUiMode);
    on("nc-hack-refresh", refresh);
    on("nc-hack-wipe", wipeNullCord);
    for (const id of ["server-tags", "quest-helper", "no-snow"]) {
      document
        .getElementById(`nc-hack-plugin-${id}`)
        .addEventListener("change", (e) => togglePlugin(id, e.target.checked));
    }

    detectSession().then(refresh);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ui);
  } else {
    ui();
  }
})();
