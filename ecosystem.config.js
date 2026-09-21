// The static frontend is served by static-server.js (Node) rather than
// `python -m http.server`: it only serves the frontend files — the Python
// server exposed server/.env, the source and .git — and it forwards /api and
// /uploads to the API on 8790, so a domain that points at port 8743 alone works.
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
      script: "static-server.js"
    }
  ]
};
