import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('render-image staging runtime', () => {
  it('builds the staging API image with Chromium enabled for Puppeteer render-image', () => {
    const root = findRepoRoot();
    const workflow = readFileSync(join(root, '.github/workflows/staging-deploy.yml'), 'utf8');
    const dockerfile = readFileSync(join(root, 'apps/server/Dockerfile'), 'utf8');
    const deployScript = readFileSync(join(root, 'deploy/staging/remote-deploy.sh'), 'utf8');
    const localDeployScript = readFileSync(join(root, 'bin/deploy-staging.sh'), 'utf8');

    expect(dockerfile).toContain('PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium');
    expect(workflow).toContain('INSTALL_CHROMIUM=true');
    expect(localDeployScript).toContain('INSTALL_CHROMIUM="${INSTALL_CHROMIUM:-true}"');
    expect(deployScript).toContain('verify_render_image_runtime');
    expect(deployScript).toContain('puppeteer.launch');
  });
});

function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, '.github/workflows/staging-deploy.yml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('repo root not found');
    dir = parent;
  }
}
