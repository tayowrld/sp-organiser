import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    agentFeedback: true,
    agentUpgrade: 'security',
  },
  outputFileTracingExcludes: {
    '/*': ['./data/**/*'],
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
