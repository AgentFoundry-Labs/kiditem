-- Seed marketplace catalog (agents + workflows)
-- Run: npx prisma db execute --stdin < scripts/seed-marketplace.sql

-- ─── Agent Catalog ────────────────────────────────────────────────────────────

INSERT INTO marketplace (id, type, name, description, role, category, adapter_type, prompt_template, skills, is_published)
VALUES
  (gen_random_uuid(), 'agent', '매니저 에이전트', '전사 데이터 종합 분석. 전문 에이전트를 판단하여 할당합니다.

- 회사 전체 데이터 자동 조회 및 분석
- 필요한 전문 에이전트 판단 및 할당
- 분석 결과 종합 리포트 생성', 'manager', 'operations', 'claude_local', 'agent-config/prompts/agents/manager.md', ARRAY['db-query'], true),

  (gen_random_uuid(), 'agent', '광고 전략 에이전트', '광고 성과 분석 및 액션 추천.

- 광고 실적 데이터 자동 조회
- ABC 등급별 예산 배분 추천
- 저성과 캠페인 중단 제안
- ROAS/CTR 기반 최적화', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/ad-strategy.md', ARRAY['db-query'], true),

  (gen_random_uuid(), 'agent', '건강도 평가 에이전트', '비즈니스 규칙 기반 상품 건강 점수 평가.

- 상품별 건강도 자동 평가
- 규칙 위반 상품 감지 및 알림
- 심각도별 우선순위 분류', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/rules-evaluation.md', ARRAY['db-query'], true),

  (gen_random_uuid(), 'agent', '규칙 추천 에이전트', '데이터 분포 기반 규칙 임계값 추천.

- 현재 데이터 분포 분석
- 최적 임계값 자동 제안
- 기존 규칙 대비 개선 효과 예측', 'specialist', 'analytics', 'claude_local', 'agent-config/prompts/agents/rules-suggest.md', ARRAY['db-query'], true),

  (gen_random_uuid(), 'agent', '챗봇 에이전트', '비즈니스 데이터 조회 전용 챗봇.

- 읽기 전용 데이터 조회
- 자연어 질의 응답
- 상품/주문/광고 데이터 검색', 'specialist', 'operations', 'claude_local', 'agent-config/prompts/agents/chat.md', ARRAY['db-query'], true)

ON CONFLICT DO NOTHING;

-- ─── Workflow Catalog ─────────────────────────────────────────────────────────

INSERT INTO marketplace (id, type, name, description, category, module, nodes_json, edges_json, is_published, configurable_params)
VALUES
  (gen_random_uuid(), 'workflow', '주문 자동 처리', '신규 주문 수집 → 확인 → 송장 등록 자동화.

- 쿠팡 신규 주문 자동 수집
- 주문 상태 자동 확인
- 운송장 번호 자동 등록', 'automation', 'order',
    '[{"id":"1","type":"trigger.manual"},{"id":"2","type":"coupang.orders.fetch"},{"id":"3","type":"coupang.orders.confirm"},{"id":"4","type":"notification.alert","config":{"title":"주문 처리 완료"}}]'::jsonb,
    '[{"source":"1","target":"2"},{"source":"2","target":"3"},{"source":"3","target":"4"}]'::jsonb,
    true, '[]'::jsonb),

  (gen_random_uuid(), 'workflow', '광고 성과 분석', '광고 데이터 수집 → 효율 분석 → 전략 추천.

- 쿠팡 광고 데이터 자동 수집
- ROAS/CTR 효율 분석
- AI 광고 전략 추천', 'analytics', 'analytics',
    '[{"id":"1","type":"trigger.schedule","config":{"cron":"0 9 * * *"}},{"id":"2","type":"coupang.ads.fetch"},{"id":"3","type":"calculate.ad_efficiency"},{"id":"4","type":"agent_task.create","config":{"agentType":"ad_strategy"}}]'::jsonb,
    '[{"source":"1","target":"2"},{"source":"2","target":"3"},{"source":"3","target":"4"}]'::jsonb,
    true, '[]'::jsonb),

  (gen_random_uuid(), 'workflow', '상품 건강도 점검', '전 상품 건강도 평가 → 위험 상품 알림.

- 비즈니스 규칙 기반 자동 평가
- ABC 등급 분류
- 위험 상품 즉시 알림', 'analytics', 'product',
    '[{"id":"1","type":"trigger.manual"},{"id":"2","type":"internal.db_query","config":{"model":"Product","where":{"isDeleted":false}}},{"id":"3","type":"condition.abc_classify"},{"id":"4","type":"agent_task.create","config":{"agentType":"rules_evaluation"}},{"id":"5","type":"notification.alert","config":{"title":"건강도 점검 완료"}}]'::jsonb,
    '[{"source":"1","target":"2"},{"source":"2","target":"3"},{"source":"3","target":"4"},{"source":"4","target":"5"}]'::jsonb,
    true, '[]'::jsonb),

  (gen_random_uuid(), 'workflow', '리뷰 수집 및 분석', '쿠팡 리뷰 자동 수집 → 감성 분석 → 알림.

- 신규 리뷰 자동 수집
- 부정 리뷰 감지 및 알림
- 리뷰 트렌드 분석', 'automation', 'product',
    '[{"id":"1","type":"trigger.schedule","config":{"cron":"0 10 * * *"}},{"id":"2","type":"coupang.reviews.fetch"},{"id":"3","type":"data.filter","config":{"field":"rating","operator":"lte","value":3}},{"id":"4","type":"notification.alert","config":{"title":"부정 리뷰 감지","severity":"warning"}}]'::jsonb,
    '[{"source":"1","target":"2"},{"source":"2","target":"3"},{"source":"3","target":"4"}]'::jsonb,
    true, '[]'::jsonb),

  (gen_random_uuid(), 'workflow', '재고 자동 발주', '재고 부족 감지 → 발주 필요량 계산 → PO 생성.

- 안전재고 기준 자동 체크
- 최적 발주량 계산
- 발주서 자동 생성', 'automation', 'order',
    '[{"id":"1","type":"trigger.schedule","config":{"cron":"0 8 * * 1"}},{"id":"2","type":"calculate.reorder_check"},{"id":"3","type":"internal.create_purchase_order"},{"id":"4","type":"notification.alert","config":{"title":"자동 발주 완료"}}]'::jsonb,
    '[{"source":"1","target":"2"},{"source":"2","target":"3"},{"source":"3","target":"4"}]'::jsonb,
    true, '[]'::jsonb),

  (gen_random_uuid(), 'workflow', '월간 리포트 생성', '월별 매출/비용/수익 종합 리포트 자동 생성.

- 매출, 광고비, 물류비 자동 집계
- 손익 분석 리포트 생성
- 엑셀 내보내기', 'analytics', 'analytics',
    '[{"id":"1","type":"trigger.schedule","config":{"cron":"0 9 1 * *"}},{"id":"2","type":"calculate.profit_loss"},{"id":"3","type":"export.report"},{"id":"4","type":"notification.alert","config":{"title":"월간 리포트 생성 완료"}}]'::jsonb,
    '[{"source":"1","target":"2"},{"source":"2","target":"3"},{"source":"3","target":"4"}]'::jsonb,
    true, '[]'::jsonb)

ON CONFLICT DO NOTHING;
