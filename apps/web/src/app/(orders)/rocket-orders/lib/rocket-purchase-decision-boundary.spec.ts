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
    const confirmPanelSource = readFileSync(resolve(
      routeRoot,
      'components/RocketConfirmPanel.tsx',
    ), 'utf8');
    const purchaseSource = readFileSync(resolve(
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
    const previewApiSource = readFileSync(resolve(
      webRoot,
      'src/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api.ts',
    ), 'utf8');
    const extensionSource = readFileSync(resolve(
      webRoot,
      '../../extensions/order-collector/background/service-worker.js',
    ), 'utf8');

    expect(pageSource).toContain('RocketOrdersWorkspace');
    // /rocket-orders 의 판단 슬롯은 orders 도메인 발주확정 패널(재고매칭·품절판정·엑셀생성)을 쓴다.
    // supply 도메인 미리보기(RocketPurchasePreviewSection)는 /purchase-orders?tab=rocket 에 그대로 남는다.
    expect(pageSource).toContain('decisionWorkspace={(workspace) =>');
    expect(pageSource).toContain('<RocketConfirmPanel');
    expect(pageSource).toContain('{...workspace}');
    expect(pageSource).not.toContain('RocketPurchaseOrdersWorkspace');
    expect(pageSource).not.toContain('redirect(');
    expect(pageSource).not.toMatch(/useQuery|useState|listRocketPosFromExtension/);
    expect(operationsSource).toContain('쿠팡 로켓 발주');
    expect(operationsSource).toContain("const [status, setStatus] = useState('');");
    expect(operationsSource).toContain('전체 발주 실시간 조회 · 입고예정일별 분류');
    expect(operationsSource).toContain('이 달엔 해당 발주가 없습니다');
    expect(operationsSource).toContain('신규 주문');
    expect(operationsSource).toContain('납품 판단');
    expect(operationsSource).toContain('쉽먼트 / 밀크런');
    expect(operationsSource).toContain('송장 · 출력');
    expect(operationsSource).not.toContain("['week', '주 달력']");
    expect(operationsSource).toContain("['month', '월 달력']");
    expect(operationsSource).toContain("['chart', '차트']");
    expect(confirmPanelSource).toContain('renderOrderExplorer({');
    expect(operationsSource).toContain('selectedDay &&');
    expect(operationsSource).not.toContain('visibleDates.map');
    expect(operationsSource).toContain('<RocketConfirmFileList');
    expect(purchaseSource).toContain('로켓 발주 수량 검토');
    expect(purchaseSource).toContain('<RocketPurchasePreviewSection />');
    expect(purchaseSource).not.toContain('RocketOrdersWorkspace');
    expect(operationsSource).toContain('decisionWorkspace({');
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
