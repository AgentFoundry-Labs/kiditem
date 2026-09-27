(function initializeMallUtilityActions(root) {
  "use strict";

  // 몰 등록 보조 웹 액션 두 개(KID-256 — 옛 `mall-form-register.js`에서 떼어 남긴 것): 온채널 분류 목록(`listMallCategories`)과
  // 몰 대량등록 사진 올리기(`hostPublicImages`). 몰 폼 채우기·제출은 확장 런타임 몰 쓰기 모듈(`extensions/src/sites/<mall>/
  // registration.ts`)로 옮겼다. 이 두 액션은 실행 계약 밖의 웹 보조 호출이라 여기 남는다 — KID-366에서 실행 kind
  // `channels.mall_category_read`·`channels.mall_image_host`로 옮기거나 그때 지운다.
  //
  // 창을 열지 않는다. 서비스워커가 몰 관리자 쿠키로 부른다.

  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

  /** 온채널 상품등록 화면의 분류 목록(계단식 4단). 단계마다 앞 단계 값으로 다음 목록을 받는다. */
  const CATEGORY_SOURCES = {
    onch: {
      label: "온채널",
      origin: "https://www.onch3.co.kr",
      path: "/access/ajax_pending_product_access.php",
      fixed: { ubr: "getCategory" },
      depthParam: "depth",
      levelParams: ["cate_first", "cate_second", "cate_third"],
      itemsKey: "datas",
      nameKey: "name",
      levels: 4,
    },
  };

  /**
   * 우리 상점 첨부 저장소(키즈노트). 첨부 목록에 생긴 카카오 CDN 주소가 공개 주소다(`kids-wi.kakaocdn.net/dn/...`, CORS 열림).
   * 상품은 만들어지지 않는다 — `pno`는 등록화면이 발급하는 빈 번호일 뿐이다.
   */
  const KIDSNOTE_HOST = {
    origin: "https://shop.kidsnote.com",
    registerPath: "/_manage/?body=product@product_register",
    uploadPath: "/_manage/",
    listPath: "/_manage/?body=product@product_file.frm&filetype=3&stat=1&content_id=content2",
    filetype: "3",
    label: "키즈노트 첨부 저장소",
    loginLabel: "키즈노트 관리자",
  };
  const HOSTED_URL = /https?:\/\/[A-Za-z0-9.-]*kakaocdn\.net\/dn\/[^"'\s<>()]+/g;

  /** 몰 대량등록 사진 올리기가 읽어도 되는 곳 — 우리 사진 저장소(로컬·사무실 MinIO)뿐이다(매니페스트 host_permissions와 같다). */
  const PUBLIC_IMAGE_SOURCE_ORIGINS = ["http://localhost:9000", "http://kiditem-office:9000"];
  /** 한 번 부를 때 올리는 사진 수. 웹이 나눠 부르며 진행을 보인다. */
  const PUBLIC_IMAGE_BATCH = 20;

  /** 사진 올리기 요청의 주소 목록 — 우리 저장소 주소만, 겹치지 않게, 한 묶음까지. */
  function publicImageSources(value) {
    if (!Array.isArray(value) || value.length === 0) throw new Error("올릴 사진 주소가 없습니다.");
    if (value.length > PUBLIC_IMAGE_BATCH) throw new Error(`사진은 한 번에 ${PUBLIC_IMAGE_BATCH}장까지 올립니다.`);
    const urls = [];
    for (const raw of value) {
      let url;
      try {
        url = new URL(String(raw || "").trim());
      } catch {
        throw new Error("사진 주소가 올바르지 않습니다.");
      }
      if (!PUBLIC_IMAGE_SOURCE_ORIGINS.includes(url.origin)) throw new Error(`우리 사진 저장소 주소만 올립니다 — ${url.origin}`);
      if (!urls.includes(url.href)) urls.push(url.href);
    }
    return urls;
  }

  /** 올릴 때 쓸 파일명. 저장소가 확장자를 보므로 없으면 붙여 준다. */
  function fileNameFor(sourceUrl, mime) {
    let base = "detail";
    try { base = new URL(sourceUrl).pathname.split("/").pop() || base; } catch { /* 주소가 아니면 기본값 */ }
    if (/\.(jpe?g|png|gif|webp)$/i.test(base)) return base;
    const extension = String(mime || "").includes("png") ? "png" : "jpg";
    return `${base}.${extension}`;
  }

  function create({ fetch: fetchApi }) {
    /** 사진 하나를 키즈노트 첨부 저장소에 올리고 공개 주소를 받는다(빈 상품번호 → 올리기 → 첨부 목록에서 주소 집기). */
    async function hostImage(sourceUrl) {
      const decode = (buffer) => new TextDecoder("euc-kr").decode(buffer);
      const source = await fetchApi(sourceUrl);
      if (!source.ok) throw new Error(`사진을 읽지 못했습니다 — HTTP ${source.status}`);
      const blob = await source.blob();
      if (blob.size > MAX_IMAGE_BYTES) throw new Error("사진이 8MB 를 넘습니다.");
      if (!/^image\//i.test(blob.type || "")) throw new Error("사진 파일이 아닙니다.");
      const read = async (path) => {
        const response = await fetchApi(KIDSNOTE_HOST.origin + path, { credentials: "include" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return decode(await response.arrayBuffer());
      };
      const page = await read(KIDSNOTE_HOST.registerPath);
      const pno = (page.match(/name=["']?pno["']?[^>]*value=["']?(\d+)/i) || [])[1];
      if (!pno) {
        // 번호가 없는 건 거의 언제나 로그인 화면이 온 것이다.
        const error = new Error("상품번호를 받지 못했습니다.");
        error.needsLogin = true;
        throw error;
      }
      const body = new FormData();
      body.append("body", "product@product_file.exe");
      body.append("pno", pno);
      body.append("upload_one", "Y");
      body.append("filetype", KIDSNOTE_HOST.filetype);
      body.append("ino", "");
      body.append("upfile", blob, fileNameFor(sourceUrl, blob.type));
      const upload = await fetchApi(KIDSNOTE_HOST.origin + KIDSNOTE_HOST.uploadPath, { method: "POST", body, credentials: "include" });
      if (!upload.ok) throw new Error(`업로드 응답 HTTP ${upload.status}`);
      await upload.arrayBuffer();
      // 주소는 응답이 아니라 첨부 목록에 생긴다. 목록을 읽어 집는다.
      const list = await read(`${KIDSNOTE_HOST.listPath}&pno=${pno}`);
      const found = list.match(HOSTED_URL);
      if (!found || found.length === 0) throw new Error("올라간 주소를 찾지 못했습니다.");
      return found[found.length - 1];
    }

    /** 온채널 분류 목록 한 단계. `path`는 앞 단계에서 고른 이름들이다. */
    async function listCategories(message) {
      const mall = String(message?.mall || "");
      const source = CATEGORY_SOURCES[mall];
      if (!source) throw new Error(`분류 목록을 제공하지 않는 몰입니다 — ${mall || "(없음)"}`);
      const path = Array.isArray(message?.path) ? message.path.map((part) => String(part)) : [];
      if (path.length >= source.levels) return { mall, path, names: [] };
      const query = new URLSearchParams({ ...source.fixed });
      query.set(source.depthParam, String(path.length));
      path.forEach((value, index) => {
        const name = source.levelParams[index];
        if (name) query.set(name, value);
      });
      const response = await fetchApi(`${source.origin}${source.path}?${query.toString()}`, { credentials: "include" });
      if (!response.ok) throw new Error(`분류 목록 HTTP ${response.status}`);
      const body = await response.json();
      const rows = Array.isArray(body?.[source.itemsKey]) ? body[source.itemsKey] : [];
      const names = rows.map((row) => String(row?.[source.nameKey] ?? "").trim()).filter(Boolean);
      return { success: true, ok: true, mall, path, names };
    }

    /**
     * 몰 대량등록 엑셀에 넣을 우리 사진을 키즈노트 첨부 저장소에 올려 몰이 읽는 공개 주소를 받는다. 사진마다 결과를 따로
     * 돌려주고, 로그아웃이면 나머지도 안 되니 멈춘다. 받은 주소를 우리 서버에 저장하는 것은 웹이 한다.
     */
    async function hostPublicImages(message) {
      const urls = publicImageSources(message?.urls);
      const images = [];
      for (const sourceUrl of urls) {
        try {
          images.push({ sourceUrl, publicUrl: await hostImage(sourceUrl) });
        } catch (error) {
          images.push({
            sourceUrl,
            error: error?.needsLogin ? `${KIDSNOTE_HOST.loginLabel}에 로그인되어 있지 않습니다.` : (error?.message || String(error)),
          });
          if (error?.needsLogin) {
            return { success: false, ok: false, needsLogin: true, host: KIDSNOTE_HOST.label, loginLabel: KIDSNOTE_HOST.loginLabel, images };
          }
        }
      }
      return { success: true, ok: true, host: KIDSNOTE_HOST.label, images };
    }

    return { listCategories, hostPublicImages };
  }

  root.KidItemMallUtilityActions = { create, PUBLIC_IMAGE_SOURCE_ORIGINS, PUBLIC_IMAGE_BATCH, CATEGORY_MALL_KEYS: Object.keys(CATEGORY_SOURCES) };
})(typeof self !== "undefined" ? self : globalThis);
