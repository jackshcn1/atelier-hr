/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  experimental: {
    // These must not be bundled by webpack:
    //  - playwright-core lazily requires 'chromium-bidi' (not declared as its
    //    own dependency in 1.63.0), which webpack cannot resolve.
    //  - @sparticuz/chromium reads its compressed browser binaries from
    //    node_modules at runtime, so it needs its real directory layout.
    // Both are required at runtime instead, and Next's output tracing copies
    // them into the function bundle.
    serverComponentsExternalPackages: ['playwright-core', '@sparticuz/chromium'],

    // The @sparticuz/chromium browser binaries (.br archives) live in the
    // package's bin/ folder and are read from disk at runtime, so they must
    // be copied into the function bundle explicitly.
    outputFileTracingIncludes: {
      '/app/api/sync': ['./node_modules/@sparticuz/chromium/bin/**/*'],
      '**/api/sync': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    },

    // Never ship the local credential file or local run artifacts to Vercel.
    // scripts/petpooja-config.json holds the Petpooja and Supabase credentials.
    outputFileTracingExcludes: {
      '/app/api/sync': [
        './scripts/petpooja-config.json',
        './scripts/petpooja-sync.log',
        './scripts/last-successful-sync.json',
      ],
      '**/api/sync': [
        './scripts/petpooja-config.json',
        './scripts/petpooja-sync.log',
        './scripts/last-successful-sync.json',
      ],
    },
  },
};
module.exports = nextConfig;
