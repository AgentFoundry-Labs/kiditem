import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const packageRoot = process.cwd();
const workspaceRoot = resolve(packageRoot, '../..');
const sourceModules = join(workspaceRoot, 'node_modules');
const targetModules = join(packageRoot, 'node_modules');
const marker = join(targetModules, '.kiditem-runner-pack-staged');

const target = platformPackageSuffix();
await rm(marker, { force: true });
await stage('@anthropic-ai/claude-code', '@anthropic-ai/claude-code');
await stage('@openai/codex', '@openai/codex');
// Codex's JS entrypoint resolves this exact platform package at runtime.
await stage(`@openai/codex-${target}`, `@openai/codex/node_modules/@openai/codex-${target}`);
await writeFile(marker, 'staged by prepack\n');

async function stage(sourcePackage, targetPackage) {
  const source = packagePath(sourceModules, sourcePackage);
  await access(source);
  const targetPath = packagePath(targetModules, targetPackage);
  await mkdir(dirname(targetPath), { recursive: true });
  await rm(targetPath, { recursive: true, force: true });
  await cp(source, targetPath, { recursive: true, dereference: true });
}

function packagePath(root, packageName) { return join(root, ...packageName.split('/')); }

function platformPackageSuffix() {
  const mapping = {
    'darwin-arm64': 'darwin-arm64', 'darwin-x64': 'darwin-x64',
    'win32-arm64': 'win32-arm64', 'win32-x64': 'win32-x64',
  };
  const value = mapping[`${process.platform}-${process.arch}`];
  if (!value) throw new Error('runner_pack_platform_unsupported');
  return value;
}
