// KIDITEM OS — Wing 대표이미지 등록 자동화

(function () {
  "use strict";

  if (!location.hostname.includes("wing.coupang.com")) return;

  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (!found) return;
        observer.disconnect();
        resolve(found);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`waitForElement timeout: ${selector}`));
      }, timeout);
    });
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
          /* retry */
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

  function setInputValue(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    if (nativeSetter) nativeSetter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findButtonByText(labels) {
    const buttons = Array.from(document.querySelectorAll("button, a"));
    return buttons.find((button) => {
      const text = normalize(button.textContent);
      return labels.some((label) => text.includes(normalize(label)));
    }) || null;
  }

  async function openProductEdit(productName) {
    if (!location.href.includes("vendor-inventory/list")) {
      return { success: false, error: "Wing 상품 목록 화면이 아닙니다" };
    }

    const searchInput = await waitForElement(
      'input[placeholder*="상품"], input[placeholder*="검색"], input[type="search"], input[class*="search"]',
      20000,
    );
    searchInput.focus();
    setInputValue(searchInput, productName);
    searchInput.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }),
    );
    searchInput.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Enter", keyCode: 13, bubbles: true }),
    );
    document
      .querySelector('button[type="submit"], button[class*="search"], [class*="btn-search"]')
      ?.click();

    await waitForElement('table tbody tr, [class*="product-row"], [class*="item-row"]', 25000);
    await new Promise((resolve) => setTimeout(resolve, 700));

    const target = findProductRow(productName);
    if (!target) {
      return { success: false, error: `"${productName}" 상품을 찾을 수 없습니다` };
    }

    const editButton = findEditControl(target);
    if (!editButton) return { success: false, error: "수정 버튼을 찾을 수 없습니다" };

    const href = editButton instanceof HTMLAnchorElement ? editButton.href : "";
    if (href) {
      editButton.target = "_self";
      window.location.href = href;
      return { success: true, navigating: true, editUrl: href };
    }

    editButton.click();
    return { success: true, navigating: true };
  }

  function findProductRow(productName) {
    const expected = normalize(productName);
    const rows = Array.from(
      document.querySelectorAll('table tbody tr, [class*="product-row"], [class*="item-row"]'),
    );
    return rows.find((row) => {
      const nameCell =
        row.querySelector('[class*="name"], [class*="title"], td:nth-child(2), td:first-child') ||
        row;
      return normalize(nameCell.textContent).includes(expected);
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

  async function uploadThumbnail(productName, image) {
    await waitForElement(".customdropzone", 30000);

    const sellerProductName = readSellerProductName();
    if (sellerProductName && normalize(sellerProductName) !== normalize(productName)) {
      return {
        success: false,
        error: `상품명 불일치: ${sellerProductName.slice(0, 40)}`,
      };
    }

    const dropzones = Array.from(document.querySelectorAll(".customdropzone"));
    const dropzoneIndex = pickRepresentativeDropzoneIndex(dropzones);
    const dropzone = dropzones[dropzoneIndex];
    if (!dropzone) return { success: false, error: "대표이미지 업로드 영역을 찾을 수 없습니다" };

    await removeExistingPreview(dropzone);

    const fileInput = pickFileInput(dropzoneIndex);
    if (!fileInput) return { success: false, error: "대표이미지 파일 입력을 찾을 수 없습니다" };

    const file = dataUrlToFile(image.dataUrl, image.filename || "thumbnail.png", image.mimeType);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

    await waitForCondition(() => dropzone.querySelector(".dz-preview"), 20000);
    await waitForCondition(() => {
      const preview = dropzone.querySelector(".dz-preview");
      if (!preview) return false;
      return (
        !preview.classList.contains("dz-processing") &&
        !preview.classList.contains("dz-uploading")
      );
    }, 45000).catch(() => null);

    return { success: true };
  }

  function readSellerProductName() {
    const input = document.querySelector('input[placeholder*="등록상품명"]');
    return input ? input.value || "" : "";
  }

  function pickRepresentativeDropzoneIndex(dropzones) {
    const optionIndex = dropzones.findIndex((element) =>
      element.parentElement?.parentElement?.className?.includes("item-rep-cell"),
    );
    return optionIndex >= 0 ? optionIndex : 0;
  }

  async function removeExistingPreview(dropzone) {
    const preview = dropzone.querySelector(".dz-preview");
    if (!preview) return;

    preview.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    const removeButton = preview.querySelector("a.dz-action.dz-action-remove, .dz-remove");
    if (!removeButton) return;
    removeButton.click();

    const confirmButton = await waitForCondition(
      () => findButtonByText(["네, 삭제합니다", "삭제합니다", "삭제"]),
      10000,
    ).catch(() => null);
    if (confirmButton) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      confirmButton.click();
    }

    await waitForCondition(() => !dropzone.querySelector(".dz-preview"), 15000).catch(() => null);
  }

  function pickFileInput(dropzoneIndex) {
    const inputs = Array.from(document.querySelectorAll("input.dz-hidden-input"));
    return inputs[dropzoneIndex] || inputs[0] || null;
  }

  function dataUrlToFile(dataUrl, filename, mimeType) {
    const [, base64 = ""] = dataUrl.split(",");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], filename, { type: mimeType || "image/png" });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === "kiditemOpenWingProductEdit") {
      openProductEdit(msg.productName)
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (msg.action === "kiditemUploadWingThumbnail") {
      uploadThumbnail(msg.productName, msg.image || {})
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }
  });

  console.log("[KIDITEM] wing-thumbnail-register.js loaded");
})();
