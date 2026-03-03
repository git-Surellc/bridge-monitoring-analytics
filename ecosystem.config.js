module.exports = {
  apps: [{
    name: "structure-monitoring-analytics",
    script: "./server/index.js",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production",
      PORT: 8888
    },
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    time: true
  }]
};
