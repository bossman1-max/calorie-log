/* Calorie Log: offline shell.
 *
 * Strategy is stale-while-revalidate, deliberately, not plain cache-first:
 *   - the cached copy is served immediately, so the app opens instantly even when the
 *     host is asleep (Render's free tier takes 30-50s to wake) or there is no signal;
 *   - a background fetch refreshes the cache, so the next ordinary load has your edits.
 * Plain cache-first would strand you on an old build until the cache name changed.
 *
 * Bump SHELL_CACHE when the precache list changes.
 */

var SHELL_CACHE = "clog-shell-v1";
var FONT_CACHE = "clog-fonts-v1";

var SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(function (c) {
      // addAll is all-or-nothing; a single 404 would leave the app with no offline copy.
      return Promise.all(SHELL.map(function (url) {
        return c.add(url).catch(function () { /* skip whatever is missing */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        if (n !== SHELL_CACHE && n !== FONT_CACHE) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Google Fonts: cache-first in their own bucket, so the type survives offline
  // instead of silently dropping to the fallback stack.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(FONT_CACHE).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
            return res;
          });
        });
      }).catch(function () { return fetch(req); })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/healthz") return;

  e.respondWith(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.match(req).then(function (hit) {
        var network = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () {
          // Offline: a navigation still needs the shell back.
          return hit || cache.match("/index.html");
        });
        return hit || network;
      });
    })
  );
});
