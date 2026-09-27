// 쿠팡 WING 대표이미지 바꾸기(ISOLATED world, KID-256 — 옛 `content/coupang/wing-thumbnail-register.js` 이식).
// 확장 런타임 몰 쓰기(`extensions/src/sites/wing/thumbnail.ts`)가 넣고 부른다:
//   `wingThumb.findEdit` — 상품명으로 검색한 윙 상품목록에서 그 상품 줄의 [수정] 주소를 읽는다(누르지 않는다).
//   `wingThumb.upload`   — 상품 수정 화면(formV2)의 대표이미지 칸에 사진 하나를 올린다. 원래 사진은 지운다. [저장]은
//                          누르지 않는다 — 올린 화면을 운영자가 보고 저장한다.
(function () {
  "use strict";

  const calls = globalThis.__kiditemIsolatedPageCalls || (globalThis.__kiditemIsolatedPageCalls = {});

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function waitForCondition(check, timeout = 15000, interval = 250) {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const tick = () => {
        try {
          const result = check();
          if (result) {
            resolve(result);
            return;
          }
        } catch {
          /* 다시 본다 */
        }
        if (Date.now() - startedAt >= timeout) {
          reject(new Error("조건 대기 시간이 초과되었습니다"));
          return;
        }
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  function findButtonByText(labels) {
    const buttons = Array.from(document.querySelectorAll("button, a"));
    return buttons.find((button) => {
      const text = normalize(button.textContent);
      return labels.some((label) => text.includes(normalize(label)));
    }) || null;
  }

  function findProductRow(productName) {
    const expected = normalize(productName);
    const rows = Array.from(document.querySelectorAll('table tbody tr, [class*="product-row"], [class*="item-row"]'));
    // 이름 칸 후보 중 하나라도 상품명을 담으면 그 줄이다(옛 코드는 문서 순서로 첫 후보 — 보통 체크박스 칸 — 만 봤다).
    return rows.find((row) => {
      const cells = Array.from(row.querySelectorAll('[class*="name"], [class*="title"], td:nth-child(2), td:first-child'));
      return (cells.length > 0 ? cells : [row]).some((cell) => normalize(cell.textContent).includes(expected));
    }) || null;
  }

  function findEditControl(row) {
    const controls = Array.from(row.querySelectorAll("button, a"));
    return controls.find((control) => {
      const text = normalize(control.textContent);
      return text === "수정" || text === "편집" || text === "edit";
    }) || controls.find((control) => {
      const text = normalize(control.textContent);
      return text.includes("수정") || text.includes("편집");
    }) || null;
  }

  /** 검색된 상품목록에서 그 상품 줄의 [수정] 주소. 줄이나 주소가 없으면 까닭을 돌려준다(누르지 않는다). */
  async function findEdit(productName) {
    if (!location.href.includes("vendor-inventory/list")) return { ok: false, error: "Wing 상품 목록 화면이 아닙니다" };
    await waitForCondition(() => document.querySelector('table tbody tr, [class*="product-row"], [class*="item-row"]'), 25000)
      .catch(() => null);
    const row = findProductRow(productName);
    if (!row) return { ok: false, error: `"${productName}" 상품을 찾을 수 없습니다` };
    const control = findEditControl(row);
    if (!control) return { ok: false, error: "수정 버튼을 찾을 수 없습니다" };
    const href = control instanceof HTMLAnchorElement ? control.href : "";
    if (!href) return { ok: false, error: "수정 화면 주소를 읽지 못했습니다" };
    return { ok: true, editUrl: href };
  }

  function readSellerProductName() {
    const input = document.querySelector('input[placeholder*="등록상품명"]');
    return input ? input.value || "" : "";
  }

  function pickRepresentativeDropzoneIndex(dropzones) {
    const optionIndex = dropzones.findIndex((element) => element.parentElement?.parentElement?.className?.includes("item-rep-cell"));
    return optionIndex >= 0 ? optionIndex : 0;
  }

  /** 원래 대표이미지를 지운다 — 화면의 삭제 확인(화면 안 창)만 누른다. 폼은 저장하지 않는다. */
  async function removeExistingPreview(dropzone) {
    const preview = dropzone.querySelector(".dz-preview");
    if (!preview) return;
    preview.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    const removeButton = preview.querySelector("a.dz-action.dz-action-remove, .dz-remove");
    if (!removeButton) return;
    removeButton.click();
    const confirmButton = await waitForCondition(() => findButtonByText(["네, 삭제합니다", "삭제합니다"]), 10000).catch(() => null);
    if (confirmButton) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      confirmButton.click();
    }
    await waitForCondition(() => !dropzone.querySelector(".dz-preview"), 15000).catch(() => null);
  }

  function dataUrlToFile(dataUrl, filename, mimeType) {
    const [, base64 = ""] = String(dataUrl).split(",");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename, { type: mimeType || "image/png" });
  }

  /** 대표이미지 칸에 사진 하나를 올린다. 등록상품명이 다르면 다른 상품의 화면이다 — 올리지 않는다. */
  async function upload(productName, image) {
    const steps = [];
    await waitForCondition(() => document.querySelector(".customdropzone"), 30000).catch(() => null);
    const dropzones = Array.from(document.querySelectorAll(".customdropzone"));
    if (dropzones.length === 0) return { ok: false, error: "대표이미지 업로드 영역을 찾을 수 없습니다", steps };
    const sellerProductName = readSellerProductName();
    if (productName && sellerProductName && normalize(sellerProductName) !== normalize(productName)) {
      return { ok: false, error: `상품명 불일치: ${sellerProductName.slice(0, 40)}`, steps };
    }
    const index = pickRepresentativeDropzoneIndex(dropzones);
    const dropzone = dropzones[index];
    await removeExistingPreview(dropzone);
    steps.push("원래 대표이미지 지우기");
    const inputs = Array.from(document.querySelectorAll("input.dz-hidden-input"));
    const fileInput = inputs[index] || inputs[0] || null;
    if (!fileInput) return { ok: false, error: "대표이미지 파일 입력을 찾을 수 없습니다", steps };
    const transfer = new DataTransfer();
    transfer.items.add(dataUrlToFile(image.dataUrl, image.filename || "thumbnail.png", image.mimeType));
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    const preview = await waitForCondition(() => dropzone.querySelector(".dz-preview"), 20000).catch(() => null);
    if (!preview) return { ok: false, error: "대표이미지가 올라가지 않았습니다", steps };
    await waitForCondition(() => {
      const current = dropzone.querySelector(".dz-preview");
      return current && !current.classList.contains("dz-processing") && !current.classList.contains("dz-uploading");
    }, 45000).catch(() => null);
    const failed = dropzone.querySelector(".dz-preview.dz-error");
    if (failed) return { ok: false, error: "윙이 대표이미지를 받지 않았습니다", steps };
    steps.push("새 대표이미지 올리기");
    return { ok: true, steps };
  }

  calls["wingThumb.findEdit"] = (args) => findEdit(args && args.productName);
  calls["wingThumb.upload"] = (args) => upload(args && args.productName, (args && args.image) || {});
})();
