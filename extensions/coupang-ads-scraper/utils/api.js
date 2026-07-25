// KIDITEM OS — environment-bound server communication proxy.
// The service worker owns the approved API origins and bearer tokens.

async function kiditemApiRequest(path, init = {}) {
  const result = await chrome.runtime.sendMessage({
    action: 'kiditemApiRequest',
    path,
    init,
  });
  if (!result?.success) {
    throw new Error(result?.error || 'KidItem API request failed');
  }
  return result;
}

const KiditemAPI = {
  async sync(type, data) {
    try {
      const result = await kiditemApiRequest('/api/ads/extension/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          data,
          timestamp: new Date().toISOString(),
        }),
      });
      const json = result.body || {};
      if (json.success) {
        const key = `kiditem_last_sync_${type}`;
        chrome.storage.local.set({
          [key]: { time: Date.now(), count: data.length },
        });
      }
      return json;
    } catch (error) {
      console.error('[KIDITEM] API 통신 실패:', error.message);
      return { success: false, error: error.message };
    }
  },

  async getStatus() {
    try {
      const result = await kiditemApiRequest('/api/ads/extension/sync');
      return result.body || { connected: result.ok };
    } catch {
      return { connected: false };
    }
  },
};
