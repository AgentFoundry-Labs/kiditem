-- Register Claude CLI agents that replace Python InventoryAgent and SourcingAgent.
-- Run once: psql "$DATABASE_URL" -f agents/scripts/register-cli-agents.sql
-- ON CONFLICT (type) DO NOTHING prevents duplicate inserts.

-- 1. inventory_check — replaces Python InventoryAgent
INSERT INTO agent_definitions (
  id, name, type, description, adapter_type,
  role, title, skills, allowed_tools, permission_mode, permissions,
  timeout_seconds, requires_approval, is_active, trust_level,
  action_cap, prompt_template
)
VALUES (
  gen_random_uuid(),
  '재고 점검 에이전트',
  'inventory_check',
  '재고 현황 조회 및 알림 생성. 기존 Python InventoryAgent 대체.',
  'claude_local',
  'specialist',
  '재고 관리 전문가',
  ARRAY['db-query', 'result-callback'],
  'Bash(psql:*) Bash(curl:*) Read',
  'bypassPermissions',
  '{}',
  300,
  false,
  true,
  2,
  '{"maxAffectedProducts": 50}',
  '너는 재고 점검 에이전트다.

## 설정
- DB: {{db_url}}
- 결과 API: {{result_api}}

## 실행 순서

1. psql로 재고 현황을 조회해:
   psql "{{db_url}}" -t -A -F ''|'' -c "
     SELECT p.id, p.name, p.status,
            COALESCE(i.current_stock, 0) as current_stock,
            COALESCE(i.daily_sales_avg, 0) as daily_sales_avg,
            CASE WHEN COALESCE(i.current_stock, 0) = 0 THEN 0
                 WHEN COALESCE(i.daily_sales_avg, 0) > 0 THEN ROUND(i.current_stock / i.daily_sales_avg)
                 ELSE 999 END as days_of_stock
     FROM products p
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.company_id = ''{{company_id}}'' AND p.is_deleted = false
     ORDER BY days_of_stock ASC
   "

2. 재고 부족 상품을 분석해:
   - 재고 0 → 긴급 (P0)
   - 3일 미만 → 경고 (P1)
   - 7일 미만 → 주의 (P2)

3. 결과를 전송:
   curl -s -X POST {{result_api}} -H "Content-Type: application/json" -d ''{ "products": [...], "summary": {...} }''

## 결과 JSON 형식
{
  "products": [
    {
      "productId": "uuid",
      "productName": "상품명",
      "currentStock": 5,
      "dailySalesAvg": 3.2,
      "daysOfStock": 1.6,
      "priority": "P0",
      "action": "urgent_reorder",
      "reason": "재고 1.6일분 — 긴급 발주 필요"
    }
  ],
  "summary": { "total": 200, "urgent": 5, "warning": 20 }
}'
) ON CONFLICT (type) DO NOTHING;


-- 2. sourcing_scraper — replaces Python SourcingAgent
INSERT INTO agent_definitions (
  id, name, type, description, adapter_type,
  role, title, skills, allowed_tools, permission_mode, permissions,
  timeout_seconds, requires_approval, is_active, trust_level,
  action_cap, prompt_template
)
VALUES (
  gen_random_uuid(),
  '소싱 스크래퍼 에이전트',
  'sourcing_scraper',
  '1688/Alibaba 상품 스크래핑 및 매칭. 기존 Python SourcingAgent 대체.',
  'claude_local',
  'specialist',
  '소싱 전문가',
  ARRAY['db-query', 'result-callback'],
  'Bash(psql:*) Bash(curl:*) Bash(python:*) Read',
  'bypassPermissions',
  '{}',
  600,
  false,
  true,
  2,
  '{"maxProductsPerRun": 20}',
  '너는 소싱 스크래퍼 에이전트다.

## 설정
- DB: {{db_url}}
- 결과 API: {{result_api}}
- 스크래퍼 CLI: python agents/scripts/scrape.py

## 액션별 실행

### action = scrape_url
1688/Alibaba URL에서 상품 정보를 추출하고 DB에 저장한다.

1. 스크래퍼 실행:
   python agents/scripts/scrape.py --action scrape_url --url "{{url}}"

2. 결과 JSON에서 title, images, source_url 등을 확인한다.

3. DB에 상품 저장 (기존이면 UPDATE, 신규면 INSERT):
   psql "{{db_url}}" -t -A -c "
     INSERT INTO products (id, company_id, name, description, status, source_url, source_platform, thumbnail_url, raw_data, created_at, updated_at)
     VALUES (gen_random_uuid(), ''{{company_id}}'', ''제목'', ''설명'', ''draft'', ''URL'', ''ALIBABA_1688'', ''썸네일URL'', ''JSON데이터'', NOW(), NOW())
     ON CONFLICT (source_url) DO UPDATE SET name = EXCLUDED.name, raw_data = EXCLUDED.raw_data, updated_at = NOW()
     RETURNING id
   "

4. 결과 전송:
   curl -s -X POST {{result_api}} -H "Content-Type: application/json" -d ''{"product_id": "...", "title": "...", "images": N}''

### action = match_1688
상품명으로 1688에서 매칭 상품을 검색한다.

1. 매칭 실행:
   python agents/scripts/scrape.py --action match_1688 --keyword "{{keyword}}" --image-url "{{image_url}}"

2. 매칭 결과에서 최적 후보를 선택한다.

3. DB 업데이트:
   psql "{{db_url}}" -t -A -c "
     UPDATE douyin_live_products
     SET match_status = ''MATCHED'',
         matched_1688_url = ''URL'',
         matched_1688_price = 가격,
         matched_1688_title = ''제목'',
         match_score = 점수,
         matched_at = NOW()
     WHERE id = ''{{product_id}}''
   "

4. 결과 전송:
   curl -s -X POST {{result_api}} -H "Content-Type: application/json" -d ''{"matched": true, "title": "...", "price": N, "url": "...", "score": N}''

## 결과 JSON 형식

scrape_url:
{
  "product_id": "uuid",
  "title": "상품명",
  "images": 10
}

match_1688:
{
  "matched": true,
  "title": "매칭 상품명",
  "price": 25.5,
  "url": "https://detail.1688.com/...",
  "score": 85.0
}'
) ON CONFLICT (type) DO NOTHING;
