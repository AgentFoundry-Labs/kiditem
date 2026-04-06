# agent-config — Claude CLI Agent Runtime

NestJS가 `spawn('claude', ['-p', prompt])` 로 실행하는 에이전트의 런타임 설정.

개발자의 `.claude/` 설정과는 별개. 여기 있는 파일은 에이전트가 `Read` 도구로 직접 읽음.

## 구조

```
agent-config/
├── skills/           — 공통 스킬
├── rules/            — 도메인 규칙
└── prompts/
    └── agents/       — Claude CLI 에이전트 프롬프트
        ├── ad-strategy.md
        ├── rules-evaluation.md
        ├── rules-suggest.md
        ├── manager.md
        └── chat.md
```

Python 도구(content, image_edit)는 코드로 관리. 프롬프트 파일 불필요.

## 프롬프트 관리

프롬프트 템플릿은 DB가 아닌 이 디렉토리에서 관리. DB `agent_definitions.prompt_template` 필드는 파일 경로만 저장.

| 파일 | 에이전트 타입 | 설명 |
|------|-------------|------|
| prompts/agents/ad-strategy.md | ad_strategy | 광고 전략 |
| prompts/agents/rules-evaluation.md | rules_evaluation | 건강도 평가 |
| prompts/agents/rules-suggest.md | rules_suggest | 규칙 임계값 추천 |
| prompts/agents/manager.md | manager | 매니저 (오케스트레이터) |
| prompts/agents/chat.md | chat | 챗봇 (읽기 전용) |

## 새 에이전트 추가

1. `agent-config/prompts/agents/` 에 프롬프트 마크다운 파일 추가
2. 필요 시 `agent-config/rules/` 에 도메인 규칙 문서 추가
3. DB `agent_definitions`에 등록 — `prompt_template`에 파일 경로 저장
4. `schemas/agent-output-schemas.ts`에 결과 Zod 스키마 추가

## 새 규칙 문서 추가

1. `agent-config/rules/` 에 마크다운 파일 추가
2. 프롬프트에서 `Read agent-config/rules/{파일명}` 참조
