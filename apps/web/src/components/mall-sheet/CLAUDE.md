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
- 상품 × 몰에 등록 설정이 여러 개면 사람이 고른 설정으로만 확인 · 파일 · 분류 저장을 한다. 선택을
  바꾸면 이전 확인 결과로 파일을 만들지 않는다 — 다시 확인을 눌러야 받기가 열린다. 받기는 몰이 한
  파일에 받는 수로 나누므로 그 묶음에 든 상품의 선택만 보낸다. 설정 0개 · 1개는 화면이 그대로다.
- Keep route-specific copy in the caller's `intro`.
