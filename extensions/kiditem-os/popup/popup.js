const ENVIRONMENTS = Object.freeze({
  local: { label: '로컬', webOrigin: 'http://localhost:3000' },
  office: { label: '사무실', webOrigin: 'http://kiditem-office' },
});
const WING_ITEMWINNER_PATH = '/tenants/seller-price-management';

let selectedEnvironmentId = null;
let environmentGeneration = 0;

const OWNER_STATUS_SOURCES = Object.freeze([
  {
    key: 'traffic',
    path: '/api/ads/traffic/source',
    valueId: 'trafficSync',
    detailId: 'trafficSyncDetail',
    countField: 'rowCount',
    countUnit: '행',
  },
  {
    key: 'itemwinner',
    path: '/api/ads/wing-itemwinner/source',
    valueId: 'winnerSync',
    detailId: 'winnerSyncDetail',
    countField: 'itemCount',
    countUnit: '개',
  },
  {
    key: 'campaigns',
    path: '/api/ads/ad-campaigns/source',
    valueId: 'adsSync',
    detailId: 'adsSyncDetail',
    countField: 'campaignCount',
    countUnit: '캠페인',
  },
  {
    key: 'accountDaily',
    path: '/api/ads/account-daily-kpis/source',
    valueId: 'accountDailySync',
    detailId: 'accountDailySyncDetail',
    countField: 'receiptCount',
    countUnit: '일',
  },
]);

/** Ready, or collected once but behind, or never collected. */
function sourceReadinessLabel(source) {
  if (!source || typeof source.ready !== 'boolean') return '상태 확인 필요';
  if (source.ready) return '준비됨';
  return source.latestComplete ? '오래됨' : '자료 없음';
}

let monthlyPollTimer = null;
let monthlyPollRequest = null;
let monthlyPollInFlightRequest = null;
let monthlyAdmissionRequest = null;
let monthlyAdmissionInFlight = false;
let ownerStatusRefreshSequence = 0;

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
  return isCurrentEnvironmentRequest(request) && sequence === ownerStatusRefreshSequence;
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

function popupSourceOwnerRoute(value) {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new Error('현재 탭 URL을 확인할 수 없습니다.');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('현재 탭 URL이 유효하지 않습니다.');
  }

  if (
    url.protocol === 'https:' &&
    url.hostname.toLowerCase() === 'wing.coupang.com' &&
    /business-insight\/sales-analysis/i.test(url.pathname)
  ) {
    const startDate = url.searchParams.get('start_date') || url.searchParams.get('startDate');
    const endDate = url.searchParams.get('end_date') || url.searchParams.get('endDate');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) {
      throw new Error('Wing 매출분석 displayed 날짜 범위를 먼저 선택해주세요.');
    }
    return { action: 'collectAdvertisingWingTrafficFromPopup', url: value };
  }

  if (
    url.protocol === 'https:' &&
    url.hostname.toLowerCase() === 'wing.coupang.com' &&
    url.pathname === WING_ITEMWINNER_PATH
  ) {
    return { action: 'collectAdvertisingWingItemwinnerFromPopup', url: value };
  }

  if (
    url.protocol === 'https:' &&
    url.hostname.toLowerCase() === 'advertising.coupang.com' &&
    /\/marketing\/dashboard\/sales/i.test(url.pathname)
  ) {
    return { action: 'collectAdvertisingCampaignsFromPopup', url: value };
  }

  throw new Error('현재 탭은 source owner 수집 대상 페이지가 아닙니다.');
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
  element.className = text === '-' || text === '아직 없음' || text === '자료 없음' ? 'value none' : 'value';
}

function setCardDetail(id, lines) {
  const element = document.getElementById(id);
  if (!element) return;
  element.replaceChildren(document.createTextNode(Array.isArray(lines) ? lines.join('\n') : String(lines || '')));
}

function clearOwnerStatusCards() {
  for (const source of OWNER_STATUS_SOURCES) {
    setCardValue(source.valueId, '-', true, 'dot-gray');
    setCardDetail(source.detailId, '');
  }
}

