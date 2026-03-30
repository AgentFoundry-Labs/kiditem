# agent-config — Claude CLI Agent Runtime

NestJS가 `spawn('claude', ['-p', prompt])` 로 실행하는 에이전트의 런타임 설정.

개발자의 `.claude/` 설정과는 별개. 여기 있는 파일은 에이전트가 `Read` 도구로 직접 읽음.

## 구조

```
agent-config/
├── rules/
│   ├── operations.md       — ad_strategy 에이전트 광고 운영 규칙
│   └── health-rules.md     — rules_evaluation 에이전트 건강도 평가 규칙
└── README.md
```

## 에이전트 정의

에이전트 프롬프트 템플릿은 DB(`agent_definitions` 테이블)에 저장.
초기값은 `apps/server/src/agent-registry/seed-agents.ts`에서 시드.

## 새 규칙 문서 추가

1. `agent-config/rules/` 에 마크다운 파일 추가
2. `seed-agents.ts`의 프롬프트 템플릿에서 `Read agent-config/rules/{파일명}` 참조
3. 서버 재시작 시 자동 시드
