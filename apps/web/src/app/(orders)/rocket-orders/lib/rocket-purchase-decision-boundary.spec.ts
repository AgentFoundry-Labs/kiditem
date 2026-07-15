import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');

describe('Rocket purchase decision boundary', () => {
  it('redirects legacy Rocket links to the Supply preview without enabling confirmation', () => {
    const routeRoot = resolve(webRoot, 'src/app/(orders)/rocket-orders');
    const pageSource = readFileSync(resolve(routeRoot, 'page.tsx'), 'utf8');
    const previewSource = readFileSync(resolve(
      webRoot,
      'src/app/(supply)/purchase-orders/components/RocketPurchaseWorkspace.tsx',
    ), 'utf8');

    expect(pageSource).toContain("resolveOperationsRedirect('/rocket-orders'");
    expect(pageSource).toContain('redirect(destination)');
    expect(pageSource).not.toMatch(/useQuery|useState|RocketConfirmFileList|listRocketPosFromExtension/);
    expect(previewSource).toContain('미리보기 다시 계산');
    expect(previewSource).toContain('0.1.19에서는 검토만 가능');
    expect(previewSource).not.toMatch(/confirmationFile|reservation|providerSubmit|currentStock\s*=/);
  });
});