function clearEnvironmentStatus() {
  stopMonthlyPoll();
  cancelMonthlyAdmission();
  setCardValue('serverStatus', '환경을 선택해주세요.');
  setCardValue('approvedActions', '-', true, 'dot-gray');
  clearOwnerStatusCards();
  const progress = document.getElementById('monthlySyncProgress');
  if (progress) {
    progress.textContent = '';
    progress.style.display = 'none';
    progress.className = 'sync-progress';
  }
  const badge = document.getElementById('connBadge');
  if (badge) {
    badge.textContent = '환경 미선택';
    badge.className = 'badge offline';
  }
}

function kstDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function displaySourceCutoff(source) {
  const value = source?.latestComplete?.actualCutoffAt || source?.actualCutoffAt;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = kstDateParts(date);
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} KST`;
  } catch {
    return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  }
}

function displaySourceCount(source, definition) {
  const value = source?.latestComplete?.[definition.countField];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return `${value.toLocaleString('ko-KR')}${definition.countUnit}`;
}

function displaySourceFailure(attempt) {
  const code = typeof attempt?.errorCode === 'string' && attempt.errorCode
    ? attempt.errorCode.slice(0, 100)
    : '수집 실패';
  const message = typeof attempt?.errorMessage === 'string' && attempt.errorMessage
    ? attempt.errorMessage.slice(0, 300)
    : '';
  return message ? `${code}: ${message}` : code;
}

function renderOwnerStatus(definition, source) {
  const attempt = source?.latestAttempt;
  const state = attempt?.state;
  const failed = state === 'FAILED';
  const running = !failed && (state === 'RUNNING' || source?.refreshing === true);
  const unexpectedTerminal = Boolean(
    state && !['RUNNING', 'COMPLETE', 'FAILED'].includes(state),
  );
  const statusLabel = unexpectedTerminal
    ? '최근 상태 확인 필요'
    : failed
    ? '최근 실패'
    : running
      ? '수집 중'
      : sourceReadinessLabel(source);
  const dotColor = failed
    ? 'dot-red'
    : running || (source?.ready === false && source?.latestComplete)
      ? 'dot-orange'
      : source?.ready === true
        ? 'dot-green'
        : 'dot-gray';
  setCardValue(definition.valueId, statusLabel, true, dotColor);

  const details = [];
  if (unexpectedTerminal) details.push('현재 상태: 완료 여부 확인 필요');
  if (failed) details.push(`현재 실패: ${displaySourceFailure(attempt)}`);
  if (running) details.push('현재 실행 중: 아직 완료되지 않음');

  if (source?.latestComplete) {
    const count = displaySourceCount(source, definition) || '건수 확인 중';
    const cutoff = displaySourceCutoff(source);
    details.push(`최근 완료: ${count}${cutoff ? ` · 기준 ${cutoff}` : ''}`);
  } else {
    details.push('최근 완료: 없음');
  }
  setCardDetail(definition.detailId, details);
}

function renderOwnerStatusFailure(definition) {
  setCardValue(definition.valueId, '조회 실패', true, 'dot-red');
  setCardDetail(definition.detailId, '현재 서버 상태를 불러오지 못했습니다.');
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

async function loadOwnerStatus(definition, request, sequence) {
  try {
    const result = await popupFetch(definition.path, {}, request);
    if (!isCurrentStatusRefresh(request, sequence)) return;
    if (!result.ok || !result.body || typeof result.body !== 'object') {
      throw new Error(`HTTP ${result.status || '응답 오류'}`);
    }
    renderOwnerStatus(definition, result.body);
  } catch {
    if (isCurrentStatusRefresh(request, sequence)) renderOwnerStatusFailure(definition);
  }
}

async function loadApprovedActions(request, sequence) {
  try {
    const result = await popupFetch('/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=50', {}, request);
    if (!isCurrentStatusRefresh(request, sequence)) return;
    if (!result.ok) throw new Error(`HTTP ${result.status}`);
    const count = Array.isArray(result.body?.items) ? result.body.items.length : 0;
    setCardValue('approvedActions', count > 0 ? `${count}개 대기` : '없음', true, count > 0 ? 'dot-orange' : 'dot-gray');
  } catch {
    if (isCurrentStatusRefresh(request, sequence)) setCardValue('approvedActions', '조회 실패', true, 'dot-red');
  }
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
  const sequence = ++ownerStatusRefreshSequence;
  void loadEnvironmentConnection(request, sequence);
  for (const definition of OWNER_STATUS_SOURCES) void loadOwnerStatus(definition, request, sequence);
  void loadApprovedActions(request, sequence);
}

function stopMonthlyPoll() {
  if (monthlyPollTimer !== null) {
    clearInterval(monthlyPollTimer);
    monthlyPollTimer = null;
  }
  monthlyPollRequest = null;
}

function cancelMonthlyAdmission() {
  monthlyAdmissionRequest = null;
  monthlyAdmissionInFlight = false;
  const button = document.getElementById('btnMonthlySync');
  if (button) button.disabled = false;
}

function monthlyProgress(text, state = '') {
  const progress = document.getElementById('monthlySyncProgress');
  if (!progress) return;
  progress.style.display = 'block';
  progress.textContent = text;
  progress.className = `sync-progress${state ? ` ${state}` : ''}`;
}

function monthlyAttemptDays(attempt) {
  const expectedDates = attempt?.plan?.expectedDates;
  return Array.isArray(expectedDates) && expectedDates.length > 0 ? expectedDates.length : null;
}

async function pollMonthlyAttempt(attemptId, request) {
  if (
    monthlyPollInFlightRequest === request ||
    monthlyPollRequest !== request ||
    !isCurrentEnvironmentRequest(request)
  ) return;
  monthlyPollInFlightRequest = request;
  try {
    const result = await popupFetch(
      `/api/ads/traffic/attempts/${encodeURIComponent(attemptId)}`,
      {},
      request,
    );
    if (
      monthlyPollRequest !== request ||
      !isCurrentEnvironmentRequest(request)
    ) return;
    if (!result.ok || !result.body || typeof result.body !== 'object') {
      throw new Error(`HTTP ${result.status || '응답 오류'}`);
    }
    const attempt = result.body;
    if (attempt.attemptId !== attemptId) {
      throw new Error('owner 상태 응답이 요청한 attempt와 일치하지 않습니다.');
    }
    const days = monthlyAttemptDays(attempt);
    if (attempt.state === 'RUNNING') {
      monthlyProgress(days ? `📊 ${days}일 범위 owner 수집 중...` : '📊 owner 수집 중...');
      return;
    }
    if (attempt.state === 'COMPLETE') {
      monthlyProgress(days ? `✅ ${days}일 owner 수집 완료` : '✅ owner 수집 완료', 'done');
      stopMonthlyPoll();
      initEnvironmentStatus(request);
      return;
    }
    if (attempt.state === 'FAILED') {
      const code = typeof attempt.errorCode === 'string' ? attempt.errorCode : '';
      const message = typeof attempt.errorMessage === 'string' ? attempt.errorMessage : '';
      monthlyProgress(`❌ ${message || code || 'owner 수집 실패'}`, 'error');
      stopMonthlyPoll();
      initEnvironmentStatus(request);
      return;
    }
    throw new Error('owner 상태를 확인할 수 없습니다.');
  } catch (error) {
    if (
      monthlyPollRequest === request &&
      isCurrentEnvironmentRequest(request)
    ) {
      monthlyProgress(`❌ ${error.message || 'owner 상태 조회 실패'}`, 'error');
      stopMonthlyPoll();
    }
  } finally {
    if (monthlyPollInFlightRequest === request) monthlyPollInFlightRequest = null;
  }
}

document.getElementById('btnSync').addEventListener('click', async () => {
  let request;
  try {
    request = snapshotEnvironmentRequest();
    const tab = await bindActiveTab(request);
    if (!isCurrentEnvironmentRequest(request)) return;
    const route = popupSourceOwnerRoute(tab.url);
    showResult('동기화 중...');
    const response = await runtimeMessage({
      ...route,
      environmentId: request.environmentId,
    });
    if (!isCurrentEnvironmentRequest(request)) return;
    if (!response?.success || response.terminalState !== 'COMPLETE') {
      throw new Error(response?.error || response?.errorCode || 'source owner 동기화 실패');
    }
    showResult(`✅ source owner 동기화 완료 (${response.attemptId || '완료'})`);
    setTimeout(() => {
      if (isCurrentEnvironmentRequest(request)) initEnvironmentStatus(request);
    }, 1000);
  } catch (error) {
    if (request && !isCurrentEnvironmentRequest(request)) return;
    showResult(`❌ ${error.message}`, true);
  }
});

document.getElementById('btnRunApproved').addEventListener('click', async () => {
  let request;
  try {
    request = snapshotEnvironmentRequest();
    const tab = await bindActiveTab(request);
    if (!isCurrentEnvironmentRequest(request)) return;
    const result = await popupFetch('/api/ads/actions?approvalStatus=approved&executeStatus=queued&limit=20', {}, request);
    if (!isCurrentEnvironmentRequest(request)) return;
    if (!result.ok) throw new Error(`HTTP ${result.status}`);
    const actions = Array.isArray(result.body?.items) ? result.body.items : [];
    if (actions.length === 0) throw new Error('실행할 승인 액션이 없습니다.');
    chrome.tabs.sendMessage(
      tab.id,
      { action: 'executeApprovedAdActions', payload: { actions } },
      (response) => {
        if (!isCurrentEnvironmentRequest(request)) return;
        if (chrome.runtime.lastError || !response?.success) {
          showResult(`❌ ${chrome.runtime.lastError?.message || response?.error || '실행 실패'}`, true);
          return;
        }
        showResult(`✅ ${response.executed || 0}개 실행, ${response.skipped || 0}개 보류`);
      },
    );
  } catch (error) {
    if (request && !isCurrentEnvironmentRequest(request)) return;
    showResult(`❌ ${error.message}`, true);
  }
});

const now = new Date();
try {
  const monthParts = kstDateParts(now);
  document.getElementById('monthInput').value = `${monthParts.year}-${monthParts.month}`;
} catch {
  document.getElementById('monthInput').value = now.toISOString().slice(0, 7);
}

document.getElementById('btnMonthlySync').addEventListener('click', async () => {
  if (monthlyAdmissionInFlight) return;
  let request;
  const button = document.getElementById('btnMonthlySync');
  try {
    stopMonthlyPoll();
    request = snapshotEnvironmentRequest();
    monthlyAdmissionRequest = request;
    monthlyAdmissionInFlight = true;
    button.disabled = true;
    const [year, month] = document.getElementById('monthInput').value.split('-').map(Number);
    const response = await runtimeMessage({ action: 'monthlyScrape', year, month, environmentId: request.environmentId });
    if (!isCurrentEnvironmentRequest(request)) return;
    if (!response?.success) throw new Error(response?.error || '수집 시작 실패');
    if (
      typeof response.attemptId !== 'string' ||
      !response.attemptId ||
      !['RUNNING', 'COMPLETE', 'FAILED'].includes(response.terminalState)
    ) {
      throw new Error('owner 수집 승인 응답이 유효하지 않습니다.');
    }
    monthlyPollRequest = request;
    monthlyProgress(response.terminalState === 'RUNNING' ? '📊 owner 수집 승인됨. 상태 확인 중...' : '📊 owner 상태 확인 중...');
    await pollMonthlyAttempt(response.attemptId, request);
    if (
      monthlyPollRequest === request &&
      isCurrentEnvironmentRequest(request)
    ) {
      monthlyPollTimer = setInterval(() => {
        void pollMonthlyAttempt(response.attemptId, request);
      }, 1000);
    }
  } catch (error) {
    if (request && !isCurrentEnvironmentRequest(request)) return;
    showResult(`❌ ${error.message}`, true);
  } finally {
    if (monthlyAdmissionRequest === request) {
      monthlyAdmissionRequest = null;
      monthlyAdmissionInFlight = false;
      if (isCurrentEnvironmentRequest(request)) button.disabled = false;
    }
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
