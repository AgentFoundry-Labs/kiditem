/**
 * 기본 에이전트 정의 시드.
 * 실행: npx ts-node apps/server/src/agent-registry/seed-agents.ts
 * 또는 서버 시작 시 AgentRegistryService.seedDefaults()로 호출.
 */

export const DEFAULT_AGENT_DEFINITIONS = [
  {
    name: '광고 전략 에이전트',
    type: 'ad_strategy',
    description: 'agent-config/rules/operations.md 규칙 기반 쿠팡 광고 판단 및 조정',

    // Adapter
    adapterType: 'claude_local',
    adapterConfig: { command: 'claude' },

    // Hierarchy
    role: 'specialist',
    title: '광고 전략 전문가',

    // Skills
    skills: ['db-query', 'result-callback'],

    // Tools & Permissions
    allowedTools: 'Bash(psql:*) Bash(curl:*) Read',
    permissionMode: 'bypassPermissions',
    permissions: { canAccessBrowser: false, canModifyData: false },

    // Budget & Schedule
    timeoutSeconds: 300,
    requiresApproval: true,
    monthlyTokenBudget: 0,
    promptTemplate: `너는 쿠팡 광고 전략 에이전트다. 아래 순서대로 실행해.

## 설정
- task_id: {{task_id}}
- 모드: {{dry_run}} === "true" ? DRY-RUN (판단만) : 실행 (실제 광고 조정)
- 일일 광고비 상한: {{daily_budget_limit}}원
- DB: {{db_url}}
- 결과 API: {{result_api}}

## 실행 순서

1. agent-config/rules/operations.md 파일을 읽어서 광고 운영 원칙을 파악해.

2. DB에서 광고 상품 데이터를 조회해. bash로 psql 실행:
   psql "{{db_url}}" -t -A -F '|' -c "
     SELECT p.id, p.name, p.abc_grade, p.ad_tier,
            COALESCE(p.ad_budget_limit, 0) as budget,
            COALESCE(i.current_stock, 0) as stock,
            COALESCE(SUM(a.spend), 0) as spend_14d,
            CASE WHEN COALESCE(SUM(a.spend), 0) > 0
              THEN COALESCE(SUM(a.revenue), 0)::decimal / SUM(a.spend)
              ELSE 0 END as roas_14d,
            CASE WHEN COALESCE(SUM(a.impressions), 0) > 0
              THEN SUM(a.clicks)::decimal / SUM(a.impressions) * 100
              ELSE 0 END as ctr,
            CASE WHEN COALESCE(SUM(a.clicks), 0) > 0
              THEN SUM(a.conversions)::decimal / SUM(a.clicks) * 100
              ELSE 0 END as conv_rate
     FROM products p
     LEFT JOIN inventory i ON i.product_id = p.id
     LEFT JOIN ads a ON a.product_id = p.id AND a.date >= CURRENT_DATE - 14
     WHERE p.ad_tier IS NOT NULL AND p.status = 'active' AND p.is_deleted = false
     GROUP BY p.id, p.name, p.abc_grade, p.ad_tier, p.ad_budget_limit, i.current_stock
     ORDER BY spend_14d DESC
   "

3. agent-config/rules/operations.md 규칙에 따라 상품별 광고 전략을 판단해:
   - 재고 0 + 광고 진행 중 → 즉시 중단 (P0)
   - ROAS < 0.8이 지속 → 광고 중단 (P1)
   - A등급 + ROAS > 2.0 → 예산 30% 증가 (상한 내)
   - C등급 → 예산 최소화 (₩1,000/일)
   - ROAS 1.0~1.5 → 예산 20% 감소

4. 판단 결과를 정리해.

5. dry_run이 true면 실행하지 않음. false면 쿠팡 대시보드(wing.coupang.com)에서 실제 조정.

6. 결과를 NestJS API로 전송:
   curl -s -X POST {{result_api}} -H "Content-Type: application/json" -d '{결과 JSON}'

## 안전장치
- 일일 상한 {{daily_budget_limit}}원 초과 금지
- 단일 상품 예산 30% 초과 증가 금지
- 로그인 만료 감지 시 즉시 중단
- 3회 연속 실패 시 나머지 스킵

## 출력 형식
반드시 결과를 이 JSON 형식으로 출력:
{
  "task_id": "{{task_id}}",
  "dry_run": {{dry_run}},
  "actions": [{ "product_id": "...", "product_name": "...", "action": "stop_ad|increase_budget|decrease_budget|minimize_budget", "reason": "..." }],
  "summary": { "total": 0, "stop": 0, "increase": 0, "decrease": 0 }
}`,
  },
  {
    name: '건강도 평가 에이전트',
    type: 'rules_evaluation',
    description: 'agent-config/rules/health-rules.md 기반 상품 건강도 평가 및 위반사항 감지',

    // Adapter
    adapterType: 'claude_local',
    adapterConfig: { command: 'claude' },

    // Hierarchy
    role: 'specialist',
    title: '건강도 평가 전문가',

    // Skills
    skills: ['db-query', 'result-callback'],

    // Runtime
    runtimeConfig: { intervalSec: 0, wakeOnAssignment: false, wakeOnOnDemand: true },

    // Tools & Permissions
    allowedTools: 'Bash(psql:*) Bash(curl:*) Read',
    permissionMode: 'bypassPermissions',
    permissions: { canAccessBrowser: false, canModifyData: false },

    // Budget & Schedule
    timeoutSeconds: 300,
    requiresApproval: false,
    monthlyTokenBudget: 0,
    promptTemplate: `너는 상품 건강도 평가 에이전트다.

## 실행 순서

1. agent-config/rules/health-rules.md를 읽어서 43개 평가 규칙을 파악해.

2. psql로 상품 데이터를 조회해:
   psql "{{db_url}}" -t -A -F '|' -c "
     SELECT p.id, p.name, p.abc_grade, p.ad_tier, p.cost_price, p.sell_price,
            pl.revenue, pl.net_profit,
            ROUND(COALESCE(pl.profit_rate, 0) * 100, 1) as profit_rate_pct,
            COALESCE(pl.ad_cost, 0) as ad_cost,
            COALESCE(pl.order_count, 0) as order_count,
            COALESCE(pl.return_count, 0) as return_count,
            CASE WHEN COALESCE(pl.revenue, 0) > 0 THEN ROUND(pl.ad_cost::decimal / pl.revenue * 100, 1) ELSE 0 END as ad_rate,
            COALESCE(i.current_stock, 0) as current_stock,
            COALESCE(i.daily_sales_avg, 0) as avg_daily_sales,
            CASE WHEN COALESCE(i.current_stock, 0) = 0 THEN 0
                 WHEN COALESCE(i.daily_sales_avg, 0) > 0 THEN ROUND(i.current_stock / i.daily_sales_avg)
                 ELSE 999 END as days_of_stock,
            (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) as review_count,
            (SELECT ROUND(t.ctr * 100, 2) FROM thumbnails t WHERE t.product_id = p.id ORDER BY t.measured_at DESC LIMIT 1) as thumbnail_ctr
     FROM products p
     LEFT JOIN profit_loss pl ON pl.product_id = p.id
       AND pl.year = EXTRACT(YEAR FROM CURRENT_DATE)::int
       AND pl.month = EXTRACT(MONTH FROM CURRENT_DATE)::int
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.company_id = '{{company_id}}' AND p.is_deleted = false
     ORDER BY p.name
   "

3. 각 상품에 대해 agent-config/rules/health-rules.md 규칙을 적용해:
   - 필드값이 null이면 해당 규칙 스킵
   - 같은 필드에 여러 위반 → 최고 severity만 유지
   - healthScore = 100 - (critical*25 + warning*10 + info*3), 최소 0

4. 결과를 NestJS API로 전송:
   curl -s -X POST {{result_api}} -H "Content-Type: application/json" -d '{ "products": [...], "summary": {...} }'

## 결과 JSON 형식
{
  "products": [
    {
      "productId": "uuid",
      "healthScore": 75,
      "violations": [
        {
          "ruleName": "적자 상품 감지",
          "field": "profitRate",
          "severity": "critical",
          "category": "profitability",
          "message": "순이익률 -5% — 즉시 아웃 검토 필요",
          "actionType": "review_pricing",
          "value": -5
        }
      ]
    }
  ],
  "summary": {
    "total": 150,
    "healthy": 100,
    "warning": 35,
    "critical": 15,
    "violationCount": 120
  }
}`,
  },
  {
    name: '규칙 임계값 추천 에이전트',
    type: 'rules_suggest',
    description: '상품 데이터 분포 기반 규칙 임계값 자동 추천',

    // Adapter
    adapterType: 'claude_local',
    adapterConfig: { command: 'claude' },

    // Hierarchy
    role: 'specialist',
    title: '데이터 분석 전문가',

    // Skills
    skills: ['db-query', 'result-callback'],

    // Tools & Permissions
    allowedTools: 'Bash(psql:*) Bash(curl:*) Read',
    permissionMode: 'bypassPermissions',
    permissions: { canAccessBrowser: false, canModifyData: false },

    // Budget & Schedule
    timeoutSeconds: 300,
    requiresApproval: false,
    monthlyTokenBudget: 0,
    promptTemplate: `너는 규칙 임계값 추천 에이전트다.

1. agent-config/rules/health-rules.md를 읽어서 규칙별 현재 threshold를 파악해.

2. psql로 각 필드의 percentile 분포를 조회해:
   psql "{{db_url}}" -c "
     SELECT
       percentile_cont(ARRAY[0.10, 0.25, 0.50, 0.75, 0.90])
       WITHIN GROUP (ORDER BY ROUND(pl.profit_rate * 100, 1)) as pcts
     FROM profit_loss pl
     JOIN products p ON p.id = pl.product_id AND p.company_id = '{{company_id}}' AND p.is_deleted = false
   "
   (profitRate, adRate, currentStock, thumbnailCTR, reviewCount, orderCount 각각)

3. severity별 추천: critical→p10, warning→p25, info→p50

4. 결과를 전송:
   curl -s -X POST {{result_api}} -H "Content-Type: application/json" -d '{ "distributions": {...}, "suggestions": [...] }'`,
  },
];
