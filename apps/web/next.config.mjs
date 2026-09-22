/** @type {import('next').NextConfig} */
import { networkInterfaces } from 'node:os';
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

// `next dev` blocks cross-origin dev requests it does not allow. A phone or
// laptop on the same LAN reaches this app by one of the host's private IPv4
// addresses, so list them instead of a wildcard.
function privateNetworkHosts() {
  const hosts = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) hosts.push(address.address);
    }
  }
  return hosts;
}

function createNextConfig() {
  return {
  // Next.js 16.3+ `next dev` appends a generated agent-rules block to this
  // app's CLAUDE.md (or creates AGENTS.md) when it detects an AI coding agent.
  // The repository maintains its CLAUDE.md chain by hand and treats AGENTS.md
  // as a legacy file (`npm run check:agents-hygiene`), so keep that off.
  agentRules: false,
  allowedDevOrigins: ['127.0.0.1', ...privateNetworkHosts()],
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
    // Match the Office API proxy: CopilotKit SSE runs may have long model/tool
    // intervals, but still retain a bounded transport lifetime.
    proxyTimeout: 3_600_000,
    // Next.js 16.3 defaults `next build` to the `tsc` CLI, which also checks
    // spec files. Keep the compiler-API checker, which skips `__tests__` and
    // `*.spec.*`/`*.test.*` diagnostics as `next build` did before 16.3, until
    // web spec sources type-check (KID-209).
    useTypeScriptCli: false,
  },
  // CopilotKit browser runtime calls only same-origin `/api/copilotkit`.
  // Next forwards it to the ordinary Nest API origin. No API
  // Route/Route Handler is added — `apps/web/CLAUDE.md` keeps the No API
  // Routes rule; AI chat is the bounded transport exception, implemented
  // purely as a rewrite.
  async rewrites() {
    return [
      {
        source: '/api/copilotkit',
        destination: `${backendBase}/api/copilotkit`,
      },
      {
        source: '/api/copilotkit/:path*',
        destination: `${backendBase}/api/copilotkit/:path*`,
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
