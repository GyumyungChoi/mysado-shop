module.exports = {
  apps: [{
    name: 'mysado-shop',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/home/chris/apps/mysado-shop',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true
  }]
}