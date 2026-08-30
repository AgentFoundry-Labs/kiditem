import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..');

const retiredPaths = [
  '.github/workflows/staging-db.yml',
  '.github/workflows/staging-deploy.yml',
  '.github/workflows/production-deploy.yml',
  'deploy/staging',
  'deploy/production',
  'deploy/shared',
  'docker-compose.staging.yml',
  'docker-compose.production.yml',
  'infra/terraform',
  'docs/runbooks/staging-db-baseline.md',
  'docs/runbooks/staging-deploy.md',
  'docs/runbooks/staging-seed-data.md',
  'docs/runbooks/production-deploy.md',
  'docs/runbooks/storage-cache-control.md',
  'scripts/staging-db-baseline.ts',
  'scripts/storage-cache-control.ts',
  'tools/codex/skills/staging-deploy-operator',
];

describe('retired hosted deployment environments', () => {
  it('does not expose staging or unused production infrastructure', () => {
    for (const relativePath of retiredPaths) {
      expect(existsSync(join(repoRoot, relativePath)), relativePath).toBe(false);
    }

    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).not.toHaveProperty('staging:db');
    expect(packageJson.scripts).not.toHaveProperty('storage:cache-control');
    expect(packageJson.dependencies).not.toHaveProperty('@supabase/supabase-js');
    expect(packageJson.devDependencies).not.toHaveProperty('@supabase/supabase-js');
  });

  it('keeps Office as the only deployable runtime surface', () => {
    expect(existsSync(join(repoRoot, '.github/workflows/office-images.yml'))).toBe(false);
    expect(existsSync(join(repoRoot, 'deploy/office/compose.office.yml'))).toBe(true);
    expect(existsSync(join(repoRoot, 'deploy/office/apply-deployment.ps1'))).toBe(true);
    expect(existsSync(join(repoRoot, 'scripts/office-deploy.mjs'))).toBe(true);
  });

  it('does not advertise the deleted hosted origins to the browser extension', () => {
    const manifest = readFileSync(
      join(repoRoot, 'extensions/kiditem-os/manifest.json'),
      'utf8',
    );

    expect(manifest).not.toContain('gheoobctiarluauprvro');
    expect(manifest).not.toContain('staging.merchon.org');
    expect(manifest).not.toContain('staging.kiditem.ai');
  });
});
