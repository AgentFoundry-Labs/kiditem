import { existsSync, readFileSync } from 'node:fs';
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
    const previewWorkflowSource = readFileSync(resolve(
      webRoot,
      'src/app/(supply)/purchase-orders/hooks/useRocketPurchaseWorkflow.ts',
    ), 'utf8');
    const previewApiSource = readFileSync(resolve(
      webRoot,
      'src/app/(supply)/purchase-orders/lib/rocket-purchase-preview-api.ts',
    ), 'utf8');
    const extensionSource = readFileSync(resolve(
      webRoot,
      '../../extensions/order-collector/background/service-worker.js',
    ), 'utf8');

    // 사용자 원본(03123c2f) 달력 데이터 경로 복원: 저장 발주(rocket_purchase_orders)
    // 달력 공급을 위해 RocketConfirmPanel + rocket-confirm-api 를 되살렸다.
    expect(existsSync(resolve(routeRoot, 'components/RocketConfirmPanel.tsx'))).toBe(true);
    expect(existsSync(resolve(routeRoot, 'lib/rocket-confirm-api.ts'))).toBe(true);

    expect(pageSource).toContain('RocketOrdersWorkspace');
    // page 는 decisionWorkspace 렌더프롭으로 RocketConfirmPanel 을 주입한다.
    expect(pageSource).toContain('decisionWorkspace');
    expect(pageSource).toContain('RocketConfirmPanel');
    expect(pageSource).not.toContain('RocketPurchasePreviewSection');
    expect(pageSource).not.toContain('RocketPurchaseOrdersWorkspace');
    expect(pageSource).not.toContain('redirect(');
    expect(pageSource).not.toMatch(/useQuery|useState|listRocketPosFromExtension/);
    expect(operationsSource).toContain('쿠팡 로켓 발주');
    expect(operationsSource).toContain("const [status, setStatus] = useState('');");
    // 데이터 소스는 저장된 발주(listSavedRocketPos) 기준으로 통일한다.
    expect(operationsSource).toContain('수집·저장된 발주 조회 · 입고예정일별 분류');
    expect(operationsSource).toContain('listSavedRocketPos');
    expect(operationsSource).not.toContain('listRocketPosFromExtension');
    // 저장 발주 빈 상태 문구는 양쪽 워크스페이스 판본에 공통으로 존재하는 문구를 기준으로 검증한다.
    expect(operationsSource).toContain('이 달엔 해당 발주가 없습니다');
    expect(operationsSource).toContain('신규 주문');
    expect(operationsSource).toContain('납품 판단');
    expect(operationsSource).toContain('쉽먼트 / 밀크런');
    expect(operationsSource).toContain('송장 · 출력');
    expect(operationsSource).not.toContain("['week', '주 달력']");
    expect(operationsSource).toContain("['month', '월 달력']");
    expect(operationsSource).toContain("['chart', '차트']");
    expect(operationsSource).toContain('selectedDay &&');
    expect(operationsSource).not.toContain('visibleDates.map');
    expect(operationsSource).toContain('<RocketConfirmFileList');
    // supply 워크스페이스는 로켓 탭을 더 이상 소유하지 않는다.
    expect(purchaseWorkspaceSource).not.toContain('RocketPurchaseOrdersWorkspace');
    expect(purchaseWorkspaceSource).not.toContain("activeTab === 'rocket'");
    expect(purchaseWorkspaceSource).not.toContain('RocketOrdersWorkspace');
    // orders 워크스페이스는 Supply 미리보기를 직접 렌더하고, decisionWorkspace
    // 렌더프롭으로 원본 확정 패널(저장 발주 달력 공급)을 주입한다.
    expect(operationsSource).toContain('decisionWorkspace');
    expect(operationsSource).toContain('<RocketPurchasePreviewSection');
    expect(operationsSource).toContain('savedSourceImportRunId={selectedSavedSourceImportRunId}');
    expect(operationsSource).not.toContain('납품 수량 판단은 추후 연동합니다');
    expect(operationsSource).not.toContain('재고 매핑 기반 판단은 추후 연동');
    expect(previewSectionSource).toContain('<RocketPurchaseWorkspace');
    expect(previewSectionSource).not.toContain('<RocketInventoryCommitmentList');
    expect(previewSource).toContain('미리보기 다시 계산');
    expect(previewSource).toContain('확정 후 엑셀 다운로드');
    expect(previewWorkflowSource).toContain('releaseRocketPurchaseConfirmation');
    expect(previewWorkflowSource).toContain('loadSavedRocketCollection');
    expect(previewSource).not.toMatch(/providerSubmit|currentStock\s*=/);
    expect(previewApiSource).toContain("action: 'confirmRocket'");
    expect(previewApiSource).toContain("action: 'releaseRocketConfirmation'");
    expect(previewApiSource).toContain("action: 'listSavedRocketPos'");
    expect(previewApiSource).toContain("action: 'loadSavedRocketCollection'");
    expect(previewApiSource).not.toContain('/api/orders/rocket');
    expect(extensionSource).toContain('collectRocketPoRowsEvidenceV1: true');
    expect(extensionSource).toContain('collectRocketPoRowsConfirmationV1: true');
    expect(extensionSource).toContain('collectSellpiaInventoryV2: true');
  });
});
