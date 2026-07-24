import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) return productionSources(absolute);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.(spec|test)\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return [readFileSync(absolute, 'utf8')];
  });
}

describe('Rocket purchase decision boundary', () => {
  it('preserves the Rocket operations shell while keeping workbook export in the Supply boundary', () => {
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
    const canonicalWorkbookSource = `${confirmPanelSource}\n${previewWorkflowSource}`;

    // 사용자 원본(03123c2f) 화면은 유지하되, 워크북 데이터 경로는 Supply의
    // 계정 범위 canonical workflow 하나만 사용한다.
    expect(existsSync(resolve(routeRoot, 'components/RocketConfirmPanel.tsx'))).toBe(true);
    expect(existsSync(resolve(routeRoot, 'lib/rocket-confirm-api.ts'))).toBe(false);
    expect(productionSources(routeRoot).join('\n')).not.toContain('/api/orders/rocket');

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
    expect(operationsSource).toContain('selectedRocketAccountId');
    expect(operationsSource).toContain('selectedSourceImportRunId');
    expect(operationsSource).toContain('sourceImportRunId');
    expect(operationsSource).toContain('이 수집본으로 납품 판단');
    // 저장 발주 빈 상태 문구는 양쪽 워크스페이스 판본에 공통으로 존재하는 문구를 기준으로 검증한다.
    expect(operationsSource).toContain('이 달엔 해당 발주가 없습니다');
    // 상단 워크플로 STEP 4카드(신규주문·납품판단·쉽먼트/밀크런·송장출력)는 사용자 요청으로 제거됨.
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
    // orders 워크스페이스는 '발주 미리보기' 카드(RocketPurchasePreviewSection)를 더 이상
    // 렌더하지 않는다(사용자 요청 제거). 대신 활성 로켓 계정만 백그라운드로 선택
    // (RocketAccountBootstrap)해 달력·발주목록·차트에 공급하고, decisionWorkspace
    // 렌더프롭으로 원본 워크북 패널(저장 발주 달력 공급)을 주입한다.
    expect(operationsSource).toContain('decisionWorkspace');
    expect(operationsSource).not.toContain('<RocketPurchasePreviewSection');
    expect(operationsSource).toContain('<RocketAccountBootstrap');
    expect(operationsSource).not.toContain('납품 수량 판단은 추후 연동합니다');
    expect(operationsSource).not.toContain('재고 매핑 기반 판단은 추후 연동');
    expect(confirmPanelSource).toContain('useRocketPurchaseWorkflow');
    expect(confirmPanelSource).toContain('channelAccountId');
    expect(confirmPanelSource).toContain('savedSourceImportRunId');
    expect(confirmPanelSource).toContain('revalidateEditedQuantities');
    expect(confirmPanelSource).toContain('setPreviewDirty(true)');
    expect(canonicalWorkbookSource).toContain('globalThis.crypto.randomUUID()');
    expect(canonicalWorkbookSource).toContain('editedQuantities: reviewedQuantities');
    expect(canonicalWorkbookSource).toContain('shortageReasons');
    expect(canonicalWorkbookSource).not.toMatch(
      /matchRocketStock|exportStockWorkbook|allowMissingConfirmation|재고 기준 엑셀/,
    );
    expect(canonicalWorkbookSource).toContain('exportRocketWorkbook');
    expect(canonicalWorkbookSource).toContain('downloadActiveWorkbook');
    expect(canonicalWorkbookSource).toContain('getActiveRocketWorkbook');
    expect(canonicalWorkbookSource).toContain('abandonRocketWorkbook');
    expect(canonicalWorkbookSource).not.toMatch(
      /RocketInventoryCommitmentList|activeCommitmentQuantity|availableStock|재고 예약|예약 확정/,
    );
    expect(confirmPanelSource).not.toContain('previewSavedRocketConfirm');
    expect(confirmPanelSource).not.toContain('commitRocketConfirmRows');
    expect(previewSectionSource).toContain('<RocketPurchaseWorkspace');
    expect(previewSectionSource).not.toContain('<RocketInventoryCommitmentList');
    expect(previewSource).toContain('미리보기 다시 계산');
    expect(previewSource).toContain('쿠팡 엑셀 다운로드');
    expect(previewSource).toContain('동일 파일 다시 다운로드');
    expect(previewWorkflowSource).toContain('loadSavedRocketCollection');
    expect(previewSource).not.toMatch(/providerSubmit|currentStock\s*=/);
    expect(previewApiSource).toContain("formData.append('action', 'exportRocketWorkbook')");
    expect(previewApiSource).toContain("action: 'getActiveRocketWorkbook'");
    expect(previewApiSource).toContain("action: 'downloadRocketWorkbook'");
    expect(previewApiSource).toContain("action: 'abandonRocketWorkbook'");
    expect(previewApiSource).toContain("action: 'listSavedRocketPos'");
    expect(previewApiSource).toContain("action: 'loadSavedRocketCollection'");
    expect(previewApiSource).not.toMatch(/confirmRocket|releaseRocketConfirmation/);
    expect(previewApiSource).not.toContain('/api/orders/rocket');
    expect(extensionSource).toContain('collectRocketPoRowsEvidenceV1: true');
    expect(extensionSource).toContain('collectRocketPoRowsConfirmationV1: true');
    expect(extensionSource).toContain('collectSellpiaInventoryJsonV1: true');
  });
});
