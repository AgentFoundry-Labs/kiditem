import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');

describe('Rocket purchase decision boundary', () => {
  it('preserves the full Rocket operations UI at the canonical destination without enabling confirmation', () => {
    const routeRoot = resolve(webRoot, 'src/app/(orders)/rocket-orders');
    const pageSource = readFileSync(resolve(routeRoot, 'page.tsx'), 'utf8');
    const operationsSource = readFileSync(resolve(
      routeRoot,
      'components/RocketOrdersWorkspace.tsx',
    ), 'utf8');
    const canonicalSource = readFileSync(resolve(
      webRoot,
      'src/app/(supply)/purchase-orders/components/RocketPurchaseOrdersWorkspace.tsx',
    ), 'utf8');
    const previewSectionSource = readFileSync(resolve(
      webRoot,
      'src/app/(supply)/purchase-orders/components/RocketPurchasePreviewSection.tsx',
    ), 'utf8');
    const previewSource = readFileSync(resolve(
      webRoot,
      'src/app/(supply)/purchase-orders/components/RocketPurchaseWorkspace.tsx',
    ), 'utf8');

    expect(pageSource).toContain('RocketPurchaseOrdersWorkspace');
    expect(pageSource).not.toContain('redirect(');
    expect(pageSource).not.toMatch(/useQuery|useState|listRocketPosFromExtension/);
    expect(operationsSource).toContain('쿠팡 로켓 발주');
    expect(operationsSource).toContain('신규 주문');
    expect(operationsSource).toContain('납품 판단 대기');
    expect(operationsSource).toContain('쉽먼트 / 밀크런');
    expect(operationsSource).toContain('송장 · 출력');
    expect(operationsSource).toContain("['week', '주 달력']");
    expect(operationsSource).toContain("['month', '월 달력']");
    expect(operationsSource).toContain("['chart', '차트']");
    expect(operationsSource).toContain('<RocketConfirmFileList');
    expect(canonicalSource).toContain('<RocketOrdersWorkspace');
    expect(canonicalSource).toContain('<RocketPurchasePreviewSection');
    expect(previewSectionSource).toContain('<RocketPurchaseWorkspace');
    expect(previewSource).toContain('미리보기 다시 계산');
    expect(previewSource).toContain('0.1.19에서는 검토만 가능');
    expect(previewSource).not.toMatch(/confirmationFile|reservation|providerSubmit|currentStock\s*=/);
  });
});
