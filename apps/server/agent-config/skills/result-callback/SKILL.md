---
name: result-callback
description: >
  작업 완료 후 NestJS API로 결과를 전송하는 규칙.
  모든 에이전트는 이 스킬의 패턴을 따라 결과를 보고해야 함.
---

# Result Callback Skill

## 콜백 규칙

작업이 완료되면 결과를 프롬프트에 지정된 `{{result_api}}` URL로 전송.

```bash
curl -s -X POST {{result_api}} \
  -H "Content-Type: application/json" \
  -d '{ ... 결과 JSON ... }'
```

## 필수 필드

모든 결과 JSON에 포함:
- 에이전트별 결과 데이터 (actions, products 등)
- `summary` 객체 (요약 통계)

## 에러 처리

- curl 실패 시 1회 재시도
- 재시도도 실패하면 stdout으로 결과 출력 (fallback)
- 절대 결과를 누락하지 말 것

## 주의

- `{{result_api}}`는 프롬프트에서 자동 치환됨
- URL을 직접 구성하지 말 것
- POST 요청만 사용
