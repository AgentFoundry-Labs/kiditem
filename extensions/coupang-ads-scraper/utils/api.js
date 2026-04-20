// KIDITEM OS — 서버 통신 모듈
const KIDITEM_API = "http://localhost:4000";
const KIDITEM_AUTH_TOKEN_KEY = "kiditem_auth_token";

function kiditemGetAuthToken() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([KIDITEM_AUTH_TOKEN_KEY], (r) => {
        resolve(r[KIDITEM_AUTH_TOKEN_KEY] || null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function kiditemAuthedFetch(path, init = {}) {
  const token = await kiditemGetAuthToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${KIDITEM_API}${path}`, { ...init, headers });
}

const KiditemAPI = {
  async sync(type, data) {
    try {
      const res = await kiditemAuthedFetch(`/api/ads/extension/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, data, timestamp: new Date().toISOString() }),
      });
      const json = await res.json();

      // 동기화 시간 저장
      if (json.success) {
        const key = `kiditem_last_sync_${type}`;
        chrome.storage.local.set({ [key]: { time: Date.now(), count: data.length } });
      }

      return json;
    } catch (e) {
      console.error("[KIDITEM] API 통신 실패:", e.message);
      return { success: false, error: e.message };
    }
  },

  async getStatus() {
    try {
      const res = await kiditemAuthedFetch(`/api/ads/extension/sync`);
      return await res.json();
    } catch {
      return { connected: false };
    }
  },
};
