PR을 컨벤션 + 설계 + 실제 검증 수준까지 리뷰하고 GitHub에 체크리스트 형태로 리뷰 코멘트를 남깁니다.

인자로 PR 번호를 받습니다. 없으면 `gh pr list --state open`으로 열린 PR 목록을 보여주고 선택하게 하세요.

1. `gh pr view <번호> --json title,body,changedFiles,additions,deletions,headRefName,baseRefName,mergeStateStatus,statusCheckRollup,reviewThreads,comments`로 PR 개요, mergeability, 기존 코멘트/스레드를 먼저 파악합니다.
2. `gh pr diff <번호>`와 `gh pr diff <번호> --name-only`로 변경 내용과 변경 파일 목록을 확인합니다.
3. 변경된 파일 경로를 기준으로 해당 디렉토리와 상위 디렉토리에서 적용되는 `AGENTS.md`/scoped instruction을 읽습니다. `apps/web/src/app/*`와 `apps/server/src/*`는 각 workspace `AGENTS.md`의 Domain Guides가 가리키는 하위 instruction도 확인합니다.
4. 기존 PR 코멘트와 review thread를 모두 반영합니다. LGTM/approve 코멘트도 "검증 근거"로만 취급하고, 코멘트 내용이 실제로 어떤 테스트/제약을 만족했는지 직접 확인합니다.

## 필수 체크

### 컨벤션

- 해당 `AGENTS.md` 규칙 위반 여부를 체크리스트로 정리합니다.
- 변경되지 않은 도메인의 체크 항목은 제외합니다.
- 새 외부 import가 있으면 해당 workspace `package.json`과 root `package-lock.json`에 dependency가 선언됐는지 확인합니다.

### 설계 리뷰

- DB 스키마: 인덱스 적절성, 관계 설계, nullable 의도, 데이터 타입 선택
- API 설계: 엔드포인트 네이밍, 응답 형태 컨벤션, 에러 처리
- 서비스 구조: 책임 분리, 의존성 방향, 도메인 경계 침범
- 프론트엔드: 컴포넌트 분리, 상태 관리, 데이터 흐름
- 성능: N+1 쿼리, 불필요한 리렌더링, 배치 처리 가능 여부
- 보안: SQL injection, XSS, 인증/인가 누락, tenant scope/IDOR

### PR별 고위험 패턴

- `iframe srcDoc`에 user-edited/stored/LLM/template HTML을 넣는 경우 반드시 sandbox가 있어야 합니다.
- `srcDoc` sandbox에서 `allow-scripts`와 `allow-same-origin`을 함께 쓰면 same-origin XSS surface가 되므로 금지합니다. 필요한 경우 script는 opaque-origin sandbox + `postMessage`로 통신하거나, 렌더 전에 script를 제거합니다.
- 인증 middleware 때문에 `401 auth_required`가 뜬 것은 middleware 동작만 확인한 것입니다. 엔드포인트 검증으로 인정하려면 로그인/테스트 토큰/인증 mock으로 실제 route handler와 service behavior까지 확인해야 합니다.

### 검증

- 변경 workspace에 맞는 빌드를 실행합니다.
  - Web 변경: `npm run build --workspace=apps/web`
  - Server 변경: `npm run build --workspace=apps/server`
  - NestJS module/provider/service/middleware 변경: `npm run dev:server`로 부팅까지 확인
  - Schema 변경: `npm run db:push` + `npx prisma generate` + `cd packages/shared && npm run build`
- 변경 도메인의 unit/integration test가 있으면 관련 test를 실행합니다.
- `git diff --check origin/main...HEAD`로 whitespace/conflict marker를 확인합니다.
- 로컬 환경에서 검증할 수 없는 항목은 숨기지 말고 PR 코멘트에 "미검증/환경 필요"로 구체적으로 남깁니다.

## 리뷰 등록

1. 위반/이슈는 `file:line`으로 구체적으로 나열하고 severity를 붙입니다.
2. merge conflict, CI 누락, 로컬 환경 한계, 외부 API key 필요 등은 별도 "검증 제한" 섹션에 정리합니다.
3. blocking 이슈가 있으면 `gh pr review <번호> --request-changes`, 없고 검증이 충분하면 `gh pr review <번호> --approve`로 등록합니다.
4. 검증 제한만 남아 있고 코드상 blocking 이슈는 없으면 approve 대신 일반 코멘트로 어떤 항목을 현재 환경에서 추가 확인해야 하는지 요청합니다.
