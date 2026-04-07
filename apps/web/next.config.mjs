/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@kiditem/templates'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
};

export default nextConfig;
