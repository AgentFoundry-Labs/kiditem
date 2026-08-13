/** @type {import('next').NextConfig} */
import { fileURLToPath } from 'node:url';

// Strip a single trailing slash so rewrite destinations don't double up the
// slash between backend base and path (e.g. `http://host:4000//api/...`).
function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

const backendBase = stripTrailingSlash(
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
);
const proxyAllApi = process.env.KIDITEM_PROXY_ALL_API === 'true';
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function resolveInteractionGatewayBase(phase) {
  if (process.env.INTERACTION_GATEWAY_URL) {
    return stripTrailingSlash(process.env.INTERACTION_GATEWAY_URL);
  }
  if (phase === 'phase-production-server') {
    throw new Error('INTERACTION_GATEWAY_URL is required in production');
  }
  if (phase === 'phase-development-server') return 'http://localhost:4100';
  // Build-only placeholder keeps environment-agnostic CI builds finite. A
  // production server cannot start without the real server-only value.
  return 'http://interaction-gateway.invalid';
}

function createNextConfig(phase) {
  const interactionGatewayBase = resolveInteractionGatewayBase(phase);
  return {
  output: 'standalone',
  transpilePackages: ['@kiditem/templates'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.alicdn.com' },
      { protocol: 'https', hostname: '**.tbcdn.cn' },
      { protocol: 'https', hostname: '**.taobaocdn.com' },
    ],
  },
  turbopack: {
    root: repoRoot,
  },
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
  // CopilotKit browser runtime calls only same-origin `/api/copilotkit`.
  // Next forwards the runtime entry and sub-paths to the OSS interaction gateway. No API
  // Route/Route Handler is added — `apps/web/AGENTS.md` keeps the No API
  // Routes rule; AI chat is the bounded transport exception, implemented
  // purely as a rewrite.
  async rewrites() {
    return [
      {
        source: '/api/copilotkit',
        destination: `${interactionGatewayBase}/api/copilotkit`,
      },
      {
        source: '/api/copilotkit/:path*',
        destination: `${interactionGatewayBase}/api/copilotkit/:path*`,
      },
      ...(proxyAllApi
        ? [
            {
              source: '/api/:path*',
              destination: `${backendBase}/api/:path*`,
            },
          ]
        : []),
    ];
  },
  };
}

export default createNextConfig;
