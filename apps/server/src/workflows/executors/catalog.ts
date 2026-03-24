import type { NodeDefinition } from './types';

const TRIGGER_COLOR = '#8b5cf6';
const COUPANG_COLOR = '#e11d48';
const NAVER_COLOR = '#03c75a';
const DATA_COLOR = '#0ea5e9';
const CONDITION_COLOR = '#f59e0b';
const CALCULATE_COLOR = '#6366f1';
const NOTIFICATION_COLOR = '#f97316';
const INTERNAL_COLOR = '#64748b';
const EXPORT_COLOR = '#10b981';
const AGENT_COLOR = '#a855f7';
const AI_COLOR = '#ec4899';

export const NODE_CATALOG: NodeDefinition[] = [
  // ─── trigger ───
  {
    type: 'trigger.manual',
    category: 'trigger',
    label: '수동 실행',
    description: '사용자가 직접 워크플로우를 실행합니다.',
    icon: 'Play',
    color: TRIGGER_COLOR,
    configSchema: [],
    outputSchema: [
      { key: 'triggeredAt', type: 'string', description: '실행 시각 (ISO 8601)' },
    ],
  },
  {
    type: 'trigger.schedule',
    category: 'trigger',
    label: '스케줄',
    description: 'cron 표현식 기반 정기 실행.',
    icon: 'Clock',
    color: TRIGGER_COLOR,
    configSchema: [
      { key: 'cron', label: 'Cron 표현식', type: 'cron', required: true, placeholder: '0 9 * * *' },
    ],
    outputSchema: [
      { key: 'triggeredAt', type: 'string', description: '실행 시각 (ISO 8601)' },
    ],
  },
  {
    type: 'trigger.event',
    category: 'trigger',
    label: '이벤트 감지',
    description: '특정 이벤트 발생 시 자동 실행.',
    icon: 'Zap',
    color: TRIGGER_COLOR,
    configSchema: [
      { key: 'eventType', label: '이벤트 유형', type: 'select', required: true, options: [
        { value: 'order.created', label: '주문 생성' },
        { value: 'order.shipped', label: '출고 완료' },
        { value: 'review.created', label: '리뷰 등록' },
        { value: 'stock.low', label: '재고 부족' },
        { value: 'product.updated', label: '상품 변경' },
      ]},
      { key: 'sourceModel', label: '소스 모델', type: 'text', placeholder: 'order' },
      { key: 'conditions', label: '추가 조건', type: 'json' },
    ],
    outputSchema: [
      { key: 'event', type: 'object', description: '트리거된 이벤트 데이터' },
      { key: 'triggeredAt', type: 'string', description: '실행 시각 (ISO 8601)' },
    ],
  },

  // ─── coupang ───
  {
    type: 'coupang.orders.fetch',
    category: 'coupang',
    label: '쿠팡 주문 조회',
    description: '쿠팡 API에서 주문 목록을 조회합니다.',
    icon: 'ShoppingCart',
    color: COUPANG_COLOR,
    configSchema: [
      { key: 'credential', label: 'API 인증 정보', type: 'credential', required: true },
      { key: 'period', label: '조회 기간 (일)', type: 'number', defaultValue: 7, placeholder: '7' },
      { key: 'status', label: '주문 상태', type: 'select', options: [
        { value: 'all', label: '전체' },
        { value: 'pay_complete', label: '결제 완료' },
        { value: 'instruct', label: '발송 지시' },
        { value: 'shipping', label: '배송 중' },
        { value: 'delivered', label: '배송 완료' },
      ]},
    ],
    outputSchema: [
      { key: 'orders', type: 'StandardOrder[]', description: '주문 목록' },
      { key: 'count', type: 'number', description: '주문 수' },
    ],
  },
  {
    type: 'coupang.orders.confirm',
    category: 'coupang',
    label: '주문 확인 처리',
    description: '쿠팡 주문을 확인 처리합니다.',
    icon: 'CheckCircle',
    color: COUPANG_COLOR,
    configSchema: [
      { key: 'credential', label: 'API 인증 정보', type: 'credential', required: true },
      { key: 'orderIds', label: '주문 ID 소스 노드', type: 'text', required: true, placeholder: '이전 노드 ID' },
    ],
    outputSchema: [
      { key: 'confirmed', type: 'number', description: '확인 완료 건수' },
      { key: 'failed', type: 'number', description: '실패 건수' },
    ],
  },
  {
    type: 'coupang.tracking.upload',
    category: 'coupang',
    label: '송장 업로드',
    description: '쿠팡에 운송장 번호를 업로드합니다.',
    icon: 'Truck',
    color: COUPANG_COLOR,
    configSchema: [
      { key: 'credential', label: 'API 인증 정보', type: 'credential', required: true },
      { key: 'trackingData', label: '송장 데이터 소스 노드', type: 'text', required: true, placeholder: '이전 노드 ID' },
    ],
    outputSchema: [
      { key: 'uploaded', type: 'number', description: '업로드 성공 건수' },
      { key: 'failed', type: 'number', description: '실패 건수' },
    ],
  },
  {
    type: 'coupang.products.fetch',
    category: 'coupang',
    label: '상품 목록 조회',
    description: '쿠팡에 등록된 상품 목록을 조회합니다.',
    icon: 'Package',
    color: COUPANG_COLOR,
    configSchema: [
      { key: 'credential', label: 'API 인증 정보', type: 'credential', required: true },
      { key: 'status', label: '상품 상태', type: 'select', options: [
        { value: 'all', label: '전체' },
        { value: 'active', label: '판매중' },
        { value: 'inactive', label: '판매 중지' },
      ]},
    ],
    outputSchema: [
      { key: 'products', type: 'StandardProduct[]', description: '상품 목록' },
      { key: 'count', type: 'number', description: '상품 수' },
    ],
  },
  {
    type: 'coupang.ads.fetch',
    category: 'coupang',
    label: '광고 실적 조회',
    description: '쿠팡 광고 실적 데이터를 조회합니다.',
    icon: 'TrendingUp',
    color: COUPANG_COLOR,
    configSchema: [
      { key: 'credential', label: 'API 인증 정보', type: 'credential', required: true },
      { key: 'date', label: '조회 일자', type: 'text', required: true, placeholder: 'YYYY-MM-DD' },
      { key: 'campaignIds', label: '캠페인 ID (콤마 구분)', type: 'text' },
    ],
    outputSchema: [
      { key: 'ads', type: 'StandardAd[]', description: '광고 실적 목록' },
      { key: 'count', type: 'number', description: '광고 수' },
    ],
  },
  {
    type: 'coupang.reviews.fetch',
    category: 'coupang',
    label: '리뷰 수집',
    description: '쿠팡 상품 리뷰를 수집합니다.',
    icon: 'MessageSquare',
    color: COUPANG_COLOR,
    configSchema: [
      { key: 'credential', label: 'API 인증 정보', type: 'credential', required: true },
      { key: 'productIds', label: '상품 ID (콤마 구분)', type: 'text', required: true },
    ],
    outputSchema: [
      { key: 'reviews', type: 'StandardReview[]', description: '리뷰 목록' },
      { key: 'count', type: 'number', description: '리뷰 수' },
    ],
  },

  // ─── naver ───
  {
    type: 'naver.orders.fetch',
    category: 'naver',
    label: '네이버 주문 조회',
    description: '네이버 커머스 API에서 주문 목록을 조회합니다.',
    icon: 'ShoppingCart',
    color: NAVER_COLOR,
    configSchema: [
      { key: 'credential', label: 'API 인증 정보', type: 'credential', required: true },
      { key: 'period', label: '조회 기간 (일)', type: 'number', defaultValue: 7, placeholder: '7' },
      { key: 'status', label: '주문 상태', type: 'select', options: [
        { value: 'all', label: '전체' },
        { value: 'payed', label: '결제 완료' },
        { value: 'delivering', label: '배송 중' },
        { value: 'delivered', label: '배송 완료' },
      ]},
    ],
    outputSchema: [
      { key: 'orders', type: 'StandardOrder[]', description: '주문 목록' },
      { key: 'count', type: 'number', description: '주문 수' },
    ],
  },
  {
    type: 'naver.reviews.fetch',
    category: 'naver',
    label: '네이버 리뷰 수집',
    description: '네이버 스토어 리뷰를 수집합니다.',
    icon: 'MessageSquare',
    color: NAVER_COLOR,
    configSchema: [
      { key: 'credential', label: 'API 인증 정보', type: 'credential', required: true },
      { key: 'productIds', label: '상품 ID (콤마 구분)', type: 'text', required: true },
    ],
    outputSchema: [
      { key: 'reviews', type: 'StandardReview[]', description: '리뷰 목록' },
      { key: 'count', type: 'number', description: '리뷰 수' },
    ],
  },

  // ─── data ───
  {
    type: 'data.filter',
    category: 'data',
    label: '데이터 필터',
    description: '이전 노드의 데이터를 조건에 따라 필터링합니다.',
    icon: 'Filter',
    color: DATA_COLOR,
    configSchema: [
      { key: 'source_node', label: '소스 노드', type: 'text', required: true },
      { key: 'source_key', label: '소스 키', type: 'text', defaultValue: 'rows' },
      { key: 'filter_field', label: '필터 필드', type: 'text', required: true },
      { key: 'filter_operator', label: '연산자', type: 'select', required: true, options: [
        { value: 'eq', label: '같음 (=)' },
        { value: 'gt', label: '초과 (>)' },
        { value: 'lt', label: '미만 (<)' },
        { value: 'gte', label: '이상 (>=)' },
        { value: 'lte', label: '이하 (<=)' },
        { value: 'contains', label: '포함' },
      ]},
      { key: 'filter_value', label: '비교 값', type: 'text', required: true },
    ],
    outputSchema: [
      { key: 'rows', type: 'any[]', description: '필터 결과' },
      { key: 'count', type: 'number', description: '결과 건수' },
      { key: 'filteredOut', type: 'number', description: '제외된 건수' },
    ],
  },
  {
    type: 'data.sort',
    category: 'data',
    label: '정렬',
    description: '데이터를 지정 필드로 정렬합니다.',
    icon: 'ArrowUpDown',
    color: DATA_COLOR,
    configSchema: [
      { key: 'source_node', label: '소스 노드', type: 'text', required: true },
      { key: 'source_key', label: '소스 키', type: 'text', defaultValue: 'rows' },
      { key: 'sort_field', label: '정렬 필드', type: 'text', required: true },
      { key: 'sort_order', label: '정렬 방향', type: 'select', defaultValue: 'asc', options: [
        { value: 'asc', label: '오름차순' },
        { value: 'desc', label: '내림차순' },
      ]},
    ],
    outputSchema: [
      { key: 'rows', type: 'any[]', description: '정렬 결과' },
      { key: 'count', type: 'number', description: '결과 건수' },
    ],
  },
  {
    type: 'data.aggregate',
    category: 'data',
    label: '집계',
    description: '데이터를 그룹화하고 집계합니다.',
    icon: 'BarChart3',
    color: DATA_COLOR,
    configSchema: [
      { key: 'source_node', label: '소스 노드', type: 'text', required: true },
      { key: 'source_key', label: '소스 키', type: 'text', defaultValue: 'rows' },
      { key: 'group_by', label: '그룹 필드', type: 'text', required: true },
      { key: 'agg_field', label: '집계 필드', type: 'text', required: true },
      { key: 'agg_type', label: '집계 방식', type: 'select', required: true, options: [
        { value: 'sum', label: '합계' },
        { value: 'avg', label: '평균' },
        { value: 'count', label: '건수' },
        { value: 'min', label: '최소' },
        { value: 'max', label: '최대' },
      ]},
    ],
    outputSchema: [
      { key: 'groups', type: 'object[]', description: '그룹별 집계 결과' },
      { key: 'totalCount', type: 'number', description: '전체 건수' },
    ],
  },
  {
    type: 'data.merge',
    category: 'data',
    label: '병합',
    description: '두 노드의 데이터를 키 기준으로 병합합니다.',
    icon: 'Merge',
    color: DATA_COLOR,
    configSchema: [
      { key: 'left_node', label: '왼쪽 노드', type: 'text', required: true },
      { key: 'right_node', label: '오른쪽 노드', type: 'text', required: true },
      { key: 'merge_key', label: '병합 키', type: 'text', required: true, placeholder: 'productId' },
    ],
    outputSchema: [
      { key: 'rows', type: 'any[]', description: '병합 결과' },
      { key: 'count', type: 'number', description: '결과 건수' },
    ],
  },
  {
    type: 'data.transform',
    category: 'data',
    label: '매핑/변환',
    description: '필드 이름을 변환하거나 매핑합니다.',
    icon: 'Repeat',
    color: DATA_COLOR,
    configSchema: [
      { key: 'source_node', label: '소스 노드', type: 'text', required: true },
      { key: 'mappings', label: '매핑 규칙 [{from, to}]', type: 'json', required: true },
    ],
    outputSchema: [
      { key: 'rows', type: 'any[]', description: '변환 결과' },
      { key: 'count', type: 'number', description: '결과 건수' },
    ],
  },

  // ─── condition ───
  {
    type: 'condition.evaluate',
    category: 'condition',
    label: '조건 분기',
    description: '조건을 평가하여 분기합니다.',
    icon: 'GitBranch',
    color: CONDITION_COLOR,
    configSchema: [
      { key: 'field', label: '비교 대상 (템플릿)', type: 'template', required: true, placeholder: '{{node_id.output_key}}' },
      { key: 'operator', label: '연산자', type: 'select', required: true, options: [
        { value: 'gt', label: '초과 (>)' },
        { value: 'lt', label: '미만 (<)' },
        { value: 'gte', label: '이상 (>=)' },
        { value: 'lte', label: '이하 (<=)' },
        { value: 'eq', label: '같음 (=)' },
      ]},
      { key: 'value', label: '기준 값', type: 'number', required: true },
      { key: 'true_label', label: 'True 라벨', type: 'text', defaultValue: 'true' },
      { key: 'false_label', label: 'False 라벨', type: 'text', defaultValue: 'false' },
    ],
    outputSchema: [
      { key: 'result', type: 'boolean', description: '조건 결과' },
      { key: 'branch', type: 'string', description: '분기 라벨' },
      { key: 'actual', type: 'number', description: '실제 값' },
      { key: 'threshold', type: 'number', description: '기준 값' },
    ],
  },
  {
    type: 'condition.abc_classify',
    category: 'condition',
    label: 'ABC 분류',
    description: '매출 기여도 기반 ABC 등급을 분류합니다.',
    icon: 'Award',
    color: CONDITION_COLOR,
    configSchema: [
      { key: 'source_node', label: '소스 노드', type: 'text', required: true },
      { key: 'value_field', label: '기준 필드', type: 'text', required: true, placeholder: 'revenue' },
      { key: 'a_threshold', label: 'A등급 누적 비율', type: 'number', defaultValue: 0.2 },
      { key: 'b_threshold', label: 'B등급 누적 비율', type: 'number', defaultValue: 0.5 },
    ],
    outputSchema: [
      { key: 'grades', type: 'object[]', description: '등급 분류 결과 [{id, grade, cumulativePercent}]' },
      { key: 'summary', type: 'object', description: '등급별 건수 {a_count, b_count, c_count}' },
    ],
  },

  // ─── calculate ───
  {
    type: 'calculate.profit_loss',
    category: 'calculate',
    label: '손익 계산',
    description: '상품별 손익을 계산합니다.',
    icon: 'Calculator',
    color: CALCULATE_COLOR,
    configSchema: [
      { key: 'source_node', label: '소스 노드', type: 'text', required: true },
    ],
    outputSchema: [
      { key: 'items', type: 'StandardProfitLoss[]', description: '상품별 손익' },
      { key: 'summary', type: 'object', description: '{totalRevenue, totalProfit, avgProfitRate}' },
    ],
  },
  {
    type: 'calculate.ad_efficiency',
    category: 'calculate',
    label: '광고 효율 계산',
    description: '광고비율 기준으로 효율을 판단합니다.',
    icon: 'PieChart',
    color: CALCULATE_COLOR,
    configSchema: [
      { key: 'source_node', label: '소스 노드', type: 'text', required: true },
      { key: 'threshold', label: '광고비율 기준', type: 'number', defaultValue: 0.15, placeholder: '0.15 (15%)' },
    ],
    outputSchema: [
      { key: 'items', type: 'StandardAd[]', description: '광고 실적 (adCostRate 포함)' },
      { key: 'overThreshold', type: 'StandardAd[]', description: '기준 초과 항목' },
      { key: 'underThreshold', type: 'StandardAd[]', description: '기준 이하 항목' },
    ],
  },
  {
    type: 'calculate.reorder_check',
    category: 'calculate',
    label: '발주 필요 판단',
    description: '안전 재고일수 기반으로 발주 필요 여부를 판단합니다.',
    icon: 'AlertTriangle',
    color: CALCULATE_COLOR,
    configSchema: [
      { key: 'source_node', label: '소스 노드', type: 'text', required: true },
      { key: 'safety_days', label: '안전 재고일수', type: 'number', defaultValue: 14 },
      { key: 'lead_time_days', label: '리드타임 (일)', type: 'number', defaultValue: 21 },
    ],
    outputSchema: [
      { key: 'items', type: 'StandardInventory[]', description: '재고 현황' },
      { key: 'needsReorder', type: 'StandardInventory[]', description: '발주 필요 항목' },
      { key: 'sufficient', type: 'StandardInventory[]', description: '재고 충분 항목' },
    ],
  },
  {
    type: 'calculate.ctr_anomaly',
    category: 'calculate',
    label: 'CTR 이상감지',
    description: 'CTR 하락이 기준치를 넘는 항목을 감지합니다.',
    icon: 'Activity',
    color: CALCULATE_COLOR,
    configSchema: [
      { key: 'source_node', label: '소스 노드', type: 'text', required: true },
      { key: 'drop_threshold', label: '하락 기준', type: 'number', defaultValue: -0.2, placeholder: '-0.2 (-20%)' },
    ],
    outputSchema: [
      { key: 'items', type: 'StandardThumbnail[]', description: '썸네일 데이터' },
      { key: 'anomalies', type: 'StandardThumbnail[]', description: '이상 감지 항목' },
      { key: 'normal', type: 'StandardThumbnail[]', description: '정상 항목' },
    ],
  },

  // ─── notification ───
  {
    type: 'notification.alert',
    category: 'notification',
    label: '시스템 알림',
    description: '시스템 알림을 생성합니다.',
    icon: 'Bell',
    color: NOTIFICATION_COLOR,
    configSchema: [
      { key: 'alert_type', label: '알림 유형', type: 'select', defaultValue: 'workflow', options: [
        { value: 'workflow', label: '워크플로우' },
        { value: 'stock', label: '재고' },
        { value: 'order', label: '주문' },
        { value: 'ad', label: '광고' },
        { value: 'review', label: '리뷰' },
      ]},
      { key: 'severity', label: '심각도', type: 'select', defaultValue: 'info', options: [
        { value: 'info', label: '정보' },
        { value: 'warning', label: '경고' },
        { value: 'critical', label: '심각' },
      ]},
      { key: 'title', label: '제목 (템플릿)', type: 'template', required: true },
      { key: 'message', label: '본문 (템플릿)', type: 'template', required: true },
    ],
    outputSchema: [
      { key: 'sent', type: 'boolean', description: '전송 성공 여부' },
      { key: 'title', type: 'string', description: '생성된 알림 제목' },
    ],
  },
  {
    type: 'notification.slack',
    category: 'notification',
    label: '슬랙 알림',
    description: 'Slack 웹훅으로 메시지를 전송합니다.',
    icon: 'MessageCircle',
    color: NOTIFICATION_COLOR,
    configSchema: [
      { key: 'webhook_url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://hooks.slack.com/services/...' },
      { key: 'message', label: '메시지 (템플릿)', type: 'template', required: true },
    ],
    outputSchema: [
      { key: 'sent', type: 'boolean', description: '전송 성공 여부' },
    ],
  },

  // ─── internal ───
  {
    type: 'internal.db_query',
    category: 'internal',
    label: 'DB 조회',
    description: 'Prisma 모델을 통해 데이터를 조회합니다.',
    icon: 'Database',
    color: INTERNAL_COLOR,
    configSchema: [
      { key: 'model', label: 'Prisma 모델명', type: 'text', required: true, placeholder: 'product' },
      { key: 'where', label: '조건 (JSON)', type: 'json' },
      { key: 'limit', label: '최대 건수', type: 'number', defaultValue: 100 },
    ],
    outputSchema: [
      { key: 'rows', type: 'any[]', description: '조회 결과' },
      { key: 'count', type: 'number', description: '결과 건수' },
    ],
  },
  {
    type: 'internal.update_product',
    category: 'internal',
    label: '상품 업데이트',
    description: '상품 정보를 일괄 업데이트합니다.',
    icon: 'Edit',
    color: INTERNAL_COLOR,
    configSchema: [
      { key: 'product_ids_node', label: '상품 ID 소스 노드', type: 'text', required: true },
      { key: 'updates', label: '업데이트 내용 (JSON)', type: 'json', required: true },
    ],
    outputSchema: [
      { key: 'updatedCount', type: 'number', description: '업데이트 건수' },
    ],
  },
  {
    type: 'internal.create_purchase_order',
    category: 'internal',
    label: '발주서 생성',
    description: '공급업체 발주서를 생성합니다.',
    icon: 'FileText',
    color: INTERNAL_COLOR,
    configSchema: [
      { key: 'supplier', label: '공급업체', type: 'text', required: true },
      { key: 'items_node', label: '발주 항목 소스 노드', type: 'text', required: true },
    ],
    outputSchema: [
      { key: 'purchaseOrderId', type: 'string', description: '생성된 발주서 ID' },
    ],
  },

  // ─── export ───
  {
    type: 'export.excel',
    category: 'export',
    label: '엑셀 출력',
    description: '데이터를 엑셀 파일로 내보냅니다.',
    icon: 'FileSpreadsheet',
    color: EXPORT_COLOR,
    configSchema: [
      { key: 'source_node', label: '소스 노드', type: 'text', required: true },
      { key: 'source_key', label: '소스 키', type: 'text', defaultValue: 'rows' },
      { key: 'columns', label: '컬럼 정의 (JSON)', type: 'json', required: true, placeholder: '[{"key":"name","header":"상품명"}]' },
      { key: 'filename', label: '파일명 (템플릿)', type: 'template', defaultValue: 'export_{{date}}' },
    ],
    outputSchema: [
      { key: 'filePath', type: 'string', description: '생성된 파일 경로' },
      { key: 'rowCount', type: 'number', description: '행 수' },
    ],
  },
  {
    type: 'export.report',
    category: 'export',
    label: '월간 리포트 생성',
    description: '여러 데이터를 종합한 월간 리포트를 생성합니다.',
    icon: 'FileBarChart',
    color: EXPORT_COLOR,
    configSchema: [
      { key: 'source_nodes', label: '소스 노드 목록 (JSON)', type: 'json', required: true },
      { key: 'template', label: '템플릿', type: 'select', options: [
        { value: 'monthly_summary', label: '월간 종합' },
        { value: 'weekly_sales', label: '주간 매출' },
        { value: 'ad_performance', label: '광고 성과' },
      ]},
      { key: 'title', label: '리포트 제목', type: 'text' },
    ],
    outputSchema: [
      { key: 'filePath', type: 'string', description: '생성된 리포트 경로' },
      { key: 'sections', type: 'string[]', description: '포함된 섹션 목록' },
    ],
  },

  // ─── agent ───
  {
    type: 'agent_task.create',
    category: 'agent',
    label: 'Python 에이전트 위임',
    description: 'Python 에이전트에 작업을 위임합니다.',
    icon: 'Bot',
    color: AGENT_COLOR,
    configSchema: [
      { key: 'agent_type', label: '에이전트 유형', type: 'select', required: true, options: [
        { value: 'detail_page', label: '상세페이지 생성' },
        { value: 'seo_optimize', label: 'SEO 최적화' },
        { value: 'review_reply', label: '리뷰 답변' },
        { value: 'thumbnail_gen', label: '썸네일 생성' },
      ]},
      { key: 'input', label: '입력 데이터 (JSON)', type: 'json' },
      { key: 'source_data_id', label: '소스 데이터 ID', type: 'text' },
    ],
    outputSchema: [
      { key: 'taskId', type: 'string', description: '생성된 태스크 ID' },
      { key: 'agentType', type: 'string', description: '에이전트 유형' },
    ],
  },
  {
    type: 'ai.analyze',
    category: 'ai',
    label: 'AI 분석 + 액션 추천',
    description: '워크플로우 실행 결과를 LLM이 분석하고, 액션 카탈로그에서 다음 추천 액션을 structured JSON으로 반환합니다.',
    icon: 'Sparkles',
    color: AI_COLOR,
    configSchema: [
      { key: 'source_nodes', label: '분석 대상 노드 ID 목록', type: 'json', required: true },
      { key: 'workflow_name', label: '워크플로우 이름', type: 'text', required: true },
    ],
    outputSchema: [
      { key: 'summary', type: 'string', description: '1-2문장 핵심 요약' },
      { key: 'actions', type: 'AnalysisAction[]', description: '추천 액션 목록 (type, label, reason, params)' },
      { key: 'analysis', type: 'string', description: 'LLM 원본 응답 JSON' },
      { key: 'model', type: 'string', description: '사용된 모델명' },
    ],
  },
];

export const NODE_CATALOG_MAP: Map<string, NodeDefinition> = new Map(
  NODE_CATALOG.map((n) => [n.type, n]),
);
