# web/sourcing — Original Source Candidate Archive

Sourcing UI 는 원본 소스 후보 아카이브다. 두 단계만 가진다:
**후보 리스트** 와 **후보 상세 + 액션(promote / reject)**.

후보 단계에는 AI 편집기 / 상세페이지 편집기 surface 가 없다. AI 생성 / 편집은 master-side surfaces 재사용:

- 상세페이지 생성/편집 → `/generate?productId={master.id}&sourceCandidateId={candidate.id}` 또는 product-less `/generate?sourceCandidateId={candidate.id}`
- 상세페이지 결과 관리/에디터 → `/product-content/{master.id}`, `/product-content/groups/{group.id}`, 또는 `/product-content/detail-pages/{generation.id}/editor`
- 썸네일 편집 → `/thumbnail-editor/edit?productId={master.id}&mode=edit&editCase=single` `(media-ai)/thumbnail-editor/`

후보 페이지는 source 데이터 read-only 표시 + promote / reject 액션만.
후보 상세의 연결된 생성 콘텐츠 패널은 AI-domain read model
`GET /api/ai/content-archive/sourcing/:candidateId` 를 읽는 navigation surface
일 뿐이고, sourcing 도메인이 produced content 를 소유하지 않는다.

## Layout

```text
sourcing/
  page.tsx                                          후보 리스트
  [id]/page.tsx                                     후보 상세
  [id]/components/
    ProductTabContent.tsx                           탭 컨텐츠 (basic/options/detail/history/raw)
    LinkedProducedContentPanel.tsx                  AI 생성 콘텐츠 read-only 링크 패널
    ProductErrorView.tsx, ProductLoadingView.tsx
  [id]/hooks/useProductDetail.ts                    후보 단건 fetch
  components/list/                                  리스트 카드/툴바/스크랩 입력
  components/detail/
    ProductEditHeader.tsx                           헤더 + promote/reject 버튼
    ProductEditTabs.tsx
    MobilePreview.tsx, RawDataTab.tsx,
    ThumbnailGrid.tsx, TagEditor.tsx
  hooks/                                            useProcessingIds, useScrapeUrl
  lib/sourcing-api.ts                               SourcedProduct + productsApi + candidatesApi
  lib/types.ts                                      ProductEditState, mapProcessedData, PLACEHOLDER_DATA
```

## List Page

- 50 rows/page.
- `processingIds` tracks in-flight AI gens on each candidate's promoted master (post-promotion).
- Poll only while `status === 'sourced'` exists: `refetchInterval: hasActive ? 10000 : false`.
- URL scrape calls `POST /api/sourcing/scrape-url`.
- Card 클릭 → `/sourcing/{candidate.id}` 로 이동.

## Detail Page

- `useProductDetail(candidateId)` → `productsApi.getDetail(id)` → `/api/sourcing/:id` 단건.
- 탭: `basic` (기본정보 — 카테고리/이름/태그/상품정보, 편집은 로컬 미리보기 상태), `options` (placeholder), `detail` / `history` (product-content workspace 링크 + 생성 콘텐츠 read-only 패널), `raw` (source rawData 표시 read-only).
- **DB write 없음.** 후보 자체 mutation 은 promote / reject 두 use-case 만 (`candidatesApi.{promote,reject}`).

## Promote / Reject

- `ProductEditHeader` 가 `status === 'sourced'` 일 때만 promote / reject 버튼 노출.
- promote 성공 시 master 가 생성됨 (backend `POST /api/sourcing/candidates/:id/promote`). 응답의 `masterId` 로 `/product-hub/{masterId}` 또는 `/generate?productId={masterId}` 안내.
- reject 시 `status='rejected'` + `rejectedAt/rejectedReason/rejectedByUserId` 채워짐.

## Hard Bans

- 후보 리스트에 AI 생성/편집/produced-content 관리 surface 다시 추가하지 말 것. AI 작업은 `(media-ai)/generate`, `(catalog)/product-content`, `(media-ai)/thumbnail-editor/edit` 가 소유한다.
- Sourcing service/UI 가 `ContentGeneration` 을 직접 소유하거나 mutation 하지 말 것. 연결 조회는 AI-domain linkage API 를 통해서만 한다.
- Direct DB update from this page.
- `setInterval` 폴링. `refetchInterval` 사용.
- `organizationId` 를 body/query 에 보내지 말 것.
- `useGenerationStatusFloater`, `useGenerationHistory`, `useGenerateDetailPage`, `useKidsPlayfulFromSourcing`, `useGenerateSourcingThumbnail` 같은 후보-단계 AI 훅 재도입 금지.

## Change Map

| 변경 | 함께 갱신 |
|---|---|
| 후보 status 머신 | `@kiditem/shared/sourcing` candidate-status + backend service |
| promote / reject DTO | `lib/sourcing-api.candidatesApi` + backend DTO |
| 폴링 조건 | `isInProgress(status)` 사용 (status='sourced' 만 polling) |
| master-side 편집 경로 | `(catalog)/product-content`, `(media-ai)/generate`, `(media-ai)/thumbnail-editor/edit` 라우트 + ProductTabContent 의 placeholder 링크 |
