# detail_page_generate — 상세페이지 1-call 생성 에이전트

> **이 프롬프트는 placeholder 다.** Phase 1 PR 에서는 blueprint 와 output schema/bridge
> 골격만 정리하고, 실제 production endpoint 는 아직 이 agent type 으로 라우팅하지 않는다.
> 실제 라우팅은 Phase 2 PR 에서 `apps/server/src/ai/application/service/detail-page-ai.service.ts`
> 의 sync path 를 Agent OS enqueue 로 바꿀 때 함께 마무리한다.

## 책임

1688/Alibaba scrape payload (rawTitle, rawCategory, rawDescription, rawOptions, imageUrls) 를
받아 한국 쿠팡 상세페이지 카피와 이미지 인덱스를 한 번의 호출로 생성한다.
지원 템플릿: `kids-playful` (11 섹션) / `bold-vertical` (히어로 + POINT + DETAIL).

## 입력 (`AgentRunRequest.payload`)

```jsonc
{
  "templateId": "kids-playful" | "bold-vertical",
  "raw": {
    "rawTitle": string,
    "rawCategory": string,
    "rawDescription": string,
    "rawOptions": string,
    "imageUrls": string[]
  },
  "heroImageMode": "first" | "llm-pick",
  "reservedPackageImageIndices": number[]?, // kids-playful only
  "safetyLabelImageIndices": number[]?      // kids-playful only
}
```

## 출력 (`AgentRun.output`)

ai 도메인의 `detail-page-generate.schema.ts` Zod 스키마가 enforce 한다.
간략 형태:

```jsonc
{
  "templateId": "kids-playful" | "bold-vertical",
  "result": <DetailPageGeneration | BoldVerticalGeneration>,
  "imageUrls": string[]
}
```

`result` 의 정확한 모양은 ai 도메인의
`apps/server/src/ai/domain/prompts/detail-page/single-call.ts`
(kids-playful) 또는 `apps/server/src/ai/domain/prompts/bold-vertical/single-call.ts`
(bold-vertical) 의 Zod 스키마와 일치한다.

## 제약

- 응답은 JSON 객체 1 개만. 다른 텍스트/코드펜스 금지.
- 모든 카피는 한국어. 광고 톤. 짧고 임팩트.
- 모든 `imageIndex` 필드는 입력 이미지 후보의 0-based 인덱스 또는 `null`.
- ai 도메인의 templateId 별 프롬프트(`SINGLE_CALL_SYSTEM` / `BOLD_VERTICAL_SYSTEM`)
  와 cross-section 일관성 규칙을 그대로 따른다 — 이 placeholder 는 단지 contract
  를 환기시키고, 실제 시스템 프롬프트 본문은 Phase 2 에서 ai 도메인이
  Agent OS payload 로 전달한다.
