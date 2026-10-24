/**
 * Calorie Log: static server.
 * Serves public/ and nothing else. No database, no API keys, no dependencies:
 * all state lives in the browser's localStorage, so there is nothing to persist here.
 *   GET /healthz: plain 200, for uptime pings once this is deployed
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      // Force the browser to revalidate every asset instead of silently reusing an old copy.
      // Without this, switching versions leaves you running new HTML against cached old JS
      // (or vice versa), and mismatched element IDs then make every button look "dead".
      // Offline caching is the service worker's job deliberately; the HTTP layer stays honest.
      "Cache-Control": "no-cache, must-revalidate",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (req.method === "GET" && pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
  res.writeHead(405);
  res.end();
});

// bind 0.0.0.0 so cloud hosts (Render etc.) can route external traffic to the app
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Calorie Log ready at http://localhost:${PORT}`);
});
