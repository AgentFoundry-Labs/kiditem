// 몰 상품등록 폼 채우기(MAIN world, KID-256 — 옛 `background/orders/mall-form-register.js` 페이지 함수 이식).
// 확장 런타임 몰 쓰기(`extensions/src/sites/mall-write/form-register.ts`)가 페이지 호출로 부른다. 몰마다 다른 것은 인자로 오는
// 명세(`sites/<mall>/registration.ts`)뿐이고 채우는 절차는 여기 하나다. 전용 처리기로 채우는 몰(신세계·스마트스토어·GS샵·
// 롯데ON·카카오)은 이 파일의 쓰기 탭 도우미(`__kiditemWriteDialogs`)를 함께 쓴다.
//
// ⚠️ [등록]·저장·임시저장은 누르지 않는다(ADR-0019: 몰 명세에는 검증된 누르기가 없다). 몰이 묻는 확인 창은 알림 창 가드가
//    거절하고(쓰기 탭), 알림은 모아 경고로 돌려준다.
(function installMallFormFill() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  /**
   * 쓰기 탭 표시. 알림 창 가드(`dialog-guard.js`)를 쓰기 탭으로 돌려 confirm을 거절하게 하고, 지금까지 모인 문장 수를
   * 돌려준다(그 뒤에 온 것만 이 채우기의 몰 말이다). 가드는 같은 호출이 먼저 넣는다(`sites/mall-write`).
   */
  function beginWriteDialogs() {
    if (typeof window.__kiditemWriteTab === "function") window.__kiditemWriteTab();
    return Array.isArray(window.__kiditemDialogs) ? window.__kiditemDialogs.length : 0;
  }
  function writeDialogsSince(mark) {
    const all = Array.isArray(window.__kiditemDialogs) ? window.__kiditemDialogs : [];
    return all.slice(mark || 0).map((message) => String(message));
  }
  /**
   * 전용 처리기(신세계·스마트스토어·GS샵·롯데ON·카카오)가 몰 말을 나오는 즉시 듣는다 — 옛 `said` 배열에 넣던 것과 같다.
   * 쓰기 탭으로 돌리고 떼는 함수를 돌려준다. 옛 코드처럼 `window.alert`·`confirm`을 갈아끼웠다 되돌리지 않는다.
   */
  function listenWriteDialogs(sink) {
    beginWriteDialogs();
    return typeof window.__kiditemDialogSink === "function" ? window.__kiditemDialogSink(sink) : () => undefined;
  }
  window.__kiditemWriteDialogs = { begin: beginWriteDialogs, since: writeDialogsSince, listen: listenWriteDialogs };

  /**
   * 페이지 안에서 도는 채움 함수. 인자로 받은 명세·값만 쓴다.
   */
  function fillMallProductForm(payload, dialogMark) {
    const steps = [];
    const warnings = [];

    // 몰이 띄우는 대화상자는 알림 창 가드(`dialog-guard.js`, 쓰기 탭)가 모은다 — 온채널은 상품정보고시 분류를 고르는 순간
    // 안내 `alert` 을 띄우고, 뜨면 페이지가 통째로 멈춘다(라이브 확인 2026-09-10). 버리지 않고 끝에 경고로 올린다.
    // 옛 코드처럼 `window.alert` 을 갈아끼우지 않으므로 중간에 끝나도 되돌릴 것이 없다(KID-237).
    const said = [];

    /**
     * 고시 한 줄의 입력칸.
     *
     * 이 몰의 고시 칸에는 `name` 이 없다. 행 제목으로 찾는 수밖에 없고, 제목에는
     * 툴팁 글("설명", "- …")이 섞여 있어 앞부분만 맞춰 본다.
     */
    function findNoticeInput(tableId, title) {
      const table = document.getElementById(tableId);
      if (!table) return null;
      const want = title.replace(/\s+/g, "");
      const row = [...table.querySelectorAll("tr")].find((tr) => {
        const label = tr.querySelector("td.label, th");
        if (!label) return false;
        const text = (label.textContent || "").replace(/\s+/g, "").replace(/설명|닫기/g, "");
        return text.startsWith(want);
      });
      if (!row) return null;
      return row.querySelector("td:not(.label) input[type='text'], td:not(.label) textarea");
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    /**
     * 폼이 그려질 때까지 **페이지 안에서** 기다린다.
     *
     * ⚠️ 회귀(라이브 2026-09-11, 사장님 화면의 `G마켓 · 옥션 → 실패`):
     * ESM Plus 는 Next.js SPA 라 `load` 가 끝난 **뒤에도 8~10초** 더 지나야 폼이
     * 그려진다. 서비스워커는 로딩 완료 + 1.2초만 기다리고 주입하므로 그때는
     * `main.box__wrap` 이 아직 없어서 `폼이 없습니다` 로 끝났다 — 로그인은 멀쩡했다.
     *
     * 밖에서 더 오래 자는 것으로는 못 맞춘다(탭을 여러 개 열수록 느려진다).
     * **화면이 준비될 때까지 여기서 지켜본다.** 준비되면 바로 진행하니 빠른 몰은 손해가 없다.
     */
    async function waitForForm() {
      // ⚠️ 껍데기(`body` 같은 넓은 표식)는 언제나 있다. 칸이 생겼는지까지 봐야 한다 —
      // 안 그러면 기다림이 첫 줄에서 끝나고 빈 화면에 쓰게 된다.
      const ready = () => {
        const hit = document.querySelector(payload.formSelector);
        if (!hit) return null;
        if (payload.readySelector && !document.querySelector(payload.readySelector)) return null;
        return hit;
      };
      const found = ready();
      if (found) return found;
      const budget = payload.formWaitMs || 0;
      if (budget <= 0) return null;
      const until = Date.now() + budget;
      while (Date.now() < until) {
        await sleep(400);
        // 껍데기만 있고 칸이 아직 없는 화면도 '아직' 으로 본다.
        const hit = ready();
        if (hit) return hit;
      }
      return ready();
    }

    // 기다림은 async 블록 안에서 한다. 여기서는 있으면 잡아 두기만 한다.
    let form = document.querySelector(payload.formSelector);

    /** 폼을 못 찾았을 때 돌려줄 답. 로그인이 풀린 경우를 따로 말해 준다. */
    function noFormOutcome() {
      const redirected = /signin\.|\/login|\/redirect\?/.test(location.href);
      return {
        ok: false,
        // 모든 프레임에 넣는 몰(11번가)은 폼이 없는 프레임에서도 여기로 온다.
        // 진짜 실패와 구분하려고 표시를 남긴다.
        noForm: true,
        error: redirected
          ? "몰에 로그인되어 있지 않습니다. 열린 탭에서 직접 로그인한 뒤 다시 누르세요."
          : `상품등록 폼(${payload.formSelector})이 없습니다. 로그인 상태와 화면을 확인하세요.`,
      };
    }
    const field = (name) => form.querySelector(`[name="${CSS.escape(name)}"]`);
    const fire = (el) => {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      // 글자 수 표시를 keyup 으로만 고치는 화면(키드키즈 `limitInputText`). 안 주면 값이
      // 들어갔는데 `0/100` 으로 남아 사람이 빈 칸으로 읽는다.
      if (payload.fireKeyup) el.dispatchEvent(new Event("keyup", { bubbles: true }));
    };

    /**
     * 값을 넣는다. React 화면에서도 먹게.
     *
     * React 는 input 의 `value` 를 자기 프로퍼티로 덮어써서 상태를 추적한다.
     * 그냥 `el.value = v` 하면 화면에는 글자가 보여도 React 는 모르고, 제출하면
     * 빈 값이 간다. 프로토타입의 원래 setter 로 넣어야 React 가 알아챈다.
     *
     * 이름 있는 폼(도매꾹·온채널·Cafe24)에도 해가 없다 — 같은 결과다.
     */
    function assign(el, value) {
      try {
        const tag = String(el.tagName || "").toUpperCase();
        const proto = tag === "TEXTAREA" ? globalThis.HTMLTextAreaElement?.prototype
          : tag === "SELECT" ? globalThis.HTMLSelectElement?.prototype
            : globalThis.HTMLInputElement?.prototype;
        const setter = proto && Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
      } catch {
        el.value = value;
      }
      fire(el);
    }

    function setValue(name, value) {
      const el = field(name);
      if (!el) return false;
      assign(el, value);
      return true;
    }

    /**
     * 추천 분류 모달의 '변경하기' 버튼.
     *
     * 문구 두 개가 모두 맞는 것만 집는다 — 대화상자에 '추천 카테고리'가 있고,
     * 그 안의 버튼 글자가 정확히 '변경하기'인 것. 하나만 보고 누르면 다른 팝업의
     * 같은 이름 버튼을 누를 수 있다.
     */
    async function waitForRecommendation(config) {
      const deadline = Date.now() + config.timeoutMs;
      while (Date.now() < deadline) {
        const boxes = [...document.querySelectorAll("div,section,dialog,form")]
          .filter((el) => {
            if (el.offsetParent === null && el.tagName !== "DIALOG") return false;
            const text = el.textContent || "";
            return text.includes(config.containerText) && text.includes(config.acceptText);
          })
          // 가장 안쪽 것이 실제 모달이다. 바깥은 body 까지 전부 걸린다.
          .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length);
        for (const box of boxes) {
          const button = [...box.querySelectorAll("button,a,input[type=button]")]
            .find((el) => ((el.textContent || el.value || "").trim() === config.acceptText));
          if (button) return button;
        }
        await sleep(700);
      }
      return null;
    }

    function toFile(image) {
      const [head, base64] = String(image.dataUrl).split(",");
      const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new File([bytes], image.fileName, { type: mime });
    }

    /**
     * 분류 검색 — 검색어를 치고 나온 경로 버튼을 누른다.
     *
     * 목록이 미리 실려 있어 요청이 나가지 않는다. 결과 버튼의 글자가 곧 경로다.
     * 구분자와 검색어 만드는 법이 몰마다 다르다: 올웨이즈는 `대 > 중 > 소` 를 그대로
     * 검색해도 걸리지만, 11번가는 띄어쓴 이름으로 검색하면 0건이라 첫 낱말만 넣는다.
     */
    async function runCategorySearch() {
      const search = payload.categorySearch;
      if (!search) return;
      for (const path of payload.categoryPaths || []) {
        const wanted = path.join(search.joiner || " > ");
        const box = document.querySelector(search.inputSelector);
        if (!box) { warnings.push("분류 검색칸을 찾지 못했습니다."); return; }
        // 결과 목록은 **칸에 포커스가 있어야 펼쳐진다.** 값만 넣으면 결과가 만들어져도
        // 목록이 접힌 채라 `offsetParent` 가 null 이고, 우리 가시성 검사에 걸러진다
        // (라이브 실측 2026-09-10: 포커스 없음 → null / 포커스 후 → ok, `active` 클래스).
        try { box.focus(); box.click(); } catch { /* 포커스를 못 줘도 계속 간다 */ }
        const leaf = path[path.length - 1];
        // 검색어는 낱말 하나여야 한다. 11번가는 `기능성 팬시` 로 치면 0건이고
        // `기능성` 으로 쳐야 40건이 나온다(라이브 실측 2026-09-10).
        assign(box, search.queryFirstWord ? leaf.split(/\s+/)[0] : leaf);
        // 결과를 기다린다. 고정 대기로는 막 열린 화면에서 놓친다 — 같은 검색어가
        // 데워진 화면에서는 걸리고 갓 로드된 화면에서는 안 걸렸다(라이브 확인).
        const deadline = Date.now() + (search.timeoutMs || 12000);
        let hit = null;
        while (Date.now() < deadline) {
          await sleep(500);
          hit = [...document.querySelectorAll(search.optionSelector)]
            .filter((el) => el.offsetParent !== null)
            .find((el) => (el.textContent || "").replace(/\s+/g, " ").trim() === wanted);
          if (hit) break;
        }
        if (!hit) {
          warnings.push(`분류 '${wanted}' 를 찾지 못했습니다. 이름이 정확한지 확인하세요.`);
          continue;
        }
        hit.click();
        await sleep(search.waitMs);
        steps.push(`분류 ${leaf}`);
      }
    }

    /**
     * 블록 id + 행 제목으로 칸을 찾는다.
     *
     * 이름도 id 도 없는 화면(11번가 신규등록)용이다. 제목에는 `필수입력`·`도움말`
     * 같은 꼬리가 붙으므로 공백과 그 꼬리를 떼고 앞부분만 맞춘다.
     */
    function findRowInput(section, row) {
      const body = document.getElementById(section);
      if (!body) return null;
      const want = row.replace(/\s+/g, "");
      const hit = [...body.querySelectorAll(".b-box__row")].find((el) => {
        const title = el.querySelector(".b-box__title");
        if (!title) return false;
        const text = (title.textContent || "").replace(/\s+/g, "").replace(/필수입력|도움말/g, "");
        return text.startsWith(want);
      });
      return hit ? hit.querySelector(".b-box__cont") : null;
    }

    /**
     * 섹션 제목으로 칸 블록을 찾는다(ESM Plus).
     *
     * 11번가와 사정은 같은데 DOM 이 다르다. 이 몰은
     * `div.box__filter-item > (.box__filter-head 제목 + .box__filter-content 값)` 이고,
     * 제목에 `필수`·`도움말` 이 꼬리로 붙는다. 공백과 그 꼬리를 떼고 앞부분만 맞춘다.
     *
     * 실측 2026-09-11: 고시 15줄도 상품군을 고르고 나면 **같은 블록**으로 그려진다 —
     * 그래서 고시에 별도 손잡이가 필요 없다.
     */
    function findSectionContent(title) {
      const layout = payload.sectionLayout;
      if (!layout) return null;
      const want = String(title).replace(/\s+/g, "");
      const hit = [...document.querySelectorAll(layout.itemSelector)].find((el) => {
        const head = el.querySelector(layout.headSelector);
        if (!head) return false;
        const text = (head.textContent || "").replace(/\s+/g, "").replace(/필수|도움말/g, "");
        return text === want || text.startsWith(want);
      });
      if (!hit) return null;
      return hit.querySelector(layout.contentSelector) || hit;
    }

    /**
     * 안내 팝업을 닫는다.
     *
     * ESM Plus 는 등록 화면에 안내창을 띄운다(실물: "[G kiditem / A kiditem] 이벤트에
     * 참여중입니다 … [확인]"). 덮여 있는 동안에는 우리 클릭이 전부 그 창으로 먹어서
     * 폼이 안 채워지고, 사람이 매번 손으로 닫아야 한다.
     *
     * ⚠️ **되묻는 창을 대신 눌러 주지 않는다.** 그건 사람의 결정을 가로채는 일이다.
     * 판단 규칙:
     *
     *  1. 창 안의 버튼을 **닫기류**(`확인`·`닫기`·모서리 `✕`)와 **그 외**로 가른다.
     *  2. **'그 외' 가 하나라도 있으면 손대지 않는다** — `취소`·`등록하기` 가 있다는 건
     *     고르라는 뜻이다.
     *  3. 본문이 **묻는 말**로 끝나면(`…하시겠습니까?`) 닫기류만 있어도 손대지 않는다.
     *
     * 본문에 무슨 낱말이 있는지로는 거르지 않는다 — 이 안내창도 본문에 '등록' 이
     * 들어 있다("신규로 등록되는 상품은 … 제외됩니다"). 낱말로 걸렀다면 못 닫는다.
     */
    async function dismissNoticeDialogs(rule) {
      if (!rule) return 0;
      const closeLabels = rule.closeLabels || [];
      const actionWords = rule.actionWords || [];
      const question = rule.questionPattern ? new RegExp(rule.questionPattern) : null;
      const labelOf = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();

      /**
       * ⚠️ 태그를 믿지 않는다.
       *
       * 처음엔 `<button>` 만 봤는데, 이 안내창이 떠 있는 동안 글자가 `확인` 인 버튼이
       * **하나도 없었다**(라이브 2026-09-11). 누르는 자리가 `<a>` 나 `<div>` 라는 뜻이다.
       * 그래서 **글자가 행동 낱말인 잎 요소**를 찾는다 — 태그가 무엇이든 걸린다.
       *
       * 스타일 조회는 걸린 몇 개에만 한다. 문서 전체에 `getComputedStyle` 을 돌렸다가
       * 이 화면(요소 2,200개)에서 렌더러가 45초 넘게 멈춘 적이 있다.
       */
      const actionLeaves = () => [...document.querySelectorAll("*")]
        .filter((el) => el.children.length === 0 && actionWords.includes(labelOf(el)));

      const dialogFor = (el) => {
        let box = el.parentElement;
        for (let depth = 0; depth < 10 && box && box !== document.body; depth += 1) {
          const style = getComputedStyle(box);
          if (/fixed|absolute/.test(style.position)) {
            const rect = box.getBoundingClientRect();
            if (rect.width >= 180 && rect.height >= 60) return box;
          }
          box = box.parentElement;
        }
        return null;
      };

      // 한 번 누른 자리는 다시 누르지 않는다. 같은 것을 두 번 누르면 그 다음 화면의
      // 버튼을 누르게 된다 — 그게 등록 버튼일 수도 있다.
      const pressed = new Set();
      let closed = 0;
      for (let round = 0; round < (rule.retries || 1); round += 1) {
        let hit = null;
        for (const leaf of actionLeaves()) {
          if (pressed.has(leaf)) continue;
          if (!closeLabels.includes(labelOf(leaf))) continue;
          const box = dialogFor(leaf);
          if (!box) continue;
          const style = getComputedStyle(box);
          if (style.display === "none" || style.visibility === "hidden") continue;
          // 창 안의 행동 낱말을 전부 센다. 고르라는 것이 섞여 있으면 사람의 몫이다.
          const words = [...box.querySelectorAll("*")]
            .filter((el) => el.children.length === 0 && actionWords.includes(labelOf(el)))
            .map(labelOf);
          if (words.some((word) => !closeLabels.includes(word))) continue;
          if (question && question.test((box.textContent || "").replace(/\s+/g, " "))) continue;
          /**
           * 안내창에는 **읽으라고 쓴 글**이 있다.
           *
           * 버튼만 덩그러니 있는 상자는 화면의 부품이지 안내창이 아니다. 그런 것을
           * 눌렀다가는 폼의 진짜 버튼을 누르게 된다. 낱말을 뺀 본문이 짧으면 넘긴다.
           */
          const body = (box.textContent || "").replace(/\s+/g, " ").trim();
          const message = words.reduce((text, word) => text.split(word).join(""), body).trim();
          if (message.length < (rule.minMessageLength || 10)) continue;
          hit = leaf;
          break;
        }
        if (!hit) {
          if (closed > 0) break;
          await sleep(rule.waitMs || 600);
          continue;
        }
        // 잎이 아니라 실제로 누르는 자리를 누른다(버튼 안 span 인 경우).
        pressed.add(hit);
        const target = hit.closest('button,a,[role="button"]') || hit;
        target.click();
        closed += 1;
        await sleep(rule.waitMs || 600);
      }
      return closed;
    }

    /**
     * 커스텀 드롭다운에서 **보이는 글자**로 고른다(ESM Plus).
     *
     * 네이티브 `<select>` 가 하나도 없는 화면이다(실측: `document.querySelectorAll('select')`
     * 가 0개). 항목은 열지 않아도 DOM 에 이미 있지만, 여는 버튼을 눌러 줘야 React 가
     * 고른 값을 받는다.
     *
     * ⚠️ `li` 를 누르면 아무 일도 안 일어난다. 그 안의 `button` 을 눌러야 한다(실측).
     */
    async function pickSectionOption(content, wanted, layout) {
      const dropdown = content.querySelector(layout.dropdownSelector) || content;
      const opener = dropdown.querySelector(layout.openerSelector);
      if (opener) {
        opener.click();
        await sleep(350);
      }
      const want = String(wanted).replace(/\s+/g, " ").trim();
      const option = [...dropdown.querySelectorAll(layout.optionSelector)]
        .find((el) => (el.textContent || "").replace(/\s+/g, " ").trim() === want);
      if (!option) {
        // 못 고르면 열어 둔 채로 두지 않는다. 다음 칸을 가릴 수 있다.
        if (opener) opener.click();
        return false;
      }
      option.click();
      await sleep(500);
      return true;
    }

    return (async () => {
      // 0-00) 폼이 다른 도메인 iframe 에 있는 몰(떠리몰)은 모든 프레임에 들어가지만 일은 그
      //       프레임에서만 한다. 겉·숨은 프레임은 바로 비킨다 — 안 비키면 폼을 기다리느라
      //       전체 주입이 30초씩 붙잡힌다.
      if (payload.frameUrlIncludes && !location.href.includes(payload.frameUrlIncludes)) {
        return { ok: false, noForm: true, error: `상품등록 화면(${payload.frameUrlIncludes})을 찾지 못했습니다.` };
      }

      // 0-0) 느리게 그려지는 SPA(ESM Plus)는 칸이 생길 때까지 여기서 기다린다.
      //
      // ⚠️ 껍데기(`body`)는 처음부터 있어서 `form` 만 보면 기다림을 건너뛴다. 준비 표식
      // (`readySelector`)이 아직 없으면 그것도 '아직' 이다 — 떠리몰 라이브 시험에서 칸이
      // 그려지기 전에 들어가 줄 제목을 하나도 못 찾았다(2026-09-11).
      if (!form || (payload.readySelector && !document.querySelector(payload.readySelector))) {
        form = await waitForForm();
        if (!form) return noFormOutcome();
      }

      // 0) 분류가 방아쇠인 몰은 분류부터 끝낸다.
      //
      // 11번가는 분류를 고르기 전에 상품정보 제공고시 블록이 숨어 있어서, 순서를
      // 지키지 않으면 그 단계가 통째로 실패한다(라이브 확인 2026-09-10).
      if (payload.categoryFirst) await runCategorySearch();

      // 0-1) 폼이 섹션마다 따로 있는 몰(아이스크림몰)은 폼 id 까지 보고 채운다.
      //
      // 같은 이름의 칸이 여러 폼에 있어서(`deliFcstDt` 등) 문서 전체에서 찾으면
      // 엉뚱한 폼의 칸에 들어간다.
      for (const [formId, values] of Object.entries(payload.multiFormFields || {})) {
        const section = document.getElementById(formId);
        if (!section) { warnings.push(`${formId} 칸을 찾지 못했습니다.`); continue; }
        let filled = 0;
        for (const [name, value] of Object.entries(values)) {
          const box = section.querySelector(`[name="${name}"]`);
          if (!box) { warnings.push(`${formId}.${name} 칸이 없습니다.`); continue; }
          box.readOnly = false;
          assign(box, value);
          filled += 1;
        }
        for (const [name, value] of Object.entries((payload.multiFormRadios || {})[formId] || {})) {
          const hit = section.querySelector(`input[type="radio"][name="${name}"][value="${value}"]`);
          if (!hit) { warnings.push(`${formId}.${name}=${value} 를 찾지 못했습니다.`); continue; }
          if (!hit.checked) hit.click();
          filled += 1;
        }
        for (const [name, on] of Object.entries((payload.multiFormChecks || {})[formId] || {})) {
          // `payWayCd[]` 처럼 같은 이름이 여럿인 칸은 값으로 가려낸다.
          const list = [...section.querySelectorAll(`input[type="checkbox"][name="${name}"]`)];
          const targets = Array.isArray(on)
            ? list.filter((el) => on.includes(el.value))
            : list;
          for (const el of targets) {
            if (el.checked !== (Array.isArray(on) ? true : Boolean(on))) el.click();
            filled += 1;
          }
        }
        if (filled > 0) steps.push(`${formId} ${filled}칸`);
      }

      // 0-2) 분류. 팝업으로만 고르는 칸이라 값을 직접 넣는다.
      //
      // 코드와 경로를 함께 넣는다 — 몰은 저장할 때 코드를 본다. 경로만 맞춰 두면
      // 화면은 맞아 보이는데 저장이 빈 분류로 들어간다.
      if (payload.categoryFields && payload.categoryCode) {
        const codeBox = document.querySelector(`[name="${payload.categoryFields.code}"]`);
        const pathBox = document.querySelector(`[name="${payload.categoryFields.path}"]`);
        if (codeBox) { codeBox.readOnly = false; assign(codeBox, payload.categoryCode); }
        if (pathBox) { pathBox.readOnly = false; assign(pathBox, payload.categoryPath || ""); }
        if (codeBox) steps.push("분류");
        else warnings.push("분류 칸을 찾지 못했습니다. 화면에서 직접 고르세요.");
      }

      // 0-3) 고시. 이 몰은 **분류로 열리지 않는다** — 품목코드를 주고 몰의 함수를
      // 불러야 행이 그려진다(라이브 확인 2026-09-11: 1줄 → 16줄).
      // 그려진 칸들은 `name` 이 없어 행 제목으로 찾는다.
      if (payload.noticeSection && payload.noticeItemCode) {
        const spec = payload.noticeSection;
        const handler = window[spec.owner]?.eventhandler;
        if (typeof handler?.[spec.open] === "function") {
          try {
            handler[spec.open](payload.noticeItemCode, payload.noticeSafeYn || "N");
          } catch (error) {
            warnings.push(`고시를 열지 못했습니다: ${error?.message || error}`);
          }
          // ajax 로 항목을 받아 그리므로 기다린다.
          const deadline = Date.now() + 8000;
          while (Date.now() < deadline) {
            await sleep(400);
            if (document.querySelectorAll(`#${spec.tableId} tr`).length > 2) break;
          }
          let noticeFilled = 0;
          for (const row of payload.noticeRows || []) {
            const target = findNoticeInput(spec.tableId, row.title);
            if (!target) { warnings.push(`고시 '${row.title}' 줄을 찾지 못했습니다.`); continue; }
            assign(target, row.value);
            noticeFilled += 1;
          }
          if (noticeFilled > 0) steps.push(`고시 ${noticeFilled}줄`);
          // KC/안전인증 라디오는 이름이 있다.
          for (const [name, value] of Object.entries(payload.noticeRadios || {})) {
            const hit = document.querySelector(`input[type="radio"][name="${name}"][value="${value}"]`);
            if (hit && !hit.checked) { hit.click(); steps.push(`${name}=${value}`); }
          }
        } else {
          warnings.push("고시를 여는 몰 함수를 찾지 못했습니다. 화면에서 분류를 고른 뒤 다시 시도하세요.");
        }
      }

      // 1) 단계형 화면이면 먼저 넘긴다.
      //
      // 이게 맨 앞이어야 한다. 온채널은 단계를 넘길 때 뒤 화면을 다시 그리는데,
      // 그 전에 채운 상품정보고시 열일곱 칸이 통째로 비워진다(라이브 확인
      // 2026-09-10: 넘긴 뒤 17칸 전부 빈 값). 넘기고 나서 채워야 남는다.
      for (const step of payload.wizardSteps || []) {
        const button = [...document.querySelectorAll("button,a,input[type=button]")]
          .find((el) => ((el.textContent || el.value || "").replace(/\s+/g, " ").trim() === step.text));
        if (!button) { warnings.push(`'${step.text}' 버튼을 찾지 못했습니다.`); continue; }
        // 단계를 넘기려면 그 화면의 선택이 먼저 끝나 있어야 한다.
        for (const [name, value] of Object.entries(payload.radios)) {
          if (!(step.needs || []).includes(name)) continue;
          const hit = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)]
            .find((el) => el.value === value);
          if (hit && !hit.checked) hit.click();
        }
        for (const name of step.needsChecks || []) {
          const box = form.elements[name];
          if (box && !box.checked) box.click();
        }
        button.click();
        steps.push(step.label || step.text);
        if (step.waitMs) await sleep(step.waitMs);
      }

      // 2) 동적 칸을 만드는 방아쇠를 당긴다.
      //    도매꾹 고시가 그렇다 — 상품군을 고르기 전에 값을 넣으면 조용히 사라진다.
      const dynamic = payload.dynamic;
      if (dynamic && payload.fields[dynamic.trigger] !== undefined) {
        if (setValue(dynamic.trigger, payload.fields[dynamic.trigger])) {
          const deadline = Date.now() + 15000;
          let created = 0;
          while (Date.now() < deadline) {
            await sleep(300);
            created = [...form.elements].filter((el) => {
              if (typeof el.name !== "string" || !el.name) return false;
              if (dynamic.waitPrefix) return el.name.startsWith(dynamic.waitPrefix);
              // 접두어가 없는 몰(온채널)은 생겨야 할 칸 이름을 직접 센다.
              return (dynamic.waitNames || []).includes(el.name);
            }).length;
            if (created > 0) break;
          }
          if (created > 0) steps.push(`${dynamic.trigger} 선택 후 항목 ${created}칸 생성`);
          else warnings.push(`${dynamic.trigger} 를 골랐지만 항목이 생기지 않았습니다.`);
        }
      }

      // 2-9) 칸을 여는 라디오를 먼저 누른다.
      //
      // 꼬망세 KC 번호 칸은 `인증` 을 누르기 전까지 `disabled` 다. 라디오는 원래 6) 에서
      // 누르는데, 그러면 번호가 잠긴 칸에 들어가 제출되지 않는다.
      for (const name of payload.preRadios || []) {
        const value = payload.radios[name];
        if (value === undefined) continue;
        const hit = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)]
          .find((el) => el.value === value);
        if (!hit) { warnings.push(`라디오 ${name}=${value} 를 찾지 못했습니다.`); continue; }
        if (!hit.checked) hit.click();
        fire(hit);
        await sleep(300);
      }

      // 3) 나머지 값.
      let filled = 0;
      const missing = [];
      for (const [name, value] of Object.entries(payload.fields)) {
        if (dynamic && name === dynamic.trigger) continue;
        if (setValue(name, value)) filled += 1;
        else missing.push(name);
      }
      steps.push(`입력 ${filled}칸`);
      if (missing.length > 0) {
        warnings.push(`화면에 없는 칸 ${missing.length}개: ${missing.slice(0, 6).join(", ")}`);
      }

      // 4) 같은 이름을 쓰는 묶음 입력. 순서대로 나눠 넣는다.
      for (const group of payload.groupInputs || []) {
        const values = (payload.groups && payload.groups[group.key]) || [];
        if (values.length === 0) continue;
        // 칸이 모자라면 늘린다. 티처몰 상품정보고시가 그렇다 — 품목을 고르면 다섯
        // 줄만 생기는데 등록물은 서른아홉 줄이라 '+' 를 그만큼 눌러야 한다.
        //
        // ⚠️ 클릭 사이에 기다리지 않는다. 줄은 동기로 붙고(실측: 여섯 번 8ms),
        //    `setTimeout` 은 배경 탭에서 1초로 늘어난다. 한 번씩 재면 서른네 줄에
        //    34초가 걸려 채움이 통째로 시간 초과된다(라이브 확인 2026-09-10).
        if (group.grow) {
          const add = document.getElementById(group.grow.buttonId);
          if (!add) {
            warnings.push(`${group.key} 줄 추가 버튼(#${group.grow.buttonId})을 찾지 못했습니다.`);
          } else {
            const limit = group.grow.maxClicks || 60;
            let clicks = 0;
            // 한 번에 다 누르고, 그래도 모자라면(줄이 늦게 붙는 몰) 한 번 더 돈다.
            for (let round = 0; round < 3; round += 1) {
              const need = Math.min(limit - clicks, values.length - form.querySelectorAll(group.selector).length);
              if (need <= 0) break;
              for (let i = 0; i < need; i += 1) { add.click(); clicks += 1; }
              await sleep(400);
            }
            if (clicks > 0) steps.push(`${group.key} ${clicks}줄 추가`);
          }
        }
        const boxes = [...form.querySelectorAll(group.selector)];
        if (boxes.length === 0) {
          warnings.push(`${group.key} 입력칸(${group.selector})을 찾지 못했습니다.`);
          continue;
        }
        let placed = 0;
        values.slice(0, boxes.length).forEach((value, index) => {
          const box = boxes[index];
          assign(box, value);
          // 이 몰은 keyup 으로 숨은 필드를 다시 만든다. 두 이벤트를 다 준다.
          box.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
          placed += 1;
        });
        const last = boxes[Math.min(values.length, boxes.length) - 1];
        if (last) last.dispatchEvent(new Event("blur", { bubbles: true }));
        steps.push(`${group.key} ${placed}칸`);
        if (values.length > boxes.length) {
          warnings.push(`${group.key} ${values.length - boxes.length}개는 칸이 모자라 넣지 못했습니다.`);
        }
      }

      // 4-1) 블록 id + 행 제목으로 찾는 칸들(11번가).
      for (const entry of payload.rowFields || []) {
        const want = payload.rowFieldValues[entry.key];
        if (want === undefined || want === "") continue;
        const cont = findRowInput(entry.section, entry.row);
        const box = cont && cont.querySelector("input,textarea");
        if (!box) { warnings.push(`${entry.label} 칸을 찾지 못했습니다.`); continue; }
        assign(box, want);
        steps.push(entry.label);
      }

      // 4-2) 같은 방식인데 **보이는 글자**로 고르는 목록. 값이 계정마다 다른 번호라
      //      숫자를 적어둘 수 없다(배송 템플릿).
      for (const entry of payload.rowOptions || []) {
        const want = payload.rowOptionValues[entry.key];
        if (want === undefined || want === "") continue;
        const cont = findRowInput(entry.section, entry.row);
        const select = cont && cont.querySelector("select");
        if (!select) { warnings.push(`${entry.label} 목록을 찾지 못했습니다.`); continue; }
        const option = [...select.options]
          .find((el) => (el.textContent || "").replace(/\s+/g, " ").trim() === want);
        if (!option) { warnings.push(`${entry.label} 에 '${want}' 가 없습니다.`); continue; }
        assign(select, option.value);
        steps.push(`${entry.label} ${want}`);
        await sleep(600);
      }

      // 4-3) 섹션 제목으로 찾는 몰(ESM Plus — G마켓·옥션).
      //
      // ⭐⭐ 순서가 전부다(라이브 실측 2026-09-11):
      //   (a) **분류 먼저.** 분류를 고르면 `인증정보` 패널이 어린이제품·G마켓 인증정보·
      //       G마켓 영업허가증으로 **다시 그려지고 기본값이 `인증대상` 으로 되돌아간다.**
      //       인증을 먼저 누르면 눌러 둔 값이 지워진다.
      //   (b) 인증 라디오 — 그대로 두면 `인증 유형`·`업종` 이 필수로 따라 열려 막힌다.
      //   (c) 드롭다운 — `상품군` 을 골라야 고시 15줄이 **그려진다**. 나중에 하면
      //       고시 칸을 찾을 수가 없다.
      //   (d) 칸(고시 포함) → (e) 이미지 → (f) 상세설명.
      if (payload.sectionLayout) {
        const layout = payload.sectionLayout;
        // 분류에 따라 있을 수도 없을 수도 있는 칸. 없다고 경고하면 거짓 경보가 된다.
        const optional = new Set(payload.optionalSections || []);

        // 안내 팝업이 화면을 덮고 있으면 클릭이 전부 그 창으로 먹는다. 먼저 치운다.
        const dismissed = await dismissNoticeDialogs(payload.dismissDialogs);
        if (dismissed > 0) steps.push(`안내 팝업 ${dismissed}개 닫음`);

        const wantCategory = payload.sectionCategory;
        const categorySpec = layout.category;
        if (wantCategory && categorySpec) {
          const content = findSectionContent(categorySpec.section);
          const box = content && content.querySelector(categorySpec.queryInput);
          if (!box) warnings.push("분류 검색칸을 찾지 못했습니다.");
          else {
            assign(box, wantCategory.query);
            await sleep(300);
            content.querySelector(categorySpec.searchButton)?.click();
            await sleep(categorySpec.waitMs);
            const want = wantCategory.path.replace(/\s+/g, "");
            const hit = [...content.querySelectorAll(layout.optionSelector)]
              .find((el) => (el.textContent || "").replace(/\s+/g, "") === want);
            if (!hit) warnings.push(`분류 '${wantCategory.path}' 를 찾지 못했습니다.`);
            else {
              hit.click();
              await sleep(1500);
              steps.push(`분류 ${wantCategory.path}`);
            }
          }
        }

        // 분류를 고르면 또 안내창이 뜨는 화면이 있다. 인증을 누르기 전에 한 번 더 치운다.
        await dismissNoticeDialogs(payload.dismissDialogs);

        for (const [title, wanted] of Object.entries(payload.sectionRadios || {})) {
          const content = findSectionContent(title);
          if (!content) {
            if (!optional.has(title)) warnings.push(`${title} 칸을 찾지 못했습니다.`);
            continue;
          }
          const want = String(wanted).replace(/\s+/g, " ").trim();
          const label = [...content.querySelectorAll(layout.labelSelector)]
            .find((el) => (el.textContent || "").replace(/\s+/g, " ").trim() === want);
          if (!label) {
            if (!optional.has(title)) warnings.push(`${title} 에 '${want}' 가 없습니다.`);
            continue;
          }
          label.click();
          await sleep(400);
          steps.push(`${title} ${want}`);
        }

        for (const [title, wanted] of Object.entries(payload.sectionDropdowns || {})) {
          const content = findSectionContent(title);
          if (!content) {
            if (!optional.has(title)) warnings.push(`${title} 목록을 찾지 못했습니다.`);
            continue;
          }
          const picked = await pickSectionOption(content, wanted, layout);
          if (!picked) {
            if (!optional.has(title)) warnings.push(`${title} 에 '${wanted}' 가 없습니다.`);
            continue;
          }
          steps.push(`${title} ${wanted}`);
          // 상품군을 고르면 고시 줄이 그려진다. 그릴 틈을 준다.
          await sleep(900);
        }

        for (const [key, value] of Object.entries(payload.sectionFields || {})) {
          if (value === undefined || value === "") continue;
          // `제목#순번` — 한 섹션에 칸이 여럿인 경우.
          const [title, rawIndex] = key.split("#");
          const index = Number(rawIndex || 0) || 0;
          const content = findSectionContent(title);
          const box = content && [...content.querySelectorAll(layout.inputSelector)][index];
          if (!box) {
            if (!optional.has(title)) warnings.push(`${title} 칸을 찾지 못했습니다.`);
            continue;
          }
          box.readOnly = false;
          assign(box, value);
          steps.push(title);
        }

        const imageSpec = layout.images;
        const imageFiles = imageSpec ? (payload.imageGroups || {})[imageSpec.groupKey] || [] : [];
        if (imageSpec && imageFiles.length > 0) {
          const box = document.querySelector(imageSpec.fileInputSelector);
          if (!box) warnings.push("상품이미지 칸을 찾지 못했습니다.");
          else {
            try {
              // 칸 하나가 `multiple` 이라 대표·추가를 한 번에 넣는다. 첫 장이 대표다.
              const transfer = new DataTransfer();
              for (const image of imageFiles.slice(0, imageSpec.max)) transfer.items.add(toFile(image));
              box.files = transfer.files;
              box.dispatchEvent(new Event("change", { bubbles: true }));
              await sleep(3000);
              steps.push(`상품이미지 ${transfer.files.length}장`);
            } catch (error) {
              warnings.push(`상품이미지 실패: ${error?.message || error}`);
            }
          }
        }

        const detailSpec = layout.detail;
        const pickTab = async (label) => {
          const tab = [...document.querySelectorAll(detailSpec.tabSelector)]
            .find((el) => (el.textContent || "").replace(/\s+/g, " ").trim() === label);
          if (!tab) return false;
          tab.click();
          await sleep(900);
          return true;
        };
        /**
         * ⭐ 상세설명은 **ESM 에 직접 올린다.**
         *
         * 예전엔 키즈노트(diskn)에 먼저 올려 주소를 받아 HTML 로 넣었는데, 그 몰
         * 로그인이 풀리자 ESM 등록이 통째로 막혔다(라이브 2026-09-11:
         * "상품번호를 받지 못했습니다"). 남의 몰 세션에 우리 등록을 걸어 두지 않는다.
         *
         * 주소가 이미 몰이 읽을 수 있는 것이면 HTML 탭으로 넣는 길도 남겨 둔다 —
         * 단, **주 경로의 산출물로 대비 경로를 막지 않는다**(아이스크림몰에서 배운 것).
         */
        if (detailSpec && payload.detailImage && detailSpec.uploadTabLabel) {
          if (!await pickTab(detailSpec.uploadTabLabel)) {
            warnings.push("상세설명 이미지 업로드 탭을 찾지 못했습니다.");
          } else {
            // ⚠️ 파일 칸 이름이 상품이미지와 같은 `btnSelectFile` 이다. 보드 안에서 찾는다.
            const board = document.querySelector(detailSpec.uploadBoardSelector);
            const box = board && board.querySelector(detailSpec.uploadFileSelector);
            if (!box) warnings.push("상세설명 파일 칸을 찾지 못했습니다.");
            else {
              try {
                const transfer = new DataTransfer();
                transfer.items.add(toFile(payload.detailImage));
                box.files = transfer.files;
                box.dispatchEvent(new Event("change", { bubbles: true }));
                // 올라갈 때까지 지켜본다. 고정 시간으로 자르면 큰 이미지에서 놓친다.
                const until = Date.now() + 20000;
                let done = false;
                while (Date.now() < until) {
                  await sleep(500);
                  const text = (document.querySelector(detailSpec.uploadBoardSelector)?.textContent || "");
                  if (text.includes(detailSpec.uploadDoneText)) { done = true; break; }
                }
                if (done) steps.push("상세설명(이미지 업로드)");
                else warnings.push("상세설명 이미지가 올라갔는지 확인하지 못했습니다. 화면에서 보세요.");
              } catch (error) {
                warnings.push(`상세설명 실패: ${error?.message || error}`);
              }
            }
          }
        } else if (detailSpec && payload.detailHtml) {
          // 편집기가 아니라 **HTML 탭**이다. 에디터 탭에 쓰면 저장할 때 덮인다.
          await pickTab(detailSpec.tabLabel);
          const box = document.querySelector(detailSpec.textareaSelector);
          if (!box) warnings.push("상세설명 칸을 찾지 못했습니다.");
          else {
            assign(box, payload.detailHtml);
            await sleep(400);
            steps.push("상세설명(HTML 작성)");
          }
        } else if (detailSpec) {
          warnings.push("상세설명 이미지를 받지 못했습니다. 화면에서 직접 올리세요.");
        }
      }

      // 4-4) 표의 줄 제목(`th`)이 유일한 손잡이인 몰(떠리몰 · 샵바이 파트너어드민).
      //
      // 칸에 `name` 도 `id` 도 없는 React 폼이다. 줄 제목이 **정확히 같은** 줄만 집는다 —
      // `상품 상세` 와 `상품 상세(상단)` 처럼 앞이 같은 줄이 있어서 앞부분 비교는 틀린다.
      // 순서: 검색해서 고르는 칸(분류가 다른 칸을 다시 그릴 수 있다) → 목록 → 라디오 →
      // 글자칸 → 이미지 → 상세설명.
      if (payload.tableForm) {
        const table = payload.tableForm;
        const tableNorm = (text) => String(text || "").replace(/[*•]/g, "").replace(/\s+/g, " ").trim();
        const squash = (text) => tableNorm(text).replace(/\s+/g, "");
        const rowOf = (label) => [...document.querySelectorAll("th")]
          .find((th) => tableNorm(th.textContent) === label)?.closest("tr") || null;
        const shown = (el) => Boolean(el) && el.offsetParent !== null && !el.disabled;
        const firstTextBox = (row) => [...row.querySelectorAll('input[type="text"]')].find(shown) || null;

        // (a) 검색해서 고르는 칸(담당자·분류·브랜드). 목록(`li`)은 그 줄 안에 뜬다.
        for (const entry of payload.tablePicks || []) {
          const row = rowOf(entry.row);
          const box = row && firstTextBox(row);
          if (!box) { warnings.push(`${entry.row} 검색칸을 찾지 못했습니다.`); continue; }
          box.focus();
          assign(box, entry.query);
          const want = squash(entry.pick);
          const findItem = () => [...row.querySelectorAll("li")]
            .find((li) => shown(li) && squash(li.textContent) === want) || null;
          let item = null;
          const until = Date.now() + (table.pickWaitMs || 6000);
          while (!item && Date.now() < until) {
            await sleep(400);
            item = findItem();
          }
          if (!item) { warnings.push(`${entry.row} 목록에 '${entry.pick}' 가 없습니다.`); continue; }
          const listBox = item.closest("ul");
          item.click();
          await sleep(800);
          // 골라진 값은 목록 **밖**에 나타난다 — 칩(표준분류·브랜드), 표 줄(전시분류), 글자칸
          // (담당자 `노영우(nogoon92)`). 목록은 닫히기도 하고 그대로 떠 있기도 해서(분류·브랜드,
          // 라이브 실측) 목록이 닫혔는지로는 못 본다. 검색어와 고를 글자가 같으면(브랜드)
          // 글자칸 값은 우리가 친 글자일 뿐이라 증거가 안 된다.
          const picked = [...row.querySelectorAll("li, td, span")]
            .some((el) => !(listBox && listBox.contains(el)) && squash(el.textContent).includes(want))
            || (squash(entry.query) !== want
              && [...row.querySelectorAll("input")].some((el) => squash(el.value) === want));
          if (picked) steps.push(`${entry.row} ${entry.pick}`);
          else warnings.push(`${entry.row} 에서 '${entry.pick}' 를 눌렀는데 골라지지 않았습니다.`);
        }

        // (b) 목록(select). 번호는 계정마다 달라서 보이는 글자(label)로 고른다.
        //     목록은 화면이 서버에서 받아 늦게 채운다(처음엔 '등록된 템플릿이 없습니다' 한 줄).
        for (const [label, want] of Object.entries(payload.tableSelects || {})) {
          const select = rowOf(label)?.querySelector("select");
          const pickOption = () => select && [...select.options]
            .find((option) => tableNorm(option.label || option.textContent) === want);
          let option = pickOption();
          for (let waited = 0; select && !option && waited < 8000; waited += 400) {
            await sleep(400);
            option = pickOption();
          }
          if (!option) { warnings.push(`${label} 에 '${want}' 가 없습니다.`); continue; }
          assign(select, option.value);
          steps.push(`${label} ${want}`);
          await sleep(400);
        }

        // (c) 라디오.
        for (const [label, value] of Object.entries(payload.tableRadios || {})) {
          const radio = rowOf(label)?.querySelector(`input[type="radio"][value="${CSS.escape(value)}"]`);
          if (!radio) { warnings.push(`${label} '${value}' 를 찾지 못했습니다.`); continue; }
          if (!radio.checked) radio.click();
          steps.push(`${label} ${value}`);
          await sleep(300);
        }

        // (d) 글자칸 — 그 줄의 첫 번째 보이는 글자칸.
        for (const [label, value] of Object.entries(payload.tableFields || {})) {
          const row = rowOf(label);
          const box = row && firstTextBox(row);
          if (!box) { warnings.push(`${label} 칸을 찾지 못했습니다.`); continue; }
          assign(box, value);
          box.dispatchEvent(new Event("blur", { bubbles: true }));
          steps.push(label);
        }

        // (e) 이미지. 칸이 처음엔 없는 줄(추가이미지)은 `이미지 추가` 를 눌러 늘린다.
        //     파일 칸은 `파일찾기` 버튼 안에 숨어 있다. 올릴 때마다 화면이 줄을 다시 그릴 수
        //     있어 칸은 매번 새로 찾는다.
        for (const slot of table.images || []) {
          const files = ((payload.imageGroups || {})[slot.key] || []).slice(0, slot.max || 1);
          if (files.length === 0) continue;
          const row = rowOf(slot.row);
          if (!row) { warnings.push(`${slot.row} 줄을 찾지 못했습니다.`); continue; }
          const boxes = () => [...row.querySelectorAll('input[type="file"]')];
          if (slot.addLabel) {
            const add = [...row.querySelectorAll("button")]
              .find((el) => tableNorm(el.textContent) === slot.addLabel);
            if (!add) { warnings.push(`${slot.row} '${slot.addLabel}' 버튼을 찾지 못했습니다.`); continue; }
            for (let i = boxes().length; i < files.length; i += 1) {
              add.click();
              await sleep(400);
            }
          }
          let placed = 0;
          for (const [index, image] of files.entries()) {
            const box = boxes()[index];
            if (!box) { warnings.push(`${slot.row} ${index + 1}번 칸이 없습니다.`); break; }
            try {
              const transfer = new DataTransfer();
              transfer.items.add(toFile(image));
              box.files = transfer.files;
              box.dispatchEvent(new Event("change", { bubbles: true }));
              await sleep(2500);
              placed += 1;
            } catch (error) {
              warnings.push(`${slot.row} ${index + 1}번 실패: ${error?.message || error}`);
            }
          }
          if (placed > 0) steps.push(`${slot.row} ${placed}장`);
        }

        // (f) 상세설명 — Summernote. 그림 버튼으로 파일을 넣으면 몰이 자기 서버에 올리고
        //     그 주소로 그림을 넣는다. 그림 창을 열 때마다 파일 칸이 새로 생겨서 연 뒤에 찾는다.
        //     `data:` 로 박히면 몰 서버에 올라간 것이 아니다 — 성공으로 치지 않는다.
        const note = table.summernote;
        if (note && payload.detailImage?.dataUrl) {
          const row = rowOf(note.row);
          const radio = row?.querySelector(`input[type="radio"][value="${CSS.escape(note.radio)}"]`);
          if (radio && !radio.checked) {
            radio.click();
            await sleep(1200);
          }
          const editor = row?.querySelector(".note-editor");
          const picture = editor && [...editor.querySelectorAll(".note-toolbar button")].find((button) =>
            /그림|picture/i.test(`${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""}`)
            || Boolean(button.querySelector(".note-icon-picture")));
          if (!picture) {
            warnings.push("상세설명 편집기의 그림 버튼을 찾지 못했습니다. 화면에서 직접 올리세요.");
          } else {
            picture.click();
            await sleep(800);
            const input = document.querySelector(".note-modal.open input.note-image-input")
              || document.querySelector("input.note-image-input");
            if (!input) {
              warnings.push("상세설명 그림 창의 파일 칸을 찾지 못했습니다. 화면에서 직접 올리세요.");
            } else {
              const transfer = new DataTransfer();
              transfer.items.add(toFile(payload.detailImage));
              input.files = transfer.files;
              input.dispatchEvent(new Event("change", { bubbles: true }));
              // 몰은 `//shopby-images.cdn-nhncommerce.com/…` 처럼 스킴 없는 주소로 넣는다(라이브 실측).
              const uploaded = () => [...editor.querySelectorAll(".note-editable img")]
                .find((el) => /^(https?:)?\/\//.test(el.getAttribute("src") || "")) || null;
              const until = Date.now() + (note.uploadWaitMs || 15000);
              while (!uploaded() && Date.now() < until) await sleep(500);
              if (uploaded()) steps.push("상세설명 이미지(몰 편집기에 올림)");
              else warnings.push("상세설명 이미지를 편집기에 올렸는데 들어가지 않았습니다. 화면에서 확인하세요.");
            }
          }
        }
      }

      // 5) 이름 없는 칸들. 폼으로 못 닿아 선택자로 찾는다.
      //
      // 계단식(원산지)이라 순서와 기다림이 중요하다. 앞 칸을 고르기 전에 뒤 칸을
      // 건드리면 목록이 비어 있어 아무것도 안 들어간다.
      for (const entry of payload.selectorFields || []) {
        const want = payload.selectorFieldValues[entry.key];
        if (want === undefined || want === "") continue;
        const el = document.querySelector(entry.selector);
        if (!el) { warnings.push(`${entry.label || entry.key} 칸을 찾지 못했습니다.`); continue; }
        /**
         * ⚠️ 잠긴 칸은 **조용히 지나가면 안 된다**(라이브 2026-09-11, 보리보리 담당MD).
         *
         * `disabled` 인 칸에 값을 넣으면 아무 일도 안 일어나는데 우리는 '채웠다' 고
         * 보고했다. 사장님 화면에서는 필수 칸이 빈 채로 남아 **거기서 멈춘 것처럼**
         * 보였다. 못 넣었으면 못 넣었다고 말해야 사람이 손댈 곳을 안다.
         */
        if (el.disabled) {
          warnings.push(`${entry.label || entry.key} 칸이 잠겨 있어 넣지 못했습니다. 화면에서 직접 고르세요.`);
          continue;
        }
        // 계단식 목록은 앞 단을 고른 뒤 AJAX 로 채워진다. 고를 항목이 생길 때까지 본다.
        if (el.tagName === "SELECT" && entry.waitForOption) {
          const until = Date.now() + 8000;
          while (![...el.options].some((option) => option.value === want) && Date.now() < until) {
            await sleep(250);
          }
        }
        assign(el, want);
        // 고른 값이 목록에 없으면 브라우저가 조용히 빈 값으로 되돌린다. 그냥 넘기지 않는다.
        if (el.tagName === "SELECT" && el.value !== want) {
          warnings.push(`${entry.label || entry.key} 에 '${want}' 가 목록에 없습니다.`);
          continue;
        }
        steps.push(entry.label || entry.key);
        if (entry.waitMs) await sleep(entry.waitMs);
      }

      // 5-1) 다 고른 뒤 눌러야 반영되는 버튼(꼬망세 `선택 카테고리 추가`).
      //
      // 누르고 끝내지 않는다 — 반영의 증거(`expectSelector`)가 늘어나는지 본다. 고른 값이
      // 하나라도 빠졌으면 누르지 않는다. 반쯤 고른 분류를 붙이면 엉뚱한 자리에 걸린다.
      for (const entry of payload.afterSelectorClicks || []) {
        if (entry.requireFilled) {
          const complete = (payload.selectorFields || []).every((field) => {
            const want = payload.selectorFieldValues[field.key];
            if (want === undefined || want === "") return true;
            const box = document.querySelector(field.selector);
            return Boolean(box) && box.value === want;
          });
          if (!complete) {
            warnings.push(`고를 칸이 다 채워지지 않아 '${entry.text}' 를 누르지 않았습니다.`);
            continue;
          }
        }
        const button = [...document.querySelectorAll("a,button,input[type=button]")]
          .find((el) => (el.textContent || el.value || "").replace(/\s+/g, " ").trim() === entry.text);
        if (!button) { warnings.push(`'${entry.text}' 버튼을 찾지 못했습니다.`); continue; }
        const before = entry.expectSelector ? document.querySelectorAll(entry.expectSelector).length : 0;
        button.click();
        await sleep(entry.waitMs || 1000);
        if (entry.expectSelector) {
          const until = Date.now() + 8000;
          let after = document.querySelectorAll(entry.expectSelector).length;
          while (after <= before && Date.now() < until) {
            await sleep(400);
            after = document.querySelectorAll(entry.expectSelector).length;
          }
          if (after <= before) {
            warnings.push(`'${entry.text}' 를 눌렀는데 반영되지 않았습니다. 화면에서 확인하세요.`);
            continue;
          }
        }
        steps.push(entry.label || entry.text);
      }

      // 5-2) 고른 분류가 그려 주는 줄들. 이름이 같아 속성 값(키드키즈 `info`)으로 가린다.
      //
      // 줄은 AJAX 로 온다. 기다리지 않으면 0줄을 보고 지나간다. 없는 줄은 경고한다 —
      // 몰이 고시 항목을 바꾸면 그 칸이 빈 채로 제출되기 때문이다.
      const infoSpec = payload.infoRows;
      const infoValues = payload.infoRowValues || {};
      if (infoSpec && Object.keys(infoValues).length > 0) {
        const until = Date.now() + (infoSpec.timeoutMs || 8000);
        let boxes = [...document.querySelectorAll(infoSpec.itemSelector)];
        while (boxes.length === 0 && Date.now() < until) {
          await sleep(300);
          boxes = [...document.querySelectorAll(infoSpec.itemSelector)];
        }
        let placed = 0;
        const absent = [];
        for (const [key, value] of Object.entries(infoValues)) {
          const box = boxes.find((el) => el.getAttribute(infoSpec.attr) === key);
          if (!box) { absent.push(key); continue; }
          assign(box, value);
          placed += 1;
        }
        if (placed > 0) steps.push(`${infoSpec.label} ${placed}줄`);
        if (absent.length > 0) {
          warnings.push(`${infoSpec.label} 칸 ${absent.length}개가 화면에 없습니다: ${absent.join(", ")}`);
        }
      }

      // 저장된 주소는 하나뿐인 경우가 많다. 내부 번호를 적어두지 않고 첫 항목을 고른다.
      for (const name of payload.selectFirstOptions || []) {
        const el = field(name);
        if (!el || el.tagName !== "SELECT") { warnings.push(`${name} 칸이 없습니다.`); continue; }
        const option = [...el.options].find((entry) => entry.value);
        if (!option) { warnings.push(`${name} 에 고를 항목이 없습니다. 화면에서 먼저 등록하세요.`); continue; }
        if (el.value !== option.value) { el.value = option.value; fire(el); }
      }

      // 6) 라디오 · 체크박스 — **누른다**. 값만 바꾸지 않는다.
      //
      // `checked = true` 에 change 이벤트를 얹는 것으로는 부족하다. 도매꾹은 라디오에
      // click 을 걸어 두어서, 이벤트만 쏘면 값은 바뀌어도 화면이 그대로다. 대표이미지
      // 방식이 전문가용으로 넘어가지 않아 `image1~4` 가 숨은 칸으로 남고, 거기 넣은
      // 사진이 통째로 사라진다(라이브 확인 2026-09-10: 이벤트=모드 그대로, 클릭=전환).
      for (const [name, value] of Object.entries(payload.radios)) {
        const hit = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)]
          .find((el) => el.value === value);
        if (!hit) { warnings.push(`라디오 ${name}=${value} 를 찾지 못했습니다.`); continue; }
        if (!hit.checked) hit.click();
        fire(hit);
      }
      for (const [name, on] of Object.entries(payload.checks)) {
        // `market[]:dome` 처럼 값까지 지정한 형태를 받는다.
        const [rawName, wantValue] = name.split(":");
        const list = [...form.querySelectorAll(`[name="${CSS.escape(rawName)}"]`)];
        const hit = wantValue ? list.find((el) => el.value === wantValue) : list[0];
        if (!hit) { warnings.push(`체크박스 ${name} 를 찾지 못했습니다.`); continue; }
        if (hit.checked !== Boolean(on)) hit.click();
        fire(hit);
      }

      // 이름이 없어 폼으로는 못 닿는 체크박스. 키워드 칸과 같은 사정이다.
      for (const entry of payload.selectorChecks || []) {
        const want = payload.selectorCheckValues[entry.key];
        if (want === undefined) continue;
        const box = form.querySelector(entry.selector);
        if (!box) { warnings.push(`${entry.label || entry.key} 칸을 찾지 못했습니다.`); continue; }
        if (box.checked !== Boolean(want)) box.click();
        steps.push(`${entry.label || entry.key} ${want ? "켬" : "끔"}`);
      }

      // 라디오가 화면을 갈아끼우는 경우가 있다(대표이미지 방식). 다시 그려질 시간을
      // 준 뒤에 이미지를 넣는다 — 바뀌기 전 칸에 넣으면 그대로 버려진다.
      await sleep(900);

      // 7) 상품분류 — 이름으로 한 단씩 눌러 들어간 뒤 '적용'.
      //
      // 값이 코드가 아니라 이름이라 보이는 글자로 찾는다. 한 단을 누르면 다음 칸이
      // 채워지므로 순서와 기다림이 중요하다. 한 상품에 여러 분류를 붙일 수 있다.
      const picker = payload.categoryPicker;
      for (const path of (picker ? payload.categoryPaths || [] : [])) {
        const table = document.getElementById(picker.tableId);
        if (!table) { warnings.push("상품분류 표를 찾지 못했습니다."); break; }
        let walked = 0;
        for (const name of path) {
          const columns = [...table.querySelectorAll("ul")];
          const column = columns[walked];
          const item = column
            ? [...column.querySelectorAll(picker.itemSelector)]
              .find((el) => (el.textContent || "").includes(name))
            : null;
          if (!item) break;
          item.click();
          walked += 1;
          await sleep(picker.stepWaitMs);
        }
        if (walked < path.length) {
          warnings.push(`상품분류 '${path.join(" > ")}' 에서 '${path[walked]}' 를 찾지 못했습니다.`);
          continue;
        }
        const apply = [...document.querySelectorAll("a,button")]
          .find((el) => ((el.textContent || "").replace(/\s+/g, " ").trim() === picker.applyText));
        if (!apply) { warnings.push("상품분류 적용 버튼을 찾지 못했습니다."); break; }
        apply.click();
        await sleep(picker.applyWaitMs);
        steps.push(`분류 ${path[path.length - 1]}`);
      }

      // 7-1) 분류 검색 — 이 몰이 '분류 먼저'가 아니면 여기서 한다.
      if (!payload.categoryFirst) await runCategorySearch();

      // 7-2) 분류 연결 — 레이어를 열어 단계 목록에서 이름으로 고르고 '연결'을 누른다.
      //
      // 앞의 두 방식과 다른 점은 **고른 뒤 따로 연결 버튼을 눌러야** 폼에 붙는다는
      // 것이다. 누르면 몰이 숨은 `connectCategory[]` 를 만들고 화면의 '연결된
      // 카테고리' 표에도 줄을 더한다. 끝나면 창은 닫아 준다 — 열린 채로 두면
      // 사람이 폼을 못 본다.
      const connect = payload.categoryConnect;
      if (connect && (payload.categoryPaths || []).length > 0) {
        const opener = document.getElementById(connect.openButtonId);
        if (!opener) {
          warnings.push("분류 연결 버튼을 찾지 못했습니다.");
        } else {
          opener.click();
          await sleep(connect.stepWaitMs);
          const layer = document.forms[connect.formName];
          if (!layer) {
            warnings.push("분류 연결 창이 열리지 않았습니다.");
          } else {
            for (const path of payload.categoryPaths) {
              let walked = 0;
              for (const name of path.slice(0, connect.levels)) {
                const select = layer.elements[`${connect.levelPrefix}${walked + 1}`];
                const option = select
                  ? [...select.options].find((el) => (el.textContent || "").trim() === name)
                  : null;
                if (!option) break;
                select.value = option.value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
                walked += 1;
                await sleep(connect.stepWaitMs);
              }
              if (walked < path.length) {
                warnings.push(`분류 '${path.join(" > ")}' 에서 '${path[walked]}' 를 찾지 못했습니다.`);
                continue;
              }
              const button = document.getElementById(connect.connectButtonId);
              if (!button) { warnings.push("'카테고리 연결' 버튼을 찾지 못했습니다."); break; }
              button.click();
              await sleep(connect.connectWaitMs);
              steps.push(`분류 ${path[path.length - 1]}`);
            }
            layer.closest(".ui-dialog")?.querySelector(".ui-dialog-titlebar-close")?.click();
            await sleep(400);
          }
        }
      }

      // 8) 대표이미지 — 폼 밖의 파일 칸에 넣는다. Cafe24 가 네 크기를 만든다.
      const repInput = payload.imageFileInput;
      if (repInput && payload.repImage?.dataUrl) {
        const box = document.querySelector(repInput.selector);
        if (!box) {
          warnings.push(`${repInput.label} 칸을 찾지 못했습니다.`);
        } else {
          try {
            const transfer = new DataTransfer();
            transfer.items.add(toFile(payload.repImage));
            box.files = transfer.files;
            box.dispatchEvent(new Event("change", { bubbles: true }));
            await sleep(repInput.waitMs);
            steps.push(repInput.label);
          } catch (error) {
            warnings.push(`${repInput.label} 실패: ${error?.message || error}`);
          }
        }
      }

      // 8-1) 숨은 파일 칸 여러 개(올웨이즈). 화면 순서로 잡는다.
      const fileInputs = payload.imageFileInputs;
      if (fileInputs && fileInputs.length > 0) {
        const boxes = [...document.querySelectorAll('input[type="file"]')];
        for (const [index, slot] of fileInputs.entries()) {
          const files = (payload.imageGroups || {})[slot.key] || [];
          if (files.length === 0) continue;
          // 선택자가 있으면 그걸 쓴다. 11번가는 같은 id 가 옵션 이미지 쪽에도 있어서
          // 화면 순서로 세면 엉뚱한 칸을 집는다.
          const box = slot.selector ? document.querySelector(slot.selector) : boxes[index];
          if (!box) { warnings.push(`${slot.label} 칸을 찾지 못했습니다.`); continue; }
          try {
            const transfer = new DataTransfer();
            for (const image of files) transfer.items.add(toFile(image));
            box.files = transfer.files;
            box.dispatchEvent(new Event("change", { bubbles: true }));
            await sleep(3500);
            steps.push(`${slot.label} ${files.length}장`);
          } catch (error) {
            warnings.push(`${slot.label} 실패: ${error?.message || error}`);
          }
        }
      }

      // 8-1-0) 칸을 늘려 가며 넣는 이미지(아이스크림몰 추가 이미지 · 꼬망세 상세 2~5).
      //
      // 구역은 id(`section`)로 찾는다. id 가 없는 몰(꼬망세)은 기준 칸(`anchorSelector`)
      // 에서 올라가 찾는다(`sectionClosest`). 누를 버튼도 글자(`addLabel`) 대신
      // 선택자(`addSelector`)로 줄 수 있다.
      const repeat = payload.imageRepeat;
      if (repeat) {
        const files = (payload.imageGroups || {})[repeat.groupKey] || [];
        const want = Math.min(files.length, repeat.max);
        const section = repeat.anchorSelector
          ? document.querySelector(repeat.anchorSelector)?.closest(repeat.sectionClosest) || null
          : document.getElementById(repeat.section);
        if (want > 0 && !section) {
          warnings.push(`${repeat.label} 구역을 찾지 못했습니다.`);
        } else if (want > 0) {
          const add = repeat.addSelector
            ? section.querySelector(repeat.addSelector)
            : [...section.querySelectorAll("button")]
              .find((el) => (el.textContent || "").trim() === repeat.addLabel);
          const slotSelector = repeat.slotSelector || 'input[type="file"][name^="imgInfo"]';
          const slots = () => section.querySelectorAll(slotSelector).length;
          // 번호가 2 부터면(꼬망세) 1번 칸은 이미 있는 다른 칸이다. 그만큼 더 있어야
          // 우리 칸이 다 생긴다.
          const first = repeat.firstIndex || 0;
          const base = first > 1 ? first - 1 : 0;
          if (!add) {
            warnings.push(`${repeat.label} 추가 버튼을 찾지 못했습니다.`);
          } else {
            // 배경 탭은 `setTimeout` 이 1초에 한 번으로 묶인다. 사이에 기다리면 한 장에
            // 1초씩 걸리므로 모자란 만큼 연속으로 누르고 한 번만 가라앉힌다(티처몰과 같다).
            for (let i = slots(); i < base + want; i += 1) add.click();
            await sleep(1200);
            let placed = 0;
            for (let i = 0; i < want; i += 1) {
              const name = repeat.namePattern
                .replace("{i}", String(i))
                .replace("{n}", String(first + i));
              // 같은 이름의 글자 칸(외부 주소용)이 있는 몰이 있다(꼬망세). 파일 칸만 집는다.
              const box = section.querySelector(`input[type="file"][name="${name}"]`);
              if (!box) { warnings.push(`${repeat.label} ${i + 1}번 칸이 없습니다.`); continue; }
              try {
                const transfer = new DataTransfer();
                transfer.items.add(toFile(files[i]));
                box.files = transfer.files;
                box.dispatchEvent(new Event("change", { bubbles: true }));
                await sleep(2500);
                placed += 1;
              } catch (error) {
                warnings.push(`${repeat.label} ${i + 1}번 실패: ${error?.message || error}`);
              }
            }
            if (placed > 0) steps.push(`${repeat.label} ${placed}장`);
          }
        }
        if (files.length > repeat.max) {
          warnings.push(`${repeat.label}는 ${repeat.max}장까지라 앞의 ${repeat.max}장만 넣었습니다.`);
        }
      }

      // 8-1-1) 창을 열어 넣는 이미지(11번가).
      //
      // 넣으면 몰이 자기 CDN 으로 올리고 창을 스스로 닫는다(라이브 확인: 넣은 뒤
      // `cdn.011st.com/tmp_pd/...` 썸네일이 붙고 창이 사라졌다).
      for (const slot of payload.imageDialogs || []) {
        const files = (payload.imageGroups || {})[slot.key] || [];
        if (files.length === 0) continue;
        const body = document.getElementById(slot.section);
        const want = slot.row.replace(/\s+/g, "");
        const row = body && [...body.querySelectorAll(".b-box__row")].find((el) => {
          const title = el.querySelector(".b-box__title");
          if (!title) return false;
          const text = (title.textContent || "").replace(/\s+/g, "").replace(/필수입력|도움말/g, "");
          // 제목이 같은 줄이 여럿이라 '+' 가 있는 줄만 고른다.
          return text.startsWith(want) && el.querySelector("button.c-addimg__btn-add");
        });
        const add = row && row.querySelector("button.c-addimg__btn-add");
        if (!add) { warnings.push(`${slot.label} 등록 버튼을 찾지 못했습니다.`); continue; }
        add.click();
        let box = null;
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          await sleep(400);
          const open = [...document.querySelectorAll('[id^="dialog-"]')]
            .filter((el) => el.offsetParent !== null)
            .find((el) => el.querySelector('input[type="file"]'));
          if (open) { box = open.querySelector('input[type="file"]'); break; }
        }
        if (!box) { warnings.push(`${slot.label} 창이 열리지 않았습니다.`); continue; }
        try {
          const transfer = new DataTransfer();
          for (const image of files) transfer.items.add(toFile(image));
          box.files = transfer.files;
          box.dispatchEvent(new Event("change", { bubbles: true }));
          await sleep(slot.waitMs || 6000);
          steps.push(`${slot.label} ${files.length}장`);
        } catch (error) {
          warnings.push(`${slot.label} 실패: ${error?.message || error}`);
        }
      }

      // 8-2) 몰 서버에 올린 뒤 칸을 채운다(티처몰).
      //
      // 파일 칸이 없는 몰이다. 사진 하나를 올리면 서버가 일곱 크기를 만들어 두고,
      // 우리는 '+' 로 줄을 만들어 그 줄의 숨은 칸 일곱 개에 주소를 넣는다.
      // 크기 이름은 칸 이름에서 읽는다 — 목록을 우리가 들고 있지 않는다.
      const upload = payload.imageUpload;
      const photos = upload ? (payload.imageGroups || {})[upload.groupKey] || [] : [];
      if (upload && photos.length > 0) {
        const table = document.getElementById(upload.tableId);
        if (!table) {
          warnings.push(`${upload.label} 표(#${upload.tableId})를 찾지 못했습니다.`);
        } else {
          let placed = 0;
          for (const [index, image] of photos.entries()) {
            try {
              const body = new FormData();
              body.append(upload.field, toFile(image));
              const response = await fetch(upload.endpoint, {
                method: "POST", body, credentials: "include",
              });
              const parsed = await response.json();
              const result = Array.isArray(parsed) ? parsed[0] : parsed;
              if (!result || result.status !== 1) {
                throw new Error(result?.msg || `응답 ${response.status}`);
              }
              // '등록된 사진이 없습니다' 줄은 비워야 첫 줄이 제자리에 들어간다.
              table.querySelectorAll(upload.emptyRowSelector).forEach((row) => row.remove());
              const add = document.getElementById(upload.addButtonId);
              if (!add) throw new Error(`줄 추가 버튼(#${upload.addButtonId})이 없습니다.`);
              add.click();
              await sleep(300);
              const rows = [...table.querySelectorAll("tbody tr")];
              const row = rows[rows.length - 1];
              const slots = row ? [...row.querySelectorAll(`input[name$="${upload.slotSuffix}"]`)] : [];
              if (slots.length === 0) throw new Error("사진 줄이 만들어지지 않았습니다.");
              for (const slot of slots) {
                const size = slot.name.slice(0, -upload.slotSuffix.length);
                slot.value = `${result.newFile}${size}${result.ext}`;
                // 몰이 하는 그대로 '보기'를 눌러 볼 수 있게 바꾼다. 안 하면 주소는
                // 들어갔는데 회색 글씨로 남아 사람이 안 들어간 줄 안다.
                const view = slot.closest("td")?.querySelector("span.view");
                if (view) { view.classList.remove("desc"); view.classList.add("hand", "blue"); }
              }
              // 사진을 보여 준다.
              //
              // 이 몰은 사진 칸을 '보기' 라는 **글자**로만 그린다. 저장된 상품도
              // 마찬가지라 눌러 보기 전에는 뭐가 들어갔는지 알 수 없다. 그러면 사람이
              // 채워진 폼을 보고도 "사진이 안 들어갔다"고 판단한다(실제로 그랬다).
              // 몰의 업로드 팝업이 하는 그대로 작은 그림을 붙여 눈으로 확인하게 한다.
              // 폼 값이 아니라 화면일 뿐이라 제출에는 영향이 없다.
              const previewSlot = slots.find((slot) => slot.name.startsWith("view"));
              const previewCell = previewSlot?.closest("td");
              if (previewCell && !previewCell.querySelector("img.kiditem-shot")) {
                const shot = document.createElement("img");
                shot.className = "kiditem-shot";
                shot.src = previewSlot.value;
                shot.height = 64;
                shot.title = `${upload.label} ${index + 1} — 키드아이템이 넣었습니다`;
                shot.style.cssText = "display:block;margin:4px auto 0;border:1px solid #ddd";
                previewCell.appendChild(shot);
              }
              placed += 1;
            } catch (error) {
              warnings.push(`${upload.label} ${index + 1}번째 실패: ${error?.message || error}`);
            }
          }
          if (placed > 0) steps.push(`${upload.label} ${placed}장`);
        }
      }

      // 9) 이미지 — data URL 을 File 로 되돌려 DataTransfer 로 넣는다.
      for (const image of payload.images || []) {
        const input = field(image.name);
        if (!input) { warnings.push(`이미지 칸 ${image.name} 이 없습니다.`); continue; }
        try {
          const transfer = new DataTransfer();
          transfer.items.add(toFile(image));
          input.files = transfer.files;
          fire(input);
          steps.push(`이미지 ${image.name}`);
        } catch (error) {
          warnings.push(`이미지 ${image.name} 실패: ${error?.message || error}`);
        }
      }

      // 10) 분류 추천 받기. 이미지 분석이 끝나야 뜨므로 이미지 뒤에 온다.
      const accept = payload.acceptRecommendation;
      if (accept && (payload.images || []).length > 0) {
        const found = await waitForRecommendation(accept);
        if (found) {
          found.click();
          await sleep(1200);
          steps.push("추천 분류 적용");
        } else {
          warnings.push("분류 추천이 뜨지 않았습니다. 화면에서 직접 고르세요.");
        }
      }

      // 11) 상세설명 — 팝업 에디터가 없는 몰만 여기서 넣는다.
      //    도매꾹은 '상품상세내용 작성하기' 버튼을 눌러 에디터로 넣으므로 여기 오지
      //    않는다(`register()` 가 폼 채움 뒤에 따로 몰고 간다).
      //
      // ⚠️ 넣을 것이 **HTML 이거나 올릴 이미지**면 들어온다. 몰이 자기 서버에 받아
      //    주는 경우(아트공구)는 주소를 미리 만들지 않아 `detailHtml` 이 비어 있다.
      //    HTML 만 보고 막으면 그 몰은 이 단계가 통째로 건너뛰어져 상세설명도,
      //    편집기 탭 전환도 일어나지 않는다(라이브 확인 2026-09-10).
      const hasDetailWork = Boolean(payload.detailHtml) || Boolean(payload.detailImage?.dataUrl);

      // 11-0) SmartEditor 2(아이스크림몰). 편집면 iframe 과 뒷단 textarea 를 함께 채운다.
      //       둘 다 해야 한다 — 화면에도 보이고 제출값도 맞는다.
      const se2 = payload.detailSmartEditor;
      if (se2 && !hasDetailWork) {
        // 조용히 건너뛰면 상품 설명이 빈 채로 등록된다. 반드시 말한다.
        warnings.push("상세설명에 넣을 것이 없습니다. 상세페이지를 먼저 확정하세요.");
      }
      // ⚠️ `detailHtml` 로 막지 않는다.
      //
      // 그 값은 남의 호스팅(diskn)이 성공해야 생기는데, **몰 업로드는 바로 그게 없을
      // 때 쓰라고 만든 길**이다. `detailHtml` 뒤에 가뒀더니 호스팅이 실패한 순간
      // 업로드까지 통째로 건너뛰어져 상세설명이 세 번 연속 빈 채로 남았다
      // (라이브 2026-09-11). 올릴 이미지가 있으면 들어온다.
      if (se2 && hasDetailWork) {
        // 구역 id 안에 칸이 있는 몰(아이스크림)과, textarea 자체에 id 가 있는 몰(꼬망세)이 있다.
        // 꼬망세는 같은 화면에 에디터가 둘이라 textarea 의 부모 칸으로 좁혀야 한다.
        const area = se2.section
          ? document.getElementById(se2.section)
          : (document.getElementById(se2.anchorId)?.parentElement || null);
        const box = area?.querySelector(`textarea[name="${se2.target}"]`);

        /**
         * SmartEditor 2 에 HTML 을 넣는 길은 **HTML 탭뿐**이다.
         *
         * 편집면(`iframe#se2_iframe`)의 `body.innerHTML` 에 직접 써 봐야 소용없다 —
         * 에디터가 제 모델로 다시 그리면서 1초쯤 뒤 `<p><br></p>` 로 되돌린다
         * (라이브 실측 2026-09-11: 쓰기 직후 77자 → 1초 뒤 11자). 그래서 두 번이나
         * 빈 채로 등록될 뻔했다.
         *
         * 사람이 하는 것과 같은 순서로 간다 —
         *   `HTML` 탭 → 소스 textarea 에 붙여넣기 → `Editor` 탭으로 복귀.
         * 그러면 에디터가 그 HTML 을 제 모델로 읽어 들여 7초 뒤에도 남는다.
         */
        const skin = area
          ? [...document.querySelectorAll("iframe")].find((el) => area.contains(el))
          : null;

        /**
         * 이미지를 **몰 서버에 먼저 올린다.**
         *
         * 에디터의 `사진` 버튼이 여는 팝업이 쓰는 그 엔드포인트다(라이브 실측
         * 2026-09-11: `attach_photo.js` → `POST /common/file/uploadImgEditor.do`,
         * 칸 이름 `UPLOAD_FILE`, 응답 `{Val:"sFileURL=/files/editor/…"}`).
         * 팝업을 열지 않는다 — 확장이 여는 창은 팝업 차단에 걸린다.
         *
         * 남의 호스팅 주소를 그대로 두면 몰이 "이미지가 출력되는지 확인하세요"
         * 라고 경고하는 그 상태가 된다. 몰 주소로 바꿔 두면 그 걱정이 사라진다.
         */
        let detailHtml = payload.detailHtml;
        const upload = se2.upload;
        if (upload && payload.detailImage?.dataUrl) {
          try {
            const file = toFile(payload.detailImage);
            let hosted = "";
            if (upload.mode === "html5") {
              /**
               * SmartEditor 2 표준 샘플(`file_uploader_html5.php`, 꼬망세).
               *
               * 파일 바이트를 **본문 그대로** 보내고 이름·크기·형식은 헤더로 준다 — 에디터의
               * `callAjaxForHTML5` 가 그렇게 한다(실측 `attach_photo.js`). 답은 JSON 이 아니라
               * `sFileInfo=…&sFileName=…&sFileURL=…` 글자다. 형식을 거절하면 `NOTALLOW_` 다.
               */
              const response = await fetch(upload.endpoint, {
                method: "POST",
                body: file,
                credentials: "include",
                headers: {
                  contentType: "multipart/form-data",
                  "file-name": encodeURIComponent(file.name),
                  "file-size": String(file.size),
                  "file-Type": file.type,
                },
              });
              // ⚠️ 꼬망세 서버는 PHP Notice 경고문(HTML)을 **응답 앞에** 찍고 그 뒤에
              // `&bNewLine=true&sFileName=…&sFileURL=https://nfile.edupre.co.kr/…` 를 붙인다
              // (라이브 실측 2026-09-11, 747자 중 뒤 220자). 앞부분만 잘라 보면 주소가 없다 —
              // 반드시 **전체 응답**을 `&` 로 쪼개 본다.
              const text = await response.text();
              if (text.includes("NOTALLOW_")) throw new Error("몰이 이 이미지 형식을 받지 않습니다.");
              for (const part of text.split("&")) {
                const at = part.indexOf("=");
                if (at > 0 && part.slice(0, at) === "sFileURL") hosted = part.slice(at + 1).trim();
              }
            } else {
              const body = new FormData();
              body.append(upload.field, file);
              const sig = document.querySelector('input[name="csSignature"]')?.value;
              if (sig) body.append("csSignature", sig);
              const response = await fetch(upload.endpoint, {
                method: "POST", body, credentials: "include",
              });
              const parsed = await response.json();
              hosted = new URLSearchParams(parsed?.Val || "").get("sFileURL") || "";
            }
            if (!hosted) throw new Error("응답에 주소가 없습니다.");
            // 상대 주소면 몰 주소로 굳힌다. 구매자 화면이 다른 도메인일 수 있다.
            hosted = new URL(hosted, location.origin).href;
            // 실측 등록물이 폭을 적은 몰(아이스크림 900)만 적는다.
            const width = upload.imgWidth ? ` width="${upload.imgWidth}"` : "";
            detailHtml = `<center><img src="${hosted}"${width}></center>`;
            steps.push("상세이미지 몰 업로드");
          } catch (error) {
            warnings.push(
              `상세이미지를 몰에 올리지 못했습니다: ${error?.message || error}`,
            );
          }
        }
        if (!detailHtml) {
          // 올리지도 못했고 읽을 수 있는 주소도 없다. 넣을 것이 없다는 사실을 말한다.
          warnings.push("상세설명에 넣을 이미지를 만들지 못했습니다. 화면에서 직접 넣으세요.");
        }
        let wrote = false;
        const deadline = detailHtml ? Date.now() + 15000 : 0;
        while (Date.now() < deadline) {
          let doc = null;
          try { doc = skin?.contentDocument || null; } catch { doc = null; }
          const source = doc?.querySelector(se2.sourceSelector);
          const toSource = doc?.querySelector(se2.toSourceSelector);
          const toEditor = doc?.querySelector(se2.toEditorSelector);
          if (!source || !toSource || !toEditor) { await sleep(500); continue; }
          try {
            toSource.click();
            await sleep(600);
            assign(source, detailHtml);
            await sleep(400);
            toEditor.click();
            await sleep(1500);
            const inner = doc.querySelector("iframe#se2_iframe");
            const written = inner?.contentDocument?.body?.innerHTML || "";
            // 빈 문단만 남았으면 들어간 것이 아니다. 길이로 보지 말고 내용으로 본다.
            wrote = written.replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, "").trim().length > 0;
          } catch (error) {
            warnings.push(`상세설명을 넣지 못했습니다: ${error?.message || error}`);
          }
          break;
        }
        // 제출값은 뒷단 textarea 가 들고 간다. 에디터가 제출 때 맞추지만 함께 채워 둔다.
        if (box) assign(box, detailHtml);
        if (wrote) steps.push("상세설명");
        else warnings.push("상세설명 편집기에 넣지 못했습니다. 화면에서 직접 넣으세요.");
      }

      if (!se2 && (payload.detailHtmlTarget || payload.detailSelector) && hasDetailWork) {
        // 위지윅 에디터가 붙은 칸은 에디터에 넣어야 한다. 숨은 textarea 에 써 봐야
        // 제출할 때 에디터 내용으로 덮인다.
        const spec = payload.detailRich;
        let rich = null;
        const self = payload.detailSelfUpload;
        // 편집기 파일매니저로 올리는 몰(아트공구 Froala)만 여기서 올린다. 자기 에디터 업로드를
        // 따로 가진 몰(키드키즈 TinyMCE)은 아래 그 에디터 갈래에서 올린다.
        if (Array.isArray(self?.editors) && payload.detailImage?.dataUrl) {
          // 편집기 탭을 먼저 연다. 기본 탭에서는 편집기가 숨어 있어 값을 넣어도
          // 사람 눈에는 빈 칸으로 보인다.
          if (self.tabSelector) {
            const tab = document.querySelector(self.tabSelector);
            if (tab) { tab.click(); await sleep(1200); }
            else warnings.push("상세설명 '직접 작성' 탭을 찾지 못했습니다.");
          }
          // 편집기의 파일매니저에 올려 Cafe24 주소를 받는다. 남의 호스팅을 거치면
          // 핫링크 차단에 걸려 구매자에게 깨진 이미지가 보인다.
          const editors = window.$Editor || {};
          const first = editors[(self.editors || [])[0]];
          const endpoint = first?.opts?.filesManagerUploadURL;
          if (!endpoint) {
            warnings.push("상세설명 업로드 주소를 찾지 못했습니다. 화면에서 직접 넣으세요.");
          } else {
            try {
              const body = new FormData();
              body.append(first.opts.fileUploadParam || "file", toFile(payload.detailImage));
              const response = await fetch(endpoint, { method: "POST", body, credentials: "include" });
              const result = await response.json();
              const link = String(result?.link || "").trim();
              if (!link) throw new Error(result?.error || "업로드 결과에 주소가 없습니다.");
              const html = `<center><img src="${link}"></center>`;
              const applied = [];
              for (const name of self.editors || []) {
                const editor = editors[name];
                if (!editor?.html?.set) continue;
                editor.html.set(html);
                try { editor.$oel.val(editor.html.get()); } catch { /* 원본 요소 없음 */ }
                applied.push(name);
              }
              if (applied.length > 0) { rich = true; steps.push(`상세설명(업로드 후 ${applied.length}곳)`); }
            } catch (error) {
              warnings.push(`상세설명을 올리지 못했습니다: ${error?.message || error}. 화면에서 직접 넣으세요.`);
            }
          }
        } else if (spec && spec.kind === "tinymce") {
          // TinyMCE 3(키드키즈). 제출할 때 에디터가 textarea 를 덮으므로 에디터에 넣는다.
          const editor = window.tinyMCE?.get?.(spec.editorId);
          if (editor) {
            rich = true;
            let html = payload.detailHtml;
            // 몰 서버에 먼저 올린다 — 사람이 `이미지 삽입/편집` 창의 [...] 으로 올리는 곳과 같다.
            // 실패하면 이미 읽히는 주소(`detailHtml`)가 있을 때만 그것으로 넣는다.
            const upload = spec.upload;
            if (upload && payload.detailImage?.dataUrl) {
              try {
                let file = toFile(payload.detailImage);
                // 서버가 확장자를 보고 이름을 새로 붙인다. 확장자 없는 이름이면 붙여 보낸다.
                if (!/\.(jpe?g|png|gif)$/i.test(file.name)) {
                  file = new File([file], `detail.${/png/i.test(file.type) ? "png" : "jpg"}`, { type: file.type });
                }
                const body = new FormData();
                body.append(upload.field, file);
                for (const [name, value] of Object.entries(upload.fields || {})) body.append(name, value);
                const response = await fetch(upload.endpoint, { method: "POST", body, credentials: "include" });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                // 응답은 업로드 창 화면 그대로다. 올린 파일 주소가 그 안 스크립트에 실린다.
                const text = await response.text();
                const hosted = (text.match(new RegExp(upload.hostedPattern)) || [])[0] || "";
                if (!hosted) throw new Error("응답에 올린 이미지 주소가 없습니다");
                html = `<center><img src="${hosted}"></center>`;
                steps.push("상세이미지 몰 업로드");
              } catch (error) {
                warnings.push(`상세이미지를 몰에 올리지 못했습니다: ${error?.message || error}`);
              }
            }
            if (html) {
              try { if (spec.validElements) editor.schema?.addValidElements?.(spec.validElements); } catch { /* 옛 에디터 */ }
              editor.setContent(html);
              try { window.tinyMCE.triggerSave(); } catch { /* 제출 때 다시 옮긴다 */ }
              steps.push("상세설명(에디터)");
            } else {
              // 에디터는 있는데 넣을 것이 없다. 조용히 넘기면 상세가 빈 채로 등록된다.
              warnings.push("상세설명에 넣을 이미지를 만들지 못했습니다. 화면에서 직접 넣으세요.");
            }
          }
        } else if (spec && spec.kind === "froala") {
          // `$Editor[이름]` 이 편집기, `$oel` 이 그 뒤의 숨은 textarea 다.
          // 둘 다 맞춰야 화면과 제출값이 같아진다.
          const editors = window.$Editor || {};
          const applied = [];
          for (const name of spec.editors || []) {
            const editor = editors[name];
            if (!editor?.html?.set) continue;
            editor.html.set(payload.detailHtml);
            try { editor.$oel.val(editor.html.get()); } catch { /* 원본 요소 없음 */ }
            applied.push(name);
          }
          if (applied.length > 0) { rich = true; steps.push(`상세설명(에디터 ${applied.length}곳)`); }
        } else if (spec) {
          rich = [...document.querySelectorAll(spec.selector)]
            .map((el) => el.ckeditorInstance).find(Boolean) || null;
          if (rich) {
            rich.setData(payload.detailHtml);
            steps.push("상세설명(에디터)");
          }
        }
        if (rich) {
          // 위에서 이미 넣었다.
        } else if (payload.detailRich) {
          warnings.push("상세설명 에디터를 찾지 못했습니다. 화면에서 직접 넣으세요.");
        } else if (payload.detailSelector) {
          // 이름이 없는 화면(11번가). 편집기 방식이 'HTML' 로 기본 선택돼 있어
          // 뒤의 textarea 에 그대로 넣으면 된다.
          const box = document.querySelector(payload.detailSelector);
          if (box) { assign(box, payload.detailHtml); steps.push("상세설명"); }
          else warnings.push("상세설명 칸을 찾지 못했습니다.");
        } else if (setValue(payload.detailHtmlTarget, payload.detailHtml)) {
          // 값을 넣는 칸과 사람이 보는 칸이 다른 몰(티처몰)은 미리보기도 맞춘다.
          // 안 그러면 제출값은 맞는데 화면이 비어 보여 사람이 에디터를 열어 덮는다.
          if (payload.detailPreviewSelector) {
            const preview = document.querySelector(payload.detailPreviewSelector);
            if (preview) preview.innerHTML = payload.detailHtml;
          }
          steps.push("상세설명");
        } else {
          warnings.push(`상세설명 칸 ${payload.detailHtmlTarget} 이 없습니다.`);
        }
      }

      said.push(...writeDialogsSince(dialogMark));
      // 몰이 한 말은 사람에게 넘긴다. 같은 문장이 여러 번 오면 한 번만.
      for (const message of [...new Set(said)]) warnings.push(`몰 안내: ${message}`);
      return { ok: true, steps, warnings, submitted: false };
    })();
  }

  /**
   * 등록화면에서 '상품상세내용 작성하기' 를 눌러 상세설명을 넣는다(도매꾹). 에디터 팝업은 같은 오리진이라
   * `window.open` 이 돌려주는 창을 그대로 만진다 — 주소로 찾으면 예전에 열어둔 에디터를 잡는다(라이브 2026-09-10).
   * MAIN 월드여야 한다. 격리 월드에서는 페이지의 `window.open` 을 갈아끼울 수 없다.
   */
  function driveDetailEditor(payload) {
    return (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const alerts = [];

      const button = document.getElementById(payload.buttonId);
      if (!button) return { ok: false, error: "'상품상세내용 작성하기' 버튼이 없습니다." };

      let popup = null;
      const nativeOpen = window.open;
      window.open = function capturePopup(...args) {
        const win = nativeOpen.apply(window, args);
        if (win) popup = win;
        return win;
      };
      try { button.click(); } finally { window.open = nativeOpen; }
      if (!popup) return { ok: false, error: "상세내용 에디터 창이 열리지 않았습니다." };

      const elementIn = (id) => { try { return popup.document.getElementById(id); } catch { return null; } };
      const bodyOf = (key) => {
        const frame = elementIn(payload.framePrefix + key + payload.frameSuffix);
        try { return frame && frame.contentDocument ? frame.contentDocument.body.innerHTML : null; }
        catch { return null; }
      };

      // 에디터는 opener 콜백을 받은 뒤에 만들어진다. 생길 때까지 기다린다.
      const deadline = Date.now() + payload.openTimeoutMs;
      while (Date.now() < deadline) {
        if (bodyOf(payload.editorKey) !== null && elementIn(payload.submitId)) break;
        await sleep(300);
      }
      const target = elementIn(payload.framePrefix + payload.editorKey + payload.frameSuffix);
      const submit = elementIn(payload.submitId);
      if (!target || !target.contentDocument || !submit) {
        return { ok: false, error: "상세내용 에디터가 열리지 않았습니다." };
      }

      target.contentDocument.body.innerHTML = payload.html;

      // `내 다른 판매상품 홍보`. 넣을 값이 있으면 채운다 — 그래야 켠 채로 둘 수 있다.
      // 켜고 비워두면 도매꾹이 "내용을 입력해주세요" 로 제출을 막는다.
      if (payload.promoKey && payload.promoHtml) {
        const promo = elementIn(payload.framePrefix + payload.promoKey + payload.frameSuffix);
        if (promo && promo.contentDocument) promo.contentDocument.body.innerHTML = payload.promoHtml;
      }

      // 켜져 있는데 비어 있는 항목을 끈다. 도매꾹이 그 항목을 채우라고 대화상자를
      // 띄우는데, 그게 뜨면 등록화면까지 같이 얼어붙는다(같은 렌더러다).
      const turnedOff = [];
      let boxes = [];
      try { boxes = [...popup.document.querySelectorAll(payload.toggleSelector)]; } catch { boxes = []; }
      for (const box of boxes) {
        if (box.disabled || !box.checked || box.value === payload.editorKey) continue;
        // 도매꾹이 쓰는 판정과 같게 본다: 글자가 있거나 img 가 있으면 내용이 있는 것.
        // 태그만 남은 빈 껍데기(`<p><br></p>` 같은)를 내용으로 세면 그 항목이 켜진 채
        // 남고, 제출할 때 몰이 대화상자를 띄운다.
        const html = bodyOf(box.value) || "";
        const hasImage = /<img\b/i.test(html);
        const hasText = html.replace(/<[^>]*>/g, "").replace(/&nbsp;|\s/gi, "").length > 0;
        if (hasImage || hasText) continue;
        box.click();
        turnedOff.push(box.value);
      }
      await sleep(400);

      // 그래도 몰이 할 말이 있으면 삼켜서 가져온다. 버리지 않고 경고로 올린다.
      // 교체가 제출보다 먼저다 — 대화상자가 뜨면 이 화면도 같이 멈춘다.
      try { popup.alert = (message) => { alerts.push(String(message)); }; } catch { /* 이미 닫힘 */ }
      try { submit.click(); } catch { /* 이미 닫힘 */ }

      // 값은 이 화면으로 돌아온다. 에디터가 opener 콜백으로 채운다.
      const form = document.querySelector(payload.formSelector);
      const field = form ? form.elements[payload.target] : null;
      const until = Date.now() + payload.submitTimeoutMs;
      while (Date.now() < until) {
        if ((field && field.value) || alerts.length > 0) break;
        await sleep(200);
      }

      const filled = Boolean(field && field.value);
      // 실패했으면 반쯤 열린 창을 남기지 않는다.
      if (!filled) { try { popup.close(); } catch { /* 이미 닫힘 */ } }
      return {
        ok: true,
        filled,
        alerts,
        turnedOff,
        length: field && field.value ? field.value.length : 0,
      };
    })();
  }

  /** 이 문서에 등록 폼(또는 준비 표식)이 있는가 — 모든 프레임에 넣는 몰(11번가·떠리몰)이 채울 프레임을 고른다. */
  function formState(args) {
    const selector = args && args.formSelector ? String(args.formSelector) : "body";
    const ready = args && args.readySelector ? String(args.readySelector) : "";
    return {
      href: location.href,
      doc: performance.timeOrigin,
      form: Boolean(document.querySelector(selector)),
      ready: !ready || Boolean(document.querySelector(ready)),
    };
  }

  calls["mallForm.fill"] = async (payload) => {
    const mark = beginWriteDialogs();
    const outcome = await fillMallProductForm(payload || {}, mark);
    return { ...outcome, dialogs: writeDialogsSince(mark) };
  };
  calls["mallForm.detailEditor"] = (payload) => driveDetailEditor(payload || {});
  calls["mallForm.state"] = (args) => formState(args);
})();
