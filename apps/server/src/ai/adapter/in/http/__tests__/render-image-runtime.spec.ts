import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('render-image Office runtime image', () => {
  it('builds the Office API image with Chromium enabled for Puppeteer', () => {
    const root = findRepoRoot();
    const deployer = readFileSync(join(root, 'deploy/office/apply-deployment.ps1'), 'utf8');
    const baseWorkflow = readFileSync(
      join(root, '.github/workflows/api-base-image.yml'),
      'utf8',
    );
    const dockerfile = readFileSync(join(root, 'apps/server/Dockerfile'), 'utf8');

    expect(dockerfile).toContain('PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium');
    expect(dockerfile).toContain('test -x "$PUPPETEER_EXECUTABLE_PATH"');
    expect(dockerfile).toContain('"$PUPPETEER_EXECUTABLE_PATH" --version');
    expect(dockerfile).toContain('npm run build --workspace=packages/templates');
    expect(dockerfile).toContain('/app/packages/templates/dist ./packages/templates/dist');
    expect(dockerfile).toContain("require.resolve('@kiditem/templates/styles.css')");
    expect(deployer).toContain('API_RUNTIME_BASE_IMAGE');
    expect(deployer).toContain('node22-chromium-b6503cb2512e');
    expect(dockerfile).toMatch(
      /^ARG API_RUNTIME_BASE_IMAGE=ghcr\.io\/agentfoundry-labs\/kiditem-api-base:node22-chromium-b6503cb2512e$/m,
    );
    expect(baseWorkflow).toContain('${API_BASE_IMAGE}:node22-chromium-${short_sha}');
    expect(baseWorkflow).not.toContain('${API_BASE_IMAGE}:node22-chromium"');
    expect(baseWorkflow).not.toContain('${API_BASE_IMAGE}:node22-chromium-${month}');
    expect(dockerfile).toMatch(
      /npm ci[\s\S]*--omit=dev[\s\S]*npm cache clean --force[\s\S]*rm -rf \/root\/\.npm/,
    );
  });
});

function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'deploy/office/apply-deployment.ps1'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('repo root not found');
    dir = parent;
  }
}
