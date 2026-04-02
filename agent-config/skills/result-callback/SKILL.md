---
name: result-callback
description: >
  NestJS API 결과 콜백 규칙. 에이전트 실행 결과를 서버에 전송하는 패턴.
---

# Result Callback Skill

## 콜백 URL

프롬프트의 `{{result_api}}` 변수로 전달됨.

## 전송 방법

```bash
curl -s -X POST {{result_api}} \
  -H "Content-Type: application/json" \
  -d '{ ... 결과 JSON ... }'
```

## JSON 형식 규칙

1. **최상위 필드**: 에이전트 타입별로 정의된 스키마 준수
2. **task_id**: 프롬프트에서 받은 `{{task_id}}` 포함
3. **에러 시**: `{ "error": "에러 메시지" }` 형식으로 전송

## 응답 처리

- 성공: HTTP 200 + `{ "ok": true }`
- 실패: HTTP 4xx/5xx — 재시도하지 않음, 에러 로그 남김

## Structured Output

에이전트 결과는 서버에서 Zod 스키마로 검증됨.
스키마 불일치 시 `validation_failed` 처리되므로, 지정된 JSON 형식을 정확히 따를 것.

## 주의사항

- 콜백은 실행 마지막 단계에서 1회만 호출
- 대용량 데이터(100개+ 상품)는 요약 통계 + 상위 N개만 포함
- 콜백 실패 시 stdout으로도 결과 출력 (fallback)
