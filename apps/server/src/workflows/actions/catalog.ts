import type { ActionDefinition } from './types';

export const ACTION_CATALOG: ActionDefinition[] = [
  // ─── 상품 액션 ──────────────────────────────────────────────────────────────

  {
    type: 'product.view_detail',
    label: '상품 상세 보기',
    description: '상품의 전체 정보, 재고, 광고, 리뷰 현황을 확인합니다.',
    objectType: 'product',
    conditions: [],
    params: [{ key: 'productId', label: '상품 ID', type: 'string', required: true }],
    executor: 'navigate',
    executorConfig: { path: '/products/{productId}' },
  },
  // product.adjust_price / stop_ads / discontinue / change_grade are removed in the
  // product-contract rewire. They used `PUT /api/products/{productId}` which is no
  // longer registered (spec §3.4 — legacy alias is GET-only in this slice), so keeping
  // the entries would cause LLM-generated plans + frontend handleAction to invoke a
  // 404 at runtime. Canonical replacements land with the agent/workflow redesign — see
  // TODOS.md "Agent/Workflow 재설계 — 제품 액션 계약". The frontend retains the action
  // buttons with a "기능 준비 중" toast until then.

  // ─── 재고/발주 액션 ─────────────────────────────────────────────────────────

  {
    type: 'inventory.create_purchase_order',
    label: '발주서 생성',
    description: '재고 부족 상품에 대한 발주서를 생성합니다.',
    objectType: 'product',
    conditions: [{ field: 'currentStock', operator: 'lte', value: 'reorderPoint' }],
    params: [
      { key: 'productId', label: '상품 ID', type: 'string', required: true },
      { key: 'quantity', label: '발주 수량', type: 'number', required: true },
    ],
    executor: 'navigate',
    executorConfig: { path: '/purchase-orders/new?productId={productId}&quantity={quantity}' },
  },

  // ─── 워크플로우 액션 ────────────────────────────────────────────────────────

  {
    type: 'workflow.run',
    label: '워크플로우 실행',
    description: '다른 워크플로우를 실행합니다.',
    objectType: 'company',
    conditions: [],
    params: [{ key: 'workflowModule', label: '워크플로우 모듈', type: 'string', required: true }],
    executor: 'workflow',
    executorConfig: {},
  },

  // ─── 알림 액션 ──────────────────────────────────────────────────────────────

  {
    type: 'alert.create',
    label: '주의 알림 생성',
    description: '특정 상품이나 상황에 대한 주의 알림을 생성합니다.',
    objectType: 'product',
    conditions: [],
    params: [
      { key: 'productId', label: '상품 ID', type: 'string' },
      { key: 'title', label: '알림 제목', type: 'string', required: true },
      { key: 'severity', label: '심각도', type: 'select', options: [
        { value: 'info', label: '정보' }, { value: 'warning', label: '경고' }, { value: 'critical', label: '긴급' },
      ]},
    ],
    executor: 'api_call',
    executorConfig: { method: 'POST', path: '/api/alerts', body: { title: '{title}', severity: '{severity}' } },
  },

  // ─── 리포트 액션 ────────────────────────────────────────────────────────────

  {
    type: 'report.export_excel',
    label: '엑셀 다운로드',
    description: '현재 화면의 데이터를 엑셀 파일로 다운로드합니다.',
    objectType: 'company',
    conditions: [],
    params: [],
    executor: 'client_action',
    executorConfig: { action: 'excel_download' },
  },
];

export const ACTION_CATALOG_MAP = new Map(
  ACTION_CATALOG.map((a) => [a.type, a]),
);

export function getActionsForPrompt(): string {
  return ACTION_CATALOG.map((a) =>
    `- type: "${a.type}" | label: "${a.label}" | 대상: ${a.objectType} | 설명: ${a.description} | params: [${a.params.map((p) => `${p.key}(${p.type}${p.required ? ', 필수' : ''})`).join(', ')}]`,
  ).join('\n');
}
