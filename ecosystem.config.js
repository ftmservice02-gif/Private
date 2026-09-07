// Windows Python installs (python.org, MS Store) generally expose only a
// `python` command on PATH, not `python3` — resolving by PATH here rather
// than hardcoding an absolute path (e.g. the old "/usr/bin/python3") keeps
// this config portable across dev machines and however each deploy target
// happens to be provisioned, Linux or Windows.
var pythonCmd = process.platform === "win32" ? "python" : "python3";

module.exports = {
  apps: [
    {
      name: "pm-board-api",
      cwd: __dirname + "/server",
      script: "server.js",
      env: { NODE_ENV: "production" }
    },
    {
      name: "pm-board-static",
      cwd: __dirname,
      script: pythonCmd,
      args: "-m http.server 8743",
      interpreter: "none"
    }
  ]
};
