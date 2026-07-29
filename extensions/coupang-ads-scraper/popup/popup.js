const ENVIRONMENTS = Object.freeze({
  local: { label: '로컬', webOrigin: 'http://localhost:3000' },
  office: { label: '사무실', webOrigin: 'http://kiditem-office' },
  staging: { label: '스테이징', webOrigin: 'https://staging.merchon.org' },
});

let selectedEnvironmentId = null;

function runtimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function requireSelectedEnvironment() {
  if (!selectedEnvironmentId || !ENVIRONMENTS[selectedEnvironmentId]) {
    throw new Error('사용할 KidItem 환경을 선택해주세요.');
  }
  return selectedEnvironmentId;
}

async function popupFetch(path, init = {}) {
  const response = await runtimeMessage({
    action: 'kiditemApiRequest',
    environmentId: requireSelectedEnvironment(),
    path,
    init,
  });
  if (!response?.success) throw new Error(response?.error || '서버 요청 실패');
  return response;
}

async function bindActiveTab() {
  const environmentId = requireSelectedEnvironment();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('현재 탭을 찾을 수 없습니다.');
  const result = await runtimeMessage({
    action: 'bindKidItemEnvironment',
    tabId: tab.id,
    environmentId,
  });
  if (!result?.success) throw new Error(result?.error || '환경 연결 실패');
  return tab;
}

function timeAgo(ts) {
  if (!ts) return '-';
  const diff = Date.now() - ts;
  if (diff < 60000) return '방금 전';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  return `${Math.floor(diff / 86400000)}일 전`;
}

function setCardValue(id, text, hasDot = false, dotColor = 'dot-gray') {
  const element = document.getElementById(id);
  if (!element) return;
  const dot = hasDot ? `<span class="dot ${dotColor}"></span>` : '';
  element.innerHTML = dot + text;
  element.className = text === '-' || text === '아직 없음' ? 'value none' : 'value';
}

function showResult(message, error = false) {
  const element = document.getElementById('syncResult');
  element.textContent = message;
  element.className = `sync-result ${error ? 'error' : 'success'}`;
}

function scopedKey(base) {
  return `${base}:${requireSelectedEnvironment()}`;
}

async function configureEnvironmentSelector() {
  const result = await runtimeMessage({ action: 'getConnectedKidItemEnvironments' });
  const environmentIds = Array.isArray(result?.environmentIds)
    ? result.environmentIds.filter((id) => ENVIRONMENTS[id])
    : [];
  const select = document.getElementById('environmentSelect');
  select.replaceChildren();

  if (environmentIds.length === 0) {
    select.append(new Option('연결된 환경 없음', ''));
    select.disabled = true;
    selectedEnvironmentId = null;
    showResult('로컬, 사무실 또는 스테이징 KidItem에 로그인한 뒤 다시 열어주세요.', true);
    return false;
  }

  select.disabled = false;
  if (environmentIds.length > 1) {
    select.append(new Option('환경 선택', ''));
    selectedEnvironmentId = null;
  }
  for (const environmentId of environmentIds) {
    select.append(new Option(ENVIRONMENTS[environmentId].label, environmentId));
  }
  if (environmentIds.length === 1) {
    selectedEnvironmentId = environmentIds[0];
    select.value = selectedEnvironmentId;
  }
  select.addEventListener('change', () => {
    selectedEnvironmentId = select.value || null;
    if (selectedEnvironmentId) initEnvironmentStatus();
  });
  return selectedEnvironmentId !== null;
}

async function initEnvironmentStatus() {
  if (!selectedEnvironmentId) return;
  try {
    const status = await popupFetch('/api/ads/extension/sync');
    if (!status.ok) throw new Error(`HTTP ${status.status}`);
    setCardValue('serverStatus', '연결됨 ✅');
    document.getElementById('connBadge').textContent = ENVIRONMENTS[selectedEnvironmentId].label;
    document.getElementById('connBadge').className = 'badge';
  } catch {
    setCardValue('serverStatus', '연결 안됨 ❌');
    document.getElementById('connBadge').textContent = '오프라인';
    document.getElementById('connBadge').className = 'badge offline';
  }

  const syncKeys = ['traffic', 'itemwinner', 'ads'];
  const keys = syncKeys.map((type) => scopedKey(`kiditem_last_sync_${type}`));
  chrome.storage.local.get(keys, (data) => {
    for (const [type, elementId] of [
      ['traffic', 'trafficSync'],
      ['itemwinner', 'winnerSync'],
      ['ads', 'adsSync'],
    ]) {
      const value = data[scopedKey(`kiditem_last_sync_${type}`)];
      setCardValue(
        elementId,
        value ? `${timeAgo(value.time)} (${value.count}개)` : '아직 없음',
        true,
        value ? 'dot-green' : 'dot-gray',
      );
    }
  });

  try {
    const result = await popupFetch('/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=50');
    const count = Array.isArray(result.body?.items) ? result.body.items.length : 0;
    setCardValue('approvedActions', count > 0 ? `${count}개 대기` : '없음', true, count > 0 ? 'dot-orange' : 'dot-gray');
  } catch {
    setCardValue('approvedActions', '조회 실패', true);
  }
}

