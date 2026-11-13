/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Dockerfile sets NEXT_OUTPUT=standalone for a small production image.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'sharp', 'unpdf', 'pdf-lib', '@google-cloud/storage', 'nodemailer', 'bcryptjs'],
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  poweredByHeader: false,
};
export default nextConfig;
