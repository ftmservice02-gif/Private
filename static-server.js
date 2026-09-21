// Static file server for the frontend — replaces `python -m http.server`.
//
// Two things the plain Python server couldn't do:
//  1. It served EVERY file under the repo root, including server/.env (the DB
//     URL and SMTP password), server/*.js and .git/. Only the frontend is
//     served here: top-level .html/.svg/.png/.ico files and everything under
//     shared/. Anything else — server/, .git/, dotfiles, ecosystem.config.js —
//     is a 404.
//  2. It can't sit behind a single-port domain. /api/* and /uploads/* are
//     forwarded to the API on 127.0.0.1:8790, so a domain that points only at
//     this port (e.g. https://pmp.fatima.co.th) reaches the whole app, and
//     shared.js calls the API same-origin when it isn't on port 8743.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.STATIC_PORT || "8743", 10);
const API_HOST = process.env.API_HOST || "127.0.0.1";
const API_PORT = parseInt(process.env.API_PORT || "8790", 10);
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".wasm": "application/wasm", ".map": "application/json", ".txt": "text/plain; charset=utf-8",
  ".traineddata": "application/octet-stream", ".gz": "application/gzip",
};

// Top-level files that are part of the frontend; everything else at the root
// (package.json, ecosystem.config.js, _check.js, ...) is not served.
const ROOT_FILE = /^[A-Za-z0-9._-]+\.(html|svg|png|ico|webmanifest)$/;

function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch (e) { return null; }
  if (p.indexOf("\0") !== -1) return null;
  p = path.posix.normalize(p);
  if (p === "/") p = "/index.html";
  const parts = p.split("/").filter(Boolean);
  if (!parts.length || parts.some((s) => s.startsWith(".") || s === "node_modules")) return null;
  const allowed = (parts.length === 1 && ROOT_FILE.test(parts[0])) || parts[0] === "shared";
  if (!allowed) return null;
  const file = path.join(ROOT, ...parts);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  return file;
}

function proxy(req, res) {
  const headers = Object.assign({}, req.headers);
  headers["x-forwarded-for"] = req.socket.remoteAddress;
  headers["x-forwarded-host"] = req.headers.host || "";
  const up = http.request({ host: API_HOST, port: API_PORT, method: req.method, path: req.url, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "API unreachable" }));
  });
  req.pipe(up);
}

http.createServer((req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  if (urlPath.startsWith("/api/") || urlPath.startsWith("/uploads/")) return proxy(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }

  const file = resolveFile(urlPath);
  if (!file) { res.writeHead(404); return res.end("Not found"); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": st.size,
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, () => console.log("PM board static server on http://localhost:" + PORT + " (api -> " + API_HOST + ":" + API_PORT + ")"));
