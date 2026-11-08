module.exports = {
  apps: [
    {
      name: 'sp-planner',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 6553',
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '700M',
      time: true,
    },
    {
      name: 'sp-planner-worker',
      cwd: __dirname,
      script: 'scripts/worker.mjs',
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      time: true,
    },
  ],
}
