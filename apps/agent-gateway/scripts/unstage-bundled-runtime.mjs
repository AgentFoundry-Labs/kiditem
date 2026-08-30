import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const modules = join(process.cwd(), 'node_modules');
await Promise.all([
  rm(join(modules, '@openai'), { recursive: true, force: true }),
  rm(join(modules, '@anthropic-ai'), { recursive: true, force: true }),
  rm(join(modules, '.kiditem-gateway-pack-staged'), { force: true }),
]);
