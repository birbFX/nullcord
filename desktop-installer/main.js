const {
    app,
    BrowserWindow,
    Menu,
    dialog,
    ipcMain,
    shell,
    session,
    desktopCapturer,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile } = require("node:child_process");
const path = require("node:path");

const APP_URL = "https://nullcord.canyonlakelabs.com/";
const ALLOWED_ORIGIN = new URL(APP_URL).origin;

app.setName("NullCord");
if (process.platform === "win32") {
    app.setAppUserModelId("com.nullcord.desktop");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
}

let mainWindow = null;
let updateTimer = null;

// ---------------------------------------------------------------------------
// Game presence (desktop only)
// ---------------------------------------------------------------------------

const GAME_RULES = [
    {
        id: "portalrtx",
        label: "Portal RTX",
        names: [/^portal\.exe$/i, /^portalrtx\.exe$/i, /^portal rtx\.exe$/i],
    },
    {
        id: "gmod",
        label: "Garry's Mod",
        names: [/^gmod\.exe$/i, /^garrysmod\.exe$/i],
    },
    {
        id: "gmod",
        label: "Garry's Mod",
        names: [/^hl2\.exe$/i],
        command: /garrysmod|gmod|garry'?s mod/i,
    },
];

let currentGame = null;
let gameTimer = null;
let gamePolling = false;

function matchGame(processes) {
    for (const process of processes) {
        const name = String(process.Name || process.name || "").trim();
        const command = String(
            process.CommandLine || process.commandLine || "",
        ).toLowerCase();

        for (const rule of GAME_RULES) {
            if (!rule.names.some((pattern) => pattern.test(name))) continue;
            if (rule.command && !rule.command.test(command)) continue;
            return { id: rule.id, label: rule.label };
        }
    }

    return null;
}

function detectWindowsGame() {
    return new Promise((resolve) => {
        const script =
            "Get-CimInstance Win32_Process | Select-Object Name,CommandLine | ConvertTo-Json -Compress";

        execFile(
            "powershell.exe",
            [
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ],
            {
                windowsHide: true,
                timeout: 8000,
                maxBuffer: 8 * 1024 * 1024,
            },
            (error, stdout) => {
                if (!error && stdout?.trim()) {
                    try {
                        const parsed = JSON.parse(stdout);
                        const list = Array.isArray(parsed) ? parsed : [parsed];
                        resolve(matchGame(list));
                        return;
                    } catch {
                        // fall through to tasklist
                    }
                }

                execFile(
                    "tasklist.exe",
                    ["/FO", "CSV", "/NH"],
                    { windowsHide: true, timeout: 5000 },
                    (taskError, taskOutput) => {
                        if (taskError || !taskOutput) {
                            resolve(null);
                            return;
                        }

                        const processes = taskOutput
                            .split(/\r?\n/)
                            .map((line) => {
                                const match = line.match(/^"([^"]+)"/);
                                return { Name: match?.[1] || "" };
                            });
                        resolve(matchGame(processes));
                    },
                );
            },
        );
    });
}

function publishGame(game) {
    const previous = currentGame?.id ?? null;
    const next = game?.id ?? null;
    currentGame = game;
    if (previous === next) return;

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("nullcord:game", game);
    }
}

async function pollGame() {
    if (gamePolling) return;
    gamePolling = true;
    try {
        publishGame(process.platform === "win32" ? await detectWindowsGame() : null);
    } finally {
        gamePolling = false;
    }
}

function startGameDetection() {
    ipcMain.handle("nullcord:get-game", () => currentGame);

    if (process.platform !== "win32") {
        publishGame(null);
        return;
    }

    void pollGame();
    gameTimer = setInterval(() => {
        void pollGame();
    }, 10_000);
}

