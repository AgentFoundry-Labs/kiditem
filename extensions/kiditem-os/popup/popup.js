const ENVIRONMENTS = Object.freeze({
  local: { label: '로컬', webOrigin: 'http://localhost:3000' },
  office: { label: '사무실', webOrigin: 'http://kiditem-office' },
});

let selectedEnvironmentId = null;
let environmentGeneration = 0;

let statusRefreshSequence = 0;

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

function snapshotEnvironmentRequest() {
  return Object.freeze({
    environmentId: requireSelectedEnvironment(),
    generation: environmentGeneration,
  });
}

function isCurrentEnvironmentRequest(request) {
  return Boolean(
    request &&
      request.generation === environmentGeneration &&
      request.environmentId === selectedEnvironmentId,
  );
}

function isCurrentStatusRefresh(request, sequence) {
  return isCurrentEnvironmentRequest(request) && sequence === statusRefreshSequence;
}

async function popupFetch(path, init = {}, request = snapshotEnvironmentRequest()) {
  const response = await runtimeMessage({
    action: 'kiditemApiRequest',
    environmentId: request.environmentId,
    path,
    init,
  });
  if (!response?.success) throw new Error(response?.error || '서버 요청 실패');
  return response;
}

async function bindActiveTab(request = snapshotEnvironmentRequest()) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('현재 탭을 찾을 수 없습니다.');
  if (!isCurrentEnvironmentRequest(request)) throw new Error('선택한 환경이 변경되었습니다.');
  const result = await runtimeMessage({
    action: 'bindKidItemEnvironment',
    tabId: tab.id,
    environmentId: request.environmentId,
  });
  if (!result?.success) throw new Error(result?.error || '환경 연결 실패');
  if (!isCurrentEnvironmentRequest(request)) throw new Error('선택한 환경이 변경되었습니다.');
  return tab;
}

function setCardValue(id, text, hasDot = false, dotColor = 'dot-gray') {
  const element = document.getElementById(id);
  if (!element) return;
  element.replaceChildren();
  if (hasDot) {
    const dot = document.createElement('span');
    dot.className = `dot ${dotColor}`;
    element.append(dot);
  }
  element.append(document.createTextNode(String(text)));
  element.className = text === '-' || text === '아직 없음' || text === '미수집' ? 'value none' : 'value';
}

function clearEnvironmentStatus() {
  setCardValue('serverStatus', '환경을 선택해주세요.');
  setCardValue('approvedActions', '-', true, 'dot-gray');
  const badge = document.getElementById('connBadge');
  if (badge) {
    badge.textContent = '환경 미선택';
    badge.className = 'badge offline';
  }
}

function showResult(message, error = false) {
  const element = document.getElementById('syncResult');
  element.textContent = message;
  element.className = `sync-result ${error ? 'error' : 'success'}`;
}

async function configureEnvironmentSelector() {
  const setupGeneration = environmentGeneration;
  const result = await runtimeMessage({ action: 'getConnectedKidItemEnvironments' });
  if (setupGeneration !== environmentGeneration) return false;
  const environmentIds = Array.isArray(result?.environmentIds)
    ? result.environmentIds.filter((id) => ENVIRONMENTS[id])
    : [];
  const select = document.getElementById('environmentSelect');
  select.replaceChildren();

  if (environmentIds.length === 0) {
    select.append(new Option('연결된 환경 없음', ''));
    select.disabled = true;
    environmentGeneration += 1;
    selectedEnvironmentId = null;
    clearEnvironmentStatus();
    showResult('로컬, 사무실 또는 스테이징 KidItem에 로그인한 뒤 다시 열어주세요.', true);
    return false;
  }

  select.disabled = false;
  if (environmentIds.length > 1) {
    select.append(new Option('환경 선택', ''));
    environmentGeneration += 1;
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
    environmentGeneration += 1;
    selectedEnvironmentId = select.value || null;
    clearEnvironmentStatus();
    if (!selectedEnvironmentId) {
      return;
    }
    initEnvironmentStatus(snapshotEnvironmentRequest());
  });
  return selectedEnvironmentId !== null;
}

// 승인된 광고 액션은 서버가 승인 때 준비해 둔 실행(advertising.ad_action, prepared)이다(KID-386). 목록 한 쪽(200)이 대기 수의 상한이다.
const AD_ACTION_KIND = 'advertising.ad_action';
const PREPARED_AD_ACTIONS_PATH = `/api/operations?kinds=${AD_ACTION_KIND}&status=prepared&limit=200`;

async function loadApprovedActions(request, sequence) {
  try {
    const result = await popupFetch(PREPARED_AD_ACTIONS_PATH, {}, request);
    if (!isCurrentStatusRefresh(request, sequence)) return;
    if (!result.ok) throw new Error(`HTTP ${result.status}`);
    const count = Array.isArray(result.body?.operations) ? result.body.operations.length : 0;
    const label = count >= 200 ? '200개 이상 대기' : `${count}개 대기`;
    setCardValue('approvedActions', count > 0 ? label : '없음', true, count > 0 ? 'dot-orange' : 'dot-gray');
  } catch {
    if (isCurrentStatusRefresh(request, sequence)) setCardValue('approvedActions', '조회 실패', true, 'dot-red');
  }
}

