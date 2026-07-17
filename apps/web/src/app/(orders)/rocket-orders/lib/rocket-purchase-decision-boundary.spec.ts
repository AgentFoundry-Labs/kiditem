import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');

describe('Rocket purchase decision boundary', () => {
  it('preserves the Rocket operations shell while keeping confirmation in the Supply boundary', () => {
    const routeRoot = resolve(webRoot, 'src/app/(orders)/rocket-orders');
    const pageSource = readFileSync(resolve(routeRoot, 'page.tsx'), 'utf8');
    const operationsSource = readFileSync(resolve(
      routeRoot,
      'components/RocketOrdersWorkspace.tsx',
    ), 'utf8');
    const purchaseWorkspaceSource = readFileSync(resolve(
      webRoot,
      'src/app/(supply)/purchase-orders/components/PurchaseOrdersWorkspace.tsx',
    ), 'utf8');
    const previewSectionSource = readFileSync(resolve(
      webRoot,
      'src/app/(supply)/purchase-orders/components/RocketPurchasePreviewSection.tsx',
    ), 'utf8');
    const previewSource = readFileSync(resolve(
      webRoot,
      'src/app/(supply)/purchase-orders/components/RocketPurchaseWorkspace.tsx',
    ), 'utf8');
    const previewApiSource = readFileSync(resolve(
      webRoot,
      'src/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api.ts',
    ), 'utf8');
    const extensionSource = readFileSync(resolve(
      webRoot,
      '../../extensions/order-collector/background/service-worker.js',
    ), 'utf8');

    expect(pageSource).toContain('RocketOrdersWorkspace');
    expect(pageSource).toContain('decisionWorkspace={<RocketPurchasePreviewSection />');
    expect(pageSource).not.toContain('RocketPurchaseOrdersWorkspace');
    expect(pageSource).not.toContain('redirect(');
    expect(pageSource).not.toMatch(/useQuery|useState|listRocketPosFromExtension/);
    expect(operationsSource).toContain('쿠팡 로켓 발주');
    expect(operationsSource).toContain("const [status, setStatus] = useState('');");
    expect(operationsSource).toContain('전체 발주 실시간 조회 · 입고예정일별 분류');
    expect(operationsSource).toContain('해당 조건의 발주가 없습니다');
    expect(operationsSource).toContain('신규 주문');
    expect(operationsSource).toContain('납품 판단');
    expect(operationsSource).toContain('쉽먼트 / 밀크런');
    expect(operationsSource).toContain('송장 · 출력');
    expect(operationsSource).toContain("['week', '주 달력']");
    expect(operationsSource).toContain("['month', '월 달력']");
    expect(operationsSource).toContain("['chart', '차트']");
    expect(operationsSource).toContain('<RocketConfirmFileList');
    expect(purchaseWorkspaceSource).not.toContain('RocketPurchaseOrdersWorkspace');
    expect(purchaseWorkspaceSource).not.toContain("activeTab === 'rocket'");
    expect(operationsSource).toContain('{decisionWorkspace}');
    expect(operationsSource).not.toContain('납품 수량 판단은 추후 연동합니다');
    expect(operationsSource).not.toContain('재고 매핑 기반 판단은 추후 연동');
    expect(previewSectionSource).toContain('<RocketPurchaseWorkspace');
    expect(previewSource).toContain('미리보기 다시 계산');
    expect(previewSource).toContain('확정 후 엑셀 다운로드');
    expect(previewSource).toContain('releaseRocketPurchaseConfirmation');
    expect(previewSource).not.toMatch(/providerSubmit|currentStock\s*=/);
    expect(previewApiSource).toContain("action: 'confirmRocket'");
    expect(previewApiSource).toContain("action: 'releaseRocketConfirmation'");
    expect(previewApiSource).not.toContain('/api/orders/rocket');
    expect(extensionSource).toContain('collectRocketPoRowsEvidenceV1: true');
    expect(extensionSource).toContain('collectRocketPoRowsConfirmationV1: true');
    expect(extensionSource).toContain('collectSellpiaInventoryV2: true');
  });
});
