/** @type {import('next').NextConfig} */

// Strip a single trailing slash so rewrite destinations don't double up the
// slash between backend base and path (e.g. `http://host:4000//api/...`).
function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

const backendBase = stripTrailingSlash(
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
);

const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@kiditem/templates'],
  async headers() {
    return [
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
    ];
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
    turbopackFileSystemCacheForDev: false,
  },
  // CopilotKit browser runtime calls only same-origin `/api/chat/copilot`.
  // Next forwards both the exact path (CopilotKit POST entry) and any
  // sub-path (Hono router `/info`, etc.) to the Nest chat runtime. No API
  // Route/Route Handler is added — `apps/web/AGENTS.md` keeps the No API
  // Routes rule; AI chat is the bounded transport exception, implemented
  // purely as a rewrite.
  async rewrites() {
    return [
      {
        source: '/api/chat/copilot',
        destination: `${backendBase}/api/chat/copilot`,
      },
      {
        source: '/api/chat/copilot/:path*',
        destination: `${backendBase}/api/chat/copilot/:path*`,
      },
    ];
  },
};

export default nextConfig;