function preparedRunText(summary) {
  if (!summary?.ok) return { text: `❌ ${summary?.error || '실행 실패'}`, error: true };
  if (!summary.ran) return { text: '❌ 실행할 승인 광고 액션이 없습니다.', error: true };
  if (!summary.uncertain && !summary.failed) {
    return { text: `✅ 광고 액션 ${summary.created}개를 광고센터에 등록했습니다.`, error: false };
  }
  const counts = `${summary.created}개 등록, ${summary.uncertain}개는 광고센터에서 등록 여부 확인 필요, ${summary.failed}개 실패`;
  const reasons = Array.isArray(summary.messages) && summary.messages.length > 0 ? ` ${summary.messages.join(' / ')}` : '';
  return { text: `⚠️ ${counts}.${reasons}`, error: summary.failed > 0 };
}

async function loadEnvironmentConnection(request, sequence) {
  try {
    // Keep the explicit snapshot argument; the route must not fall back to a
    // newer environment selection.
    const status = await popupFetch('/api/ads/extension/status', {}, request);
    if (!isCurrentStatusRefresh(request, sequence)) return;
    if (!status.ok) throw new Error(`HTTP ${status.status}`);
    setCardValue('serverStatus', '연결됨 ✅');
    const badge = document.getElementById('connBadge');
    badge.textContent = ENVIRONMENTS[request.environmentId].label;
    badge.className = 'badge';
  } catch {
    if (!isCurrentStatusRefresh(request, sequence)) return;
    setCardValue('serverStatus', '연결 안됨 ❌');
    const badge = document.getElementById('connBadge');
    badge.textContent = '오프라인';
    badge.className = 'badge offline';
  }
}

function initEnvironmentStatus(request = snapshotEnvironmentRequest()) {
  if (!isCurrentEnvironmentRequest(request)) return;
  const sequence = ++statusRefreshSequence;
  void loadEnvironmentConnection(request, sequence);
  void loadApprovedActions(request, sequence);
}

// 새 런타임이 준비된 실행을 claim해 후보가 없을 때까지 하나씩 돌린다(제 광고센터 탭을 연다). 팝업이 닫혀도 실행은 이어진다.
document.getElementById('btnRunApproved').addEventListener('click', async () => {
  let request;
  try {
    request = snapshotEnvironmentRequest();
    showResult('승인된 광고 액션을 실행하는 중입니다...');
    const summary = await runtimeMessage({
      type: 'runPreparedOperations',
      environmentId: request.environmentId,
      kinds: [AD_ACTION_KIND],
    });
    if (!isCurrentEnvironmentRequest(request)) return;
    const { text, error } = preparedRunText(summary);
    showResult(text, error);
    initEnvironmentStatus(request);
  } catch (error) {
    if (request && !isCurrentEnvironmentRequest(request)) return;
    showResult(`❌ ${error.message}`, true);
  }
});

document.getElementById('btnInventoryScrape').addEventListener('click', async () => {
  let request;
  try {
    request = snapshotEnvironmentRequest();
    const tab = await bindActiveTab(request);
    if (!isCurrentEnvironmentRequest(request)) return;
    if (!tab.url?.includes('vendor-inventory/list')) {
      throw new Error('Wing 상품목록 페이지를 먼저 열어주세요.');
    }
    chrome.tabs.sendMessage(tab.id, { action: 'scrapeInventoryList' }, (response) => {
      if (!isCurrentEnvironmentRequest(request)) return;
      if (chrome.runtime.lastError || !response?.success) {
        showResult(`❌ ${chrome.runtime.lastError?.message || response?.error || '스크래핑 실패'}`, true);
        return;
      }
      showResult(`✅ 엑셀 내보내기 완료 (${response.total || 0}개 상품)`);
    });
  } catch (error) {
    if (request && !isCurrentEnvironmentRequest(request)) return;
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
  let request;
  try {
    request = snapshotEnvironmentRequest();
    const environment = ENVIRONMENTS[request.environmentId];
    const tabs = await chrome.tabs.query({ url: `${environment.webOrigin}/*` });
    if (!isCurrentEnvironmentRequest(request)) return;
    if (tabs.length === 0) {
      chrome.tabs.create({ url: environment.webOrigin });
      showResult('KidItem 탭을 열었습니다. 로그인하면 자동으로 확장을 찾습니다.');
      return;
    }
    showResult(`✅ ${environment.label} KidItem과 연결됨`);
  } catch (error) {
    if (request && !isCurrentEnvironmentRequest(request)) return;
    showResult(`❌ ${error.message}`, true);
  }
});

configureEnvironmentSelector().then((ready) => {
  if (ready) initEnvironmentStatus();
});
