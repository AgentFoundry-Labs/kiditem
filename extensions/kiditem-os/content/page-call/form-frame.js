// 몰 등록 폼 프레임 살피기(ISOLATED, 모든 프레임, KID-256). 폼이 다른 도메인 iframe에 있는 몰(떠리몰)·모든 프레임에 넣는 몰
// (11번가)이 채울 프레임을 고를 때 `TabPage.frames`로 넣는다. 파일의 마지막 식 값이 그 프레임의 답이다 — 주소와 문서 시각
// (같은 문서가 가라앉았는지 본다)만 돌려주고 아무것도 바꾸지 않는다.
({ href: location.href, doc: performance.timeOrigin });
