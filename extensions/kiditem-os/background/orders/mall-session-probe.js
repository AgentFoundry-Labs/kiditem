(function initializeMallSessionProbe(root) {
  "use strict";

  // 몰 관리자 로그인 상태를 **조용히** 확인한다 — 로그인은 하지 않는다.
  //
  // 몰마다 정해진 읽기 전용 주소 하나를 사용자 쿠키로 한 번 읽고, 확실한 표시가 있을 때만
  // 판단한다. 어느 주소를 읽고 무엇을 로그인 표시로 볼지는 몰 세션 모듈의 한 줄
  // 스펙(`entryUrl` · `headers` · `loggedInSignal`)이 정한다(KID-254). 여기 남은 것은 그
  // 한 번의 읽기를 실제로 해내는 방법뿐이다 — 몰 목록을 여기 따로 적지 않는다.
  //
  // 답에는 판정과 이유 코드만 담는다 — 주소 · 본문 · 헤더 · 쿠키는 돌려주지 않는다. 웹은
  // 몰 키만 보낼 수 있고, 주소는 스펙에서만 나온다.

  function decodeAll(buffer) {
    const texts = [new TextDecoder("utf-8").decode(buffer)];
    // euc-kr 몰(키드키즈 등)은 utf-8 로 읽으면 한글이 깨진다. 깨졌으면 euc-kr 로도 읽어 둘 다 본다.
    if (texts[0].includes("�")) {
      try {
        texts.push(new TextDecoder("euc-kr").decode(buffer));
      } catch {
        // 이 런타임에 euc-kr 디코더가 없다 — utf-8 결과만으로 판단한다.
      }
    }
    return texts;
  }

  function pathOf(url) {
    try {
      return new URL(url).pathname;
    } catch {
      return "";
    }
  }

  /**
   * `specs` 는 몰 세션 모듈의 스펙 표, `reasons` 는 그 모듈이 쓰는 이유 코드 한 벌이다.
   * 조용한 확인만 따로 쓸 일은 없으므로 둘 다 받아야 만들어진다.
   */
  function create({ fetch: fetchImpl, specs, reasons, timeoutMs = 8000 } = {}) {
    if (typeof fetchImpl !== "function") throw new Error("mall session probe needs fetch");
    if (!specs || !reasons) throw new Error("mall session probe needs mall specs and reasons");

    const verdict = (state, reason) => ({ verdict: state, reason });

    function specOf(mallKey) {
      const key = typeof mallKey === "string" ? mallKey : "";
      if (!Object.prototype.hasOwnProperty.call(specs, key)) return null;
      const spec = specs[key];
      return typeof spec?.loggedInSignal === "function" ? spec : null;
    }

    async function request(spec, redirect, signal) {
      return fetchImpl(spec.entryUrl, {
        method: "GET",
        credentials: "include",
        redirect,
        cache: "no-store",
        headers: { ...(spec.headers || {}) },
        signal,
      });
    }

    async function probe(mallKey) {
      const spec = specOf(mallKey);
      if (!spec) return verdict("unknown", reasons.NO_PASSIVE_CHECK);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response;
        try {
          response = await request(spec, "follow", controller.signal);
        } catch (error) {
          if (controller.signal.aborted) throw error;
          // 로그인 화면이 권한 밖 주소(http · 통합 로그인)로 넘기면 따라가지 못해 읽기가 실패한다.
          // 관리자 전용 주소에서 튕겨 나갔다는 사실만 다시 확인한다 — 어디로 갔는지는 보지도
          // 돌려주지도 않는다.
          const manual = await request(spec, "manual", controller.signal);
          const bounced = manual.type === "opaqueredirect" || (manual.status >= 300 && manual.status < 400);
          return bounced
            ? verdict("out", reasons.REDIRECTED_AWAY)
            : verdict("unknown", reasons.NETWORK_ERROR);
        }
        if (response.status === 401 || response.status === 403) {
          return verdict("out", reasons.HTTP_UNAUTHORIZED);
        }
        const page = {
          finalPath: pathOf(String(response.url || spec.entryUrl)),
          texts: decodeAll(await response.arrayBuffer()),
        };
        return spec.loggedInSignal(page);
      } catch {
        return verdict("unknown", controller.signal.aborted ? reasons.TIMEOUT : reasons.NETWORK_ERROR);
      } finally {
        clearTimeout(timer);
      }
    }

    return Object.freeze({ probe });
  }

  root.KidItemMallSessionProbe = Object.freeze({ create });
})(globalThis);
