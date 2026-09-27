// 몰 판매 상태 쓰기·읽기의 화면 안 요청 중 화면 전역을 쓰는 것(MAIN world, KID-256 — 옛 `mall-availability-send.js` 이식):
// 롯데ON은 요청 머리를 화면이 요청마다 쓰는 함수(`gcm._sbm_setRequestHeader`)로 붙이고, 스마트스토어는 화면 자신의 Angular
// `$http`로 보낸다(화면 인터셉터가 붙이는 머리가 그대로 실린다). 토큰은 밖으로 나가지 않는다.
(function installMallAvailabilityMain() {
  "use strict";
  const calls = window.__kiditemPageCalls || (window.__kiditemPageCalls = {});

  /**
   * 롯데ON 판매자센터 화면 안(MAIN)에서 soapi 에 JSON 을 POST 한다. 요청 머리는 화면이 요청마다 쓰는 함수
   * (`gcm._sbm_setRequestHeader` — 토큰 · 시간대 · 기기)로 붙인다. 토큰은 이 함수 밖으로 나가지 않는다.
   * 판매자센터는 화면이 뜬 뒤에야 토큰을 채우므로 로그인 화면이 아니면 잠시 기다린다.
   * `slimRows` 면 상품 조회 답에서 우리가 쓰는 칸만 추려 돌려준다. 워커가 인자로만 넘긴다.
   */
  async function lotteonPostOnPage(url, body, slimRows) {
    try {
      const deadline = Date.now() + 20000;
      const ready = () => typeof gcm !== "undefined" && gcm && typeof gcm._sbm_setRequestHeader === "function"
        && Boolean(sessionStorage.getItem("AuthToken"));
      while (!ready()) {
        if (/login/i.test(location.href) || Date.now() > deadline) return { status: 401, json: null, loggedOut: true };
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const answer = await new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
        xhr.setRequestHeader("Accept", "application/json");
        gcm._sbm_setRequestHeader(xhr);
        xhr.onload = () => {
          let json = null;
          try {
            json = JSON.parse(xhr.responseText);
          } catch {
            json = null;
          }
          resolve({ status: xhr.status, json });
        };
        xhr.onerror = () => resolve({ status: 0, json: null });
        xhr.send(JSON.stringify(body));
      });
      const loggedOut = answer.status === 401 || answer.status === 403;
      if (slimRows) {
        const rows = Array.isArray(answer.json?.data)
          ? answer.json.data.map((row) => ({
            spdNo: row?.spdNo ?? null,
            slStatCd: row?.slStatCd ?? null,
            trNo: row?.trNo ?? null,
            lrtrNo: row?.lrtrNo ?? null,
            trGrpCd: row?.trGrpCd ?? null,
            dvPdTypCd: row?.dvPdTypCd ?? null,
          }))
          : null;
        return { status: answer.status, loggedOut, returnCode: answer.json?.returnCode ?? null, rows };
      }
      return { status: answer.status, loggedOut, json: answer.json };
    } catch (error) {
      return { status: 0, json: null, loggedOut: false, error: String(error?.message || error).slice(0, 200) };
    }
  }

  /**
   * 스마트스토어센터 화면 안(MAIN)에서 화면 자신의 Angular `$http` 로 요청 하나를 보낸다 — 화면 인터셉터가 붙이는 머리가
   * 그대로 실린다. `kind` 는 search(목록 검색) · status(판매상태 변경) · progress(일괄변경 결과). 우리가 쓰는 칸만 추린다.
   * 화면이 다 뜰 때까지(Angular 가 설 때까지) 잠시 기다린다. 워커가 인자로만 넘긴다.
   */
  async function smartstoreApiOnPage(kind, url, payload) {
    try {
      const deadline = Date.now() + 20000;
      let injector = null;
      while (!injector) {
        try {
          injector = window.angular ? window.angular.element(document.body).injector() : null;
        } catch {
          injector = null;
        }
        if (injector) break;
        if (location.hostname !== "sell.smartstore.naver.com" || Date.now() > deadline) return { status: 401, loggedOut: true };
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const $http = injector.get("$http");
      const method = kind === "progress" ? "GET" : kind === "status" ? "PATCH" : "POST";
      let response;
      try {
        response = await $http(kind === "progress" ? { method, url } : { method, url, data: payload });
      } catch (failure) {
        const status = Number(failure?.status) || 0;
        const said = failure?.data?.message || failure?.data?.errorMessage || null;
        return { status, loggedOut: status === 401 || status === 403, message: said ? String(said).slice(0, 160) : null };
      }
      const data = response?.data;
      if (kind === "search") {
        if (!Array.isArray(data?.content)) return { status: response.status, error: "content" };
        return {
          status: response.status,
          rows: data.content.map((row) => ({
            id: row?.id === undefined || row?.id === null ? "" : String(row.id),
            productStatusType: row?.productStatusType ?? null,
            channelProductNos: Array.isArray(row?.singleChannelProducts)
              ? row.singleChannelProducts.map((channel) => String(channel?.channelProductNo ?? "")).filter(Boolean)
              : [],
          })),
        };
      }
      if (kind === "status") return { status: response.status, state: data?.status ?? null };
      const result = data?.productBulkUpdateResultVO || null;
      const failures = result?.resultMessage && typeof result.resultMessage === "object"
        ? Object.values(result.resultMessage).map((value) => String(value).slice(0, 120)).slice(0, 3)
        : [];
      return {
        status: response.status,
        completed: data?.completed === undefined ? null : data.completed === true,
        state: data?.status ?? null,
        errorMessage: data?.errorMessage ? String(data.errorMessage).slice(0, 160) : null,
        successIds: Array.isArray(result?.successIds) ? result.successIds.map(String) : null,
        failures,
      };
    } catch (error) {
      return { status: 0, error: String(error?.message || error).slice(0, 200) };
    }
  }

  calls["availability.lotteonPostOnPage"] = (args) => lotteonPostOnPage(...(Array.isArray(args) ? args : []));
  calls["availability.smartstoreApiOnPage"] = (args) => smartstoreApiOnPage(...(Array.isArray(args) ? args : []));
})();
