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
- Keep route-specific copy in the caller's `intro`.
