Before working in this directory, always read this document first rather than relying on memory.

# web/components/mall-sheet — Mall Bulk-Sheet Dialog

An intentional shared domain surface: 판매상품 (`/product-hub/sales-products`,
missing-from-mall scope) and 수집상품 (`/product-pipeline/collected-products`,
the selected candidates' sales products) open the same dialog. It reads and
writes only through `salesProductApi`.

- The dialog produces files only. It never uploads to a mall or marks a
  listing registered; a suggested category is saved only when the operator
  presses save.
- [사진 올리기] sends only our storage photos (`PUBLIC_IMAGE_SOURCE_ORIGINS`,
  mirrored in the extension) to the extension's `hostPublicImages`, saves each
  batch's public URLs as copies, and stops on a Kidsnote login prompt.
- 판매상품 × 채널계정의 등록 설정은 활성 상태가 늘 0개 아니면 1개다(ADR-0022, KID-310) — 이
  창은 등록 설정을 고르지 않는다. 확인 · 파일 · 분류 저장은 그 하나뿐인 설정(있으면)을 그대로
  쓴다.
- Keep route-specific copy in the caller's `intro`.
