/**
 * 스펙용 가짜 로그인 화면(KID-377) — `fakeTabPages`에 끼운다. 로그인 전에는 어느 주소로 가도 `loginAt`에 닿고, 모든
 * 프레임 살피기(`frames`)는 그 로그인 화면에서 로그인 폼을 보인다. 페이지 호출 `login.fill`이 오면 채운 값을 적고, `accept`면 로그인된다
 * (아니면 폼이 남고 `dialog`를 알림 창 문장으로 남긴다). 그 밖의 메시지는 `undefined` — 부른 쪽의 답으로 넘어간다.
 */
export function fakeLoginScreen(options: { loginAt: string; accept?: boolean; dialog?: string; signedIn?: boolean }) {
  const state = { signedIn: options.signedIn === true, filled: [] as Array<Record<string, unknown>>, dialogs: [] as string[] };
  return {
    state,
    landAt: (url: string) => (state.signedIn ? url : options.loginAt),
    frames: (_files: readonly string[], _call: number, url: string) => [{ frameId: 0, result: { loginForm: !state.signedIn && url === options.loginAt } }],
    answer(message: Record<string, unknown>): unknown {
      if (message.type !== 'KIDITEM_PAGE_CALL' || !String(message.call).startsWith('login.')) return undefined;
      if (message.call === 'login.watchDialogs') return { ok: true, value: true };
      if (message.call === 'login.takeDialogs') {
        const dialogs = state.dialogs;
        state.dialogs = [];
        return { ok: true, value: dialogs };
      }
      if (state.signedIn) return { ok: true, value: { state: 'no-login-form' } };
      state.filled.push((message.args as { values: Record<string, unknown> }).values);
      if (options.accept === false) {
        if (options.dialog) state.dialogs.push(options.dialog);
      } else {
        state.signedIn = true;
      }
      return { ok: true, value: { state: 'submitted', method: 'exact-text' } };
    },
  };
}

/** 로그인 단계의 시계(기다림은 바로 지나간다). */
export function fastClock() {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
}
