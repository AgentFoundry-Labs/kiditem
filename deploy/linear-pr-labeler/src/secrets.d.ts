// Secrets are set with `wrangler secret put` and are not in wrangler.jsonc,
// so `wrangler types` cannot see them. They may be missing on a fresh deploy.
interface WorkerSecrets {
  LINEAR_WEBHOOK_SECRET?: string;
  LINEAR_API_KEY?: string;
  GITHUB_TOKEN?: string;
}

interface Env extends WorkerSecrets {}

declare namespace Cloudflare {
  interface Env extends WorkerSecrets {}
}