document.getElementById('btnSync').addEventListener('click', async () => {
  try {
    const tab = await bindActiveTab();
    showResult('동기화 중...');
    chrome.tabs.sendMessage(
      tab.id,
      { action: 'manualSync', environmentId: selectedEnvironmentId },
      (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          showResult(`❌ ${chrome.runtime.lastError?.message || response?.error || '동기화 실패'}`, true);
          return;
        }
        showResult(`✅ ${response.type} ${response.count}개 동기화 완료`);
        setTimeout(initEnvironmentStatus, 1000);
      },
    );
  } catch (error) {
    showResult(`❌ ${error.message}`, true);
  }
});

document.getElementById('btnRunApproved').addEventListener('click', async () => {
  try {
    const tab = await bindActiveTab();
    const result = await popupFetch('/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=20');
    const actions = Array.isArray(result.body?.items) ? result.body.items : [];
    if (actions.length === 0) throw new Error('실행할 승인 액션이 없습니다.');
    chrome.tabs.sendMessage(
      tab.id,
      { action: 'executeApprovedAdActions', payload: { actions } },
      (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          showResult(`❌ ${chrome.runtime.lastError?.message || response?.error || '실행 실패'}`, true);
          return;
        }
        showResult(`✅ ${response.executed || 0}개 실행, ${response.skipped || 0}개 보류`);
      },
    );
  } catch (error) {
    showResult(`❌ ${error.message}`, true);
  }
});

const now = new Date();
document.getElementById('monthInput').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

document.getElementById('btnMonthlySync').addEventListener('click', async () => {
  try {
    const environmentId = requireSelectedEnvironment();
    const [year, month] = document.getElementById('monthInput').value.split('-').map(Number);
    const response = await runtimeMessage({ action: 'monthlyScrape', year, month, environmentId });
    if (!response?.success) throw new Error(response?.error || '수집 시작 실패');
    const progress = document.getElementById('monthlySyncProgress');
    progress.style.display = 'block';
    const key = scopedKey('kiditem_monthly_sync');
    const poll = setInterval(() => {
      chrome.storage.local.get(key, (data) => {
        const state = data[key];
        if (!state) return;
        progress.textContent = state.status === 'running'
          ? `📊 ${state.completed} / ${state.total}일 수집 중...`
          : state.status === 'done'
            ? `✅ ${state.completed}일 동기화 완료`
            : `❌ ${state.error || '수집 실패'}`;
        progress.className = `sync-progress ${state.status === 'done' ? 'done' : state.status === 'error' ? 'error' : ''}`;
        if (['done', 'error'].includes(state.status)) clearInterval(poll);
      });
    }, 1000);
  } catch (error) {
    showResult(`❌ ${error.message}`, true);
  }
});

document.getElementById('btnInventoryScrape').addEventListener('click', async () => {
  try {
    const tab = await bindActiveTab();
    if (!tab.url?.includes('vendor-inventory/list')) {
      throw new Error('Wing 상품목록 페이지를 먼저 열어주세요.');
    }
    chrome.tabs.sendMessage(tab.id, { action: 'scrapeInventoryList' }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        showResult(`❌ ${chrome.runtime.lastError?.message || response?.error || '스크래핑 실패'}`, true);
        return;
      }
      showResult(`✅ ${response.total}개 상품 스크래핑 완료`);
    });
  } catch (error) {
    showResult(`❌ ${error.message}`, true);
  }
});

function openDashboard() {
  try {
    chrome.tabs.create({ url: ENVIRONMENTS[requireSelectedEnvironment()].webOrigin });
  } catch (error) {
    showResult(`❌ ${error.message}`, true);
  }
}

document.getElementById('btnOpen').addEventListener('click', openDashboard);
document.getElementById('footerLink').addEventListener('click', (event) => {
  event.preventDefault();
  openDashboard();
});

document.getElementById('btnRegister').addEventListener('click', async () => {
  try {
    const environment = ENVIRONMENTS[requireSelectedEnvironment()];
    const tabs = await chrome.tabs.query({ url: `${environment.webOrigin}/*` });
    if (tabs.length === 0) {
      chrome.tabs.create({ url: environment.webOrigin });
      showResult('KidItem 탭을 열었습니다. 로그인하면 자동으로 확장을 찾습니다.');
      return;
    }
    showResult(`✅ ${environment.label} KidItem과 연결됨`);
  } catch (error) {
    showResult(`❌ ${error.message}`, true);
  }
});

configureEnvironmentSelector().then((ready) => {
  if (ready) initEnvironmentStatus();
});
