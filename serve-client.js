#!/usr/bin/env node
/**
 * NullCord production client server.
 *
 * Serves revite/dist with long-lived caching for hashed bundles and
 * no-cache for the app shell, with SPA history fallback. This replaces the
 * slow Vite dev server for normal use.
 */
const http = require("http");
const path = require("path");
const sirv = require(path.join(__dirname, "revite", "node_modules", "sirv"));

const DIST = path.join(__dirname, "revite", "dist");
const PORT = Number(process.env.CLIENT_PORT || 5173);

function headers(res, pathname) {
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (/\/assets\/[^/]+\.[0-9a-f]{8,}\.(js|css|woff2?|png|jpe?g|gif|webp|svg|json)$/.test(pathname)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (pathname.includes("/assets/icons/")) {
        res.setHeader("Cache-Control", "public, max-age=86400");
    } else {
        // index.html, service worker, manifest and all SPA routes
        res.setHeader("Cache-Control", "no-cache");
    }
}

const handler = sirv(DIST, {
    single: true,
    etag: true,
    // Read from disk on every request so newly built hashed bundles are
    // picked up without restarting the server.
    dev: true,
    setHeaders: headers,
});

const server = http.createServer((req, res) => {
    // Health check without touching disk.
    if (req.url === "/healthz") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok\n");
        return;
    }
    handler(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`[client] serving ${DIST} on http://0.0.0.0:${PORT}/`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