function setupUpdates() {
    if (!app.isPackaged) return;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.autoRunAppAfterInstall = true;

    autoUpdater.on("error", (error) => {
        console.error("NullCord updater error:", error);
    });

    autoUpdater.on("update-available", (info) => {
        console.info("NullCord update available:", info.version);
    });

    autoUpdater.on("update-not-available", () => {
        console.info("NullCord is up to date.");
    });

    autoUpdater.on("update-downloaded", async (info) => {
        console.info("NullCord update downloaded:", info.version);

        const options = {
            type: "info",
            title: "NullCord update ready",
            message: `NullCord ${info.version} has been downloaded.`,
            detail:
                "Restart now to install it, or it will install automatically when you close NullCord.",
            buttons: ["Restart and install", "Install on exit"],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
        };
        const result = mainWindow
            ? await dialog.showMessageBox(mainWindow, options)
            : await dialog.showMessageBox(options);

        if (result.response === 0) {
            autoUpdater.quitAndInstall(false, true);
        }
    });

    const check = () => {
        void autoUpdater.checkForUpdates().catch((error) => {
            console.error("NullCord update check failed:", error);
        });
    };

    setTimeout(check, 8_000);
    updateTimer = setInterval(check, 6 * 60 * 60 * 1000);
}


function isAllowed(url) {
    try {
        return new URL(url).origin === ALLOWED_ORIGIN;
    } catch {
        return false;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 600,
        backgroundColor: "#0b0d13",
        title: "NullCord",
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: true,
            preload: path.join(__dirname, "preload.js"),
        },
    });

    mainWindow.setMenu(null);

    mainWindow.once("ready-to-show", () => {
        mainWindow.show();
        mainWindow.focus();
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowed(url)) {
            return { action: "allow" };
        }
        if (/^https?:\/\//i.test(url)) {
            void shell.openExternal(url);
        }
        return { action: "deny" };
    });

    mainWindow.webContents.on("will-navigate", (event, url) => {
        if (!isAllowed(url)) {
            event.preventDefault();
            if (/^https?:\/\//i.test(url)) {
                void shell.openExternal(url);
            }
        }
    });

    mainWindow.webContents.on("will-attach-webview", (event) => {
        event.preventDefault();
    });

    mainWindow.webContents.on("before-input-event", (event, input) => {
        const key = String(input.key || "").toLowerCase();
        if (key === "f5" || (input.control && key === "r")) {
            event.preventDefault();
            mainWindow.reload();
        } else if (key === "f11") {
            event.preventDefault();
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
    });

    mainWindow.on("closed", () => {
        mainWindow = null;
    });

    mainWindow.webContents.on("did-finish-load", () => {
        if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send("nullcord:game", currentGame);
        }
    });

    mainWindow.loadURL(APP_URL).catch((error) => {
        console.error("Failed to load NullCord:", error);
    });
}

app.whenReady().then(() => {
    const defaultSession = session.defaultSession;

    const allowedPermissions = new Set([
        "media",
        "display-capture",
        "notifications",
        "clipboard-read",
        "clipboard-sanitized-write",
        "fullscreen",
        "pointerLock",
        "idle-detection",
    ]);

    defaultSession.setPermissionRequestHandler(
        (webContents, permission, callback, details) => {
            const requestingUrl =
                details && details.requestingUrl
                    ? details.requestingUrl
                    : webContents.getURL();
            callback(
                isAllowed(requestingUrl) && allowedPermissions.has(permission),
            );
        },
    );

    defaultSession.setPermissionCheckHandler(
        (webContents, permission, requestingOrigin) =>
            isAllowed(requestingOrigin) && allowedPermissions.has(permission),
    );

    // Let Windows/macOS show the native screen/window picker. Fall back to
    // the primary screen if the platform picker is unavailable.
    defaultSession.setDisplayMediaRequestHandler(
        async (request, callback) => {
            try {
                const sources = await desktopCapturer.getSources({
                    types: ["screen", "window"],
                    thumbnailSize: { width: 0, height: 0 },
                });
                callback({
                    video: sources[0],
                    audio: process.platform === "win32" ? "loopback" : undefined,
                });
            } catch (error) {
                console.error("Screen picker failed:", error);
                callback({});
            }
        },
        { useSystemPicker: true },
    );

    Menu.setApplicationMenu(null);
    startGameDetection();
    createWindow();
    setupUpdates();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("second-instance", () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

app.on("window-all-closed", () => {
    if (updateTimer) clearInterval(updateTimer);
    if (gameTimer) clearInterval(gameTimer);
    app.quit();
});
