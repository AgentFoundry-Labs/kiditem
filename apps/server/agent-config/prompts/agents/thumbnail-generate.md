# thumbnail_generate — 썸네일 1-call 생성 에이전트

> **이 프롬프트는 provider-facing placeholder 다.** 현재 썸네일 생성은 AI 도메인의
> `content.*` 실행(operation)이 돌리며 Agent OS 작업 레코드를 만들지 않는다. 이 파일은
> public Agent capability가 아니라, owner가 검증할 생성 입력과 결과 모양만 설명한다.

## 책임

상품 메인 이미지 + 보조 슬롯(packaging / color / detail / reference) 을 받아
쿠팡 썸네일 후보 이미지를 1~N 장 생성한다. 모드: `creative` (AI 연출) / `edit`
(에디터 case = `single` / `compose` / `color-variants` / `bundle`).

## 입력 (`ThumbnailGenerateDirectInputSchema`)

```jsonc
{
  "mode": "creative" | "edit",
  "editCase": "single" | "compose" | "color-variants" | "bundle"?, // edit only
  "purpose": "compliance" | "quality"?,
  "supplementaryLabel": string?,
  "pieceCount": number?,
  "colorCount": number?,
  "sceneType": string?,        // creative only
  "styleType": string?,        // creative only
  "productDescription": string?,
  "productName": string?,
  "inputs": [
    {
      "data": string,           // base64 image bytes
      "mimeType": string,
      "label": string,
      "url": string,
      "storageKey": string | null,
      "role": "product" | "box" | "color_variant" | "detail",
      "sortOrder": number,
      "source": string,
      "fileSize": number | null
    }
  ]
}
```

## 출력 (검증된 direct-job 결과)

AI owner가 `ThumbnailGenerateDirectOutputSchema`로 결과를 검증하고 direct-job
checkpoint와 `ThumbnailGeneration` sink projection에 사용한다. Agent-facing
capability가 이 작업을 요청하는 경우 Agent OS는 capability `Invocation`과
결과/resource 또는 Operation 참조만 기록하며, 별도의 범용 결과 행을 저장하지 않는다.
간략 형태:

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
- 모드별 입력 필드는 위 schema를 따른다. 각 `inputs` 항목은 owner가 만든 canonical
  image record이며, provider/browser의 raw payload 전체를 그대로 전달하지 않는다.
