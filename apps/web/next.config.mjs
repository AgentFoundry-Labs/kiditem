/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@kiditem/templates'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
