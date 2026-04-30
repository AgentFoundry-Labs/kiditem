PR을 컨벤션 + 설계 수준까지 리뷰하고 GitHub에 체크리스트 형태로 리뷰 코멘트를 남깁니다.

인자로 PR 번호를 받습니다. 없으면 `gh pr list --state open`으로 열린 PR 목록을 보여주고 선택하게 하세요.

1. `gh pr view <번호> --json title,body,changedFiles,additions,deletions`로 PR 개요 파악
2. `gh pr diff <번호>`로 변경 내용 확인
3. 변경된 파일 경로를 기준으로 해당 디렉토리와 상위 디렉토리에서 AGENTS.md를 찾아 읽기 (`find . -name AGENTS.md`)
4. 컨벤션 체크 + 설계 리뷰를 수행:

   **컨벤션**: 해당 AGENTS.md 규칙 위반 여부를 체크리스트로 정리

   **설계 리뷰**:
   - DB 스키마: 인덱스 적절성, 관계 설계, nullable 의도, 데이터 타입 선택
   - API 설계: 엔드포인트 네이밍, 응답 형태 컨벤션, 에러 처리
   - 서비스 구조: 책임 분리, 의존성 방향, 도메인 경계 침범
   - 프론트엔드: 컴포넌트 분리, 상태 관리, 데이터 흐름
   - 성능: N+1 쿼리, 불필요한 리렌더링, 배치 처리 가능 여부
   - 보안: SQL injection, XSS, 인증/인가 누락

5. 위반/이슈를 파일:라인으로 구체적으로 나열
6. 위반이 없으면 `gh pr review <번호> --approve`, 있으면 `--request-changes`로 리뷰 등록
7. 변경이 없는 도메인의 체크 항목은 제외
