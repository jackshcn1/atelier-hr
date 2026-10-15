/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
};
module.exports = nextConfig;
