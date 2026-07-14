import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');

describe('Rocket purchase decision boundary', () => {
  it('keeps PO reads and history while deferring preview, generation, and reservation', () => {
    const routeRoot = resolve(webRoot, 'src/app/(orders)/rocket-orders');
    const pageSource = readFileSync(resolve(routeRoot, 'page.tsx'), 'utf8');
    const apiSource = readFileSync(resolve(routeRoot, 'lib/rocket-confirm-api.ts'), 'utf8');
    const historySource = readFileSync(resolve(routeRoot, 'components/RocketConfirmFileList.tsx'), 'utf8');
    const panelPath = resolve(routeRoot, 'components/RocketConfirmPanel.tsx');

    expect(pageSource).toContain('납품 수량 판단은 추후 연동합니다.');
    expect(pageSource).toContain('RocketConfirmFileList');
    expect(pageSource).not.toContain('RocketConfirmPanel');
    expect(apiSource).toContain('listRocketPosFromExtension');
    expect(apiSource).not.toContain('/api/orders/rocket/confirm-');
    expect(historySource).toContain('기존 발주확정 파일 이력');
    expect(existsSync(panelPath)).toBe(false);
  });
});
