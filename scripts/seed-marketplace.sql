-- Seed marketplace catalog (agents + workflows)
-- Run: npx prisma db execute --stdin < scripts/seed-marketplace.sql
--
-- Workflow catalog 는 slim-core executor 만 참조한다
-- (apps/server/src/workflows/CLAUDE.md 의 "살아남은 executor" 참고).
--   허용: trigger.manual, trigger.schedule, condition.evaluate,
--         notification.alert, agent_task.create
-- generic DB/HTTP/transform 노드 (internal.db_query, api_call, data.filter,
-- data_transform, ai_process) 와 legacy alias (trigger, trigger.event,
-- condition, notification) 는 catalog 에 두지 않는다. AI/LLM 진입점은
-- agent_task.create 한 가지뿐이다.

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

  (gen_random_uuid(), 'agent', '썸네일 분석 에이전트', '상품 썸네일 CTR 분석 및 개선 추천.

- 상품별 CTR/노출/클릭 분석
- 카테고리 평균 대비 성과 비교
- 저성과 썸네일 개선 우선순위 추천', 'specialist', 'product', 'claude_local', 'agent-config/prompts/agents/thumbnail-analyst.md', ARRAY['db-query'], true),

  (gen_random_uuid(), 'agent', '챗봇 에이전트', '비즈니스 데이터 조회 전용 챗봇.

- 읽기 전용 데이터 조회
- 자연어 질의 응답
- 상품/주문/광고 데이터 검색', 'specialist', 'operations', 'claude_local', 'agent-config/prompts/agents/chat.md', ARRAY['db-query'], true)

ON CONFLICT DO NOTHING;

-- ─── Workflow Catalog (slim-core only) ───────────────────────────────────────
--
-- 각 workflow 는 다음 패턴을 따른다:
--   trigger.* → agent_task.create → notification.alert
-- AI/도메인 분석은 모두 agent_task.create 로 위임한다. 도메인 데이터 fetch
-- 노드 (예: coupang.orders.fetch) 는 아직 등록되지 않았으므로 catalog 에
-- 두지 않는다. 등록되면 그 시점에 별도 PR 로 catalog 를 확장한다.

INSERT INTO marketplace (id, type, name, description, category, module, nodes_json, edges_json, is_published, configurable_params)
VALUES
  (gen_random_uuid(), 'workflow', '광고 성과 분석', '매일 광고 데이터를 점검하고 광고 전략 에이전트가 액션을 제안합니다.

- 매일 정해진 시간에 자동 실행
- 광고 전략 에이전트에게 분석 위임
- 분석 완료 시 알림', 'analytics', 'analytics',
    '[{"id":"1","type":"trigger.schedule","config":{"cron":"0 9 * * *"}},{"id":"2","type":"agent_task.create","config":{"agent_type":"ad_strategy"}},{"id":"3","type":"notification.alert","config":{"title":"광고 성과 분석 완료","severity":"info"}}]'::jsonb,
    '[{"source":"1","target":"2"},{"source":"2","target":"3"}]'::jsonb,
    true, '[]'::jsonb),

  (gen_random_uuid(), 'workflow', '상품 건강도 점검', '비즈니스 규칙 기반 상품 건강도를 평가하고 위험 상품을 알립니다.

- 수동 트리거로 즉시 실행
- 건강도 평가 에이전트에게 위임
- 평가 완료 시 알림', 'analytics', 'product',
    '[{"id":"1","type":"trigger.manual"},{"id":"2","type":"agent_task.create","config":{"agent_type":"rules_evaluation"}},{"id":"3","type":"notification.alert","config":{"title":"건강도 점검 완료","severity":"info"}}]'::jsonb,
    '[{"source":"1","target":"2"},{"source":"2","target":"3"}]'::jsonb,
    true, '[]'::jsonb),

  (gen_random_uuid(), 'workflow', '썸네일 분석', '상품 썸네일 CTR 데이터를 점검하고 개선 우선순위를 받습니다.

- 수동 트리거로 즉시 실행
- 썸네일 분석 에이전트에게 위임
- 분석 완료 시 알림', 'analytics', 'product',
    '[{"id":"1","type":"trigger.manual"},{"id":"2","type":"agent_task.create","config":{"agent_type":"thumbnail_analyst"}},{"id":"3","type":"notification.alert","config":{"title":"썸네일 분석 완료","severity":"info"}}]'::jsonb,
    '[{"source":"1","target":"2"},{"source":"2","target":"3"}]'::jsonb,
    true, '[]'::jsonb),

  (gen_random_uuid(), 'workflow', '매니저 일일 점검', '매니저 에이전트가 회사 전체 데이터를 점검하고 종합 리포트를 보고합니다.

- 매일 정해진 시간에 자동 실행
- 매니저 에이전트에게 위임 (필요 시 전문가 에이전트 추가 호출)
- 점검 완료 시 알림', 'automation', 'operations',
    '[{"id":"1","type":"trigger.schedule","config":{"cron":"0 8 * * *"}},{"id":"2","type":"agent_task.create","config":{"agent_type":"manager"}},{"id":"3","type":"notification.alert","config":{"title":"매니저 일일 점검 완료","severity":"info"}}]'::jsonb,
    '[{"source":"1","target":"2"},{"source":"2","target":"3"}]'::jsonb,
    true, '[]'::jsonb)

ON CONFLICT DO NOTHING;
