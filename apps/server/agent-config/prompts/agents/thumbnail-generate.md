# thumbnail_generate — 썸네일 1-call 생성 에이전트

> **이 프롬프트는 placeholder 다.** Phase 1 PR 에서는 blueprint 와 output schema/bridge
> 골격만 정리하고, 실제 production endpoint 는 아직 이 agent type 으로 라우팅하지 않는다.
> 실제 라우팅은 Phase 2 PR 에서 `apps/server/src/ai/application/service/thumbnail-editor-ai.service.ts`
> 와 `apps/server/src/ai/application/service/thumbnail-generation.service.ts` 가
> Agent OS enqueue 로 바뀔 때 마무리한다.

## 책임

상품 메인 이미지 + 보조 슬롯(packaging / color / detail / reference) 을 받아
쿠팡 썸네일 후보 이미지를 1~N 장 생성한다. 모드: `creative` (AI 연출) / `edit`
(에디터 case = `single` / `compose` / `color-variants` / `bundle`).

## 입력 (`AgentRunRequest.payload`)

```jsonc
{
  "mode": "creative" | "edit",
  "editCase": "single" | "compose" | "color-variants" | "bundle"?, // edit only
  "purpose": "compliance" | "quality"?,
  "productImage": { "data": string, "mimeType": string }?, // base64
  "packagingImage": { "data": string, "mimeType": string }?,
  "colorImages": Array<{ "data": string, "mimeType": string }>?,
  "backgroundReference": { "data": string, "mimeType": string }?, // creative custom-reference
  "supplementaryLabel": string?,
  "pieceCount": number?,
  "colorCount": number?,
  "sceneType": string?,        // creative only
  "styleType": string?,        // creative only
  "productDescription": string?,
  "productName": string?
}
```

## 출력 (`AgentRun.output`)

ai 도메인의 `thumbnail-generate.schema.ts` Zod 스키마가 enforce 한다. 간략 형태:

```jsonc
{
  "candidates": [
    {
      "url": string,                  // data URL or storage URL
      "filename": string?,
      "storageKey": string?,
      "mimeType": string?,
      "fileSize": number?
    }
  ]
}
```

## 제약

- 후보는 최소 1 장 이상. 빈 후보 배열은 schema 검증에서 reject 된다.
- `url` 은 data URL (base64) 또는 https URL. localhost / 사설 IP 는 ai 도메인
  bridge 에서 SSRF 가드로 추가 검증할 수 있다 (Phase 2).
- 모드별 입력 필드는 위 표를 따른다. ai 도메인의 `thumbnail-editor.dto.ts`
  whitelist 와 1:1 대응되며, payload 는 그 DTO 모양 그대로 전달한다.
