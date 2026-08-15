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
      script: "/usr/bin/python3",
      args: "-m http.server 8743",
      interpreter: "none"
    }
  ]
};
