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

비-Claude tool-wrapper는 각 owner domain 코드에서 실행 계약을 관리한다.
예를 들어 `image_edit`은 AI 도메인의 Nest runtime handler와 prompt builder가
소유한다.

## 프롬프트 관리

프롬프트 템플릿은 DB가 아닌 이 디렉토리에서 관리. Agent OS 의 shipped
definition registry 가 프롬프트 파일 경로를 참조한다.

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
3. `apps/server/src/agent-os/domain/agent-definition.registry.ts` 에 definition 등록
4. 필요한 경우 `apps/server/src/ai/domain/agent-output/` 에 결과 Zod 스키마 추가

## 새 규칙 문서 추가

1. `agent-config/rules/` 에 마크다운 파일 추가
2. 프롬프트에서 `Read agent-config/rules/{파일명}` 참조
