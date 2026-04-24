@AGENTS.md

## Claude Code

- Nested `CLAUDE.md` files remain Claude's scoped entrypoints under `apps/server/src/*` and `apps/web/src/app/*`.
- When a directory has both `AGENTS.md` and `CLAUDE.md`, keep shared rules in `AGENTS.md` and reserve this file for Claude-only workflow notes.

## gstack

- Use `/browse` from gstack for web browsing when the Claude-side pack is installed.
- Claude workflow names in this file (`/review`, `/qa`, `/ship`, `/plan-eng-review`, etc.) refer to the Claude gstack command names, not the Codex `gstack-*` skill names.

## Subagent / Team routing

복잡도에 따라 패턴 분기:

| 상황 | 패턴 |
|---|---|
| 단일 파일 버그 픽스, 1-2 파일 수정 | **직접 작업** (subagent 불필요) |
| 중간 복잡도 (3-5 파일, 단일 도메인) | **`kiditem-implementer` subagent 1회 dispatch** + 결과 수령 후 `/review` skill |
| 복잡 작업 (5+ 파일, 신규 피처, legacy 포팅, cross-business-domain) | **`TeamCreate`** + 3-role 스폰 (아래) |
| Research-only (파일 읽기만) | `Explore` 또는 `researcher` subagent |
| Plan 기반 다단계 실행 (plan.md 이미 있음) | `superpowers:subagent-driven-development` |

### Team 기반 workflow (복잡 작업)

1. `TeamCreate({ team_name: "kiditem-<feature>" })` — 팀 + 공유 TaskList 생성
2. 팀에 3 role 스폰 (`Agent` 툴 + `team_name` + `name`):
   - `kiditem-implementer` × 1 (기본; 독립 병렬 태스크 있으면 명시적으로 N)
   - `kiditem-reviewer` × 2 (`MODE: spec` + `MODE: quality` 각 1)
   - `kiditem-qa-verifier` × 1
3. `TaskCreate` 로 태스크 투입. Implementer 가 claim → 구현 → 3 리뷰어에게 DM
4. 리뷰 루프는 **teammate 간 직접 DM** 으로 닫힘 (내가 중계 안 함)
5. 모든 태스크 완료 + QA PASS 후 `SendMessage({to: "*", message: {type: "shutdown_request"}})` → `TeamDelete`

Lead (나) 역할:
- 태스크 설계 + `plan-eng-review` / `plan-ceo-review` / `plan-design-review` skill 호출
- QA FAIL 중 "데이터/환경 문제" triage
- 사용자 커뮤니케이션 + 최종 ship

**구현 / 리뷰 / QA 는 직접 하지 않는다** — teammate 에게 위임.

### Skill routing

요청이 아래 트리거와 매칭되면 **Skill 툴을 first action 으로** 호출 (직접 답변 금지):

#### 작업 플로우
- 제품 아이디어, 브레인스토밍 → **office-hours**
- 버그, 500 에러, "왜 이게 안 돼" → **investigate**
- 다단계 작업 plan 작성 → **superpowers:writing-plans**
- Plan 실행 (subagent 기반, 팀 필요 없음) → **superpowers:subagent-driven-development**
- "완료" 주장 전 증거 수집 → **superpowers:verification-before-completion**
- worktree 에서 isolated 작업 시작 → **superpowers:using-git-worktrees**

#### 리뷰 / 검증
- 코드 리뷰 / diff 체크 → **review** (gstack)
- kiditem 컨벤션 + 디자인 리뷰 → **kiditem-review**
- 독립 2nd opinion / codex challenge → **codex**
- 보안 감사 / PII / 권한 → **security-review** 또는 **cso**
- 성능 / 페이지 속도 → **benchmark**
- QA / 사이트 테스트 / 버그 찾기 → **qa**
- 비주얼 감사 / 디자인 폴리시 → **design-review**
- 코드 퀄리티 / 헬스 체크 → **health**

#### Plan 단계 리뷰
- 아키텍처 리뷰 → **plan-eng-review**
- scope 재고 / "더 야심차게" → **plan-ceo-review**
- UI/UX plan 구멍 → **plan-design-review**
- API/CLI/SDK DX plan → **plan-devex-review**
- 위 전부 auto 연쇄 → **autoplan**

#### 환경 / 동기화
- shared / prisma 변경 후 로컬 동기화 → **kiditem-sync**
- 디자인 시스템 / 브랜드 → **design-consultation**

#### Post-ship
- Ship / deploy / PR 생성 → **ship**
- Ship 후 배포 감시 → **canary**
- Ship 후 문서 업데이트 → **document-release**
- Weekly retro → **retro**

#### 기타
- 진행 저장 / 체크포인트 / 재개 → **checkpoint**
- 이전 패턴 recall → **learn**
