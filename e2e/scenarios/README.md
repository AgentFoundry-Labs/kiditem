# E2E QA 시나리오

Claude CLI의 `/qa` 스킬 또는 browse 도구로 실행하는 시나리오 기반 QA 테스트.

## 실행 방법

```bash
# 특정 시나리오 QA 실행
/qa e2e/scenarios/agent-crud.md 시나리오대로 테스트해줘

# 전체 시나리오 순차 실행
/qa localhost:3000 --exhaustive
```

## 시나리오 목록

| 파일 | 범위 | 우선순위 |
|---|---|---|
| `agent-crud.md` | Agent OS 설치/삭제/목록/상세 | P0 |
| `product-pipeline.md` | 소싱→상품→썸네일 파이프라인 | P0 |

## 시나리오 작성 규칙

1. **전제조건** 명시 (서버 상태, 필요 데이터)
2. **단계별** 사용자 액션 + 기대 결과 기술
3. **검증 기준** 체크리스트로 마무리
4. 각 단계는 독립 실행 가능하도록 작성
