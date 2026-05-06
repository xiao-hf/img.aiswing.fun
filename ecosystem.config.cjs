module.exports = {
  apps: [
    {
      name: "aiswing-image-studio",
      script: "server.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "3000",
        UPSTREAM: "https://cdn.aiswing.fun",
        MAX_BODY_BYTES: String(60 * 1024 * 1024),
      },
    },
  ],
};

