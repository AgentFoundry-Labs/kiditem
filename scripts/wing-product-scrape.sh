#!/usr/bin/env bash
# Wing 매출분석 전체 상품 스크래퍼 (Playwriter 기반)
#
# 사용법:
#   ./scripts/wing-product-scrape.sh 2026-04        # 4월 전체 (일별)
#   ./scripts/wing-product-scrape.sh 2026-04-14     # 4월 14일 하루
#   ./scripts/wing-product-scrape.sh                # 이번 달
#
# 전제조건:
#   - Chrome에서 wing.coupang.com 탭이 열려있고 로그인 상태
#   - Chrome DevTools Protocol 활성화 필요
#     방법: chrome://inspect/#remote-debugging 접속 OR
#           Chrome 설정 → 기타 도구 → 개발자 도구 → 원격 디버깅 허용

set -e

TARGET="${1:-$(date +%Y-%m)}"

echo "=== Wing 상품 매출 전체 수집 (Playwriter) ==="
echo "대상: ${TARGET}"
echo ""

# Playwriter 세션 생성
echo "Playwriter 세션 연결 중..."
SESSION=$(playwriter session new --direct 2>&1 | grep -oE 'Session [0-9]+' | grep -oE '[0-9]+')
if [ -z "$SESSION" ]; then
  echo "오류: Chrome DevTools Protocol 연결 실패"
  echo "Chrome에서 wing.coupang.com이 열려있는지 확인하세요"
  exit 1
fi
echo "세션: ${SESSION}"

# 1단계: target 날짜를 state에 저장
playwriter -s "$SESSION" -e "state.wingTarget = '${TARGET}'; console.log('target set:', state.wingTarget)"

# 2단계: 메인 스크래퍼 실행 (월별 최대 10분 타임아웃)
playwriter -s "$SESSION" --timeout 600000 -e "$(cat <<'JSEOF'
// ──────────────────────────────────────────────
// Wing 매출분석 전체 상품 스크래퍼
// state.wingTarget = 'YYYY-MM' or 'YYYY-MM-DD'
// ──────────────────────────────────────────────

const TARGET = state.wingTarget || new Date().toISOString().slice(0, 7);
const API_URL = 'http://localhost:4000';

// Wing 탭 찾기
const allPages = context.pages();
let wingPage = allPages.find(p => p.url().includes('wing.coupang.com'));
if (!wingPage) {
  console.error('오류: Chrome에서 wing.coupang.com 탭이 열려있어야 합니다');
  return;
}
state.wingPage = wingPage;
console.log('Wing 탭 연결:', wingPage.url().substring(0, 80));

// ─── 날짜 목록 생성 ───
function getDateList(t) {
  if (/^\d{4}-\d{2}$/.test(t)) {
    const [y, m] = t.split('-').map(Number);
    const today = new Date();
    const lastDay = new Date(y, m, 0).getDate();
    const maxDay = (y === today.getFullYear() && m === today.getMonth() + 1)
      ? Math.min(today.getDate(), lastDay) : lastDay;
    const list = [];
    for (let d = 1; d <= maxDay; d++)
      list.push(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    return list;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return [t];
  return [new Date().toISOString().slice(0, 10)];
}

// ─── 현재 페이지 상품 추출 (페이지 컨텍스트에서 실행) ───
async function extractPageProducts() {
  return state.wingPage.evaluate(() => {
    const H = 3, C = 11;
    function pkn(s) {
      if (!s) return 0;
      const t = String(s).trim();
      const e = t.match(/([\d,.]+)\s*억/);
      if (e) {
        const b = parseFloat(e[1].replace(/,/g,''))||0;
        const m2 = t.match(/억\s*([\d,.]+)\s*만/);
        return Math.round(b*1e8 + (m2 ? parseFloat(m2[1].replace(/,/g,''))*1e4 : 0));
      }
      const m = t.match(/([\d,.]+)\s*만/);
      if (m) return Math.round((parseFloat(m[1].replace(/,/g,''))||0)*1e4);
      return parseFloat(t.replace(/[^\d.-]/g,''))||0;
    }
    function ps(cell, isPct) {
      if (!cell) return {value:0};
      const v = cell.querySelector('[class*="value_"]');
      const b = cell.querySelector('[class*="badge_"]');
      const raw = v ? v.textContent.trim() : '';
      return { value: isPct ? (parseFloat(raw.replace(/[^\d.]/g,''))||0) : pkn(raw) };
    }

    const c = document.querySelector('[class*="container_1pewv"]');
    if (!c || c.children.length <= H) return [];
    const ch = c.children;
    const count = Math.min(Math.floor((ch.length - H) / C), 500);
    const out = [];

    for (let p = 0; p < count; p++) {
      const o = H + p * C;
      const cell = ch[o + 1];
      if (!cell) continue;

      let name = '', invId = '', optId = '', adStatus = '';
      for (const sp of cell.querySelectorAll('span')) {
        const t = sp.textContent.trim();
        if (!t) continue;
        const im = t.match(/Inventory\s*ID:\s*(\d+)/);
        if (im) { invId = im[1]; const om = t.match(/Option\s*ID:\s*(\d+)/); if (om) optId=om[1]; continue; }
        if (t.startsWith('Category:') || t==='Fulfilled by Seller' || t==='Fulfilled by Coupang' || t==='로켓배송') continue;
        if (t.includes('광고 운영')) { adStatus='running'; continue; }
        if (t.includes('광고 중지')) { adStatus='paused'; continue; }
        if (!name && t.length > 5) name = t.substring(0, 100);
      }

      let vid = optId;
      const ac = ch[o+9];
      if (ac) { const lnk = ac.querySelector('a'); if (lnk) { const vm = (lnk.getAttribute('href')||'').match(/vendorItemId=(\d+)/); if (vm) vid=vm[1]; } }

      const vis = ps(ch[o+2],false), pv = ps(ch[o+3],false), ca = ps(ch[o+4],false);
      const ord = ps(ch[o+5],false), us = ps(ch[o+6],false), gmv = ps(ch[o+7],false), cv = ps(ch[o+8],true);

      if (vis.value>0 || ord.value>0 || gmv.value>0) {
        out.push({ productName:name, inventoryId:invId, optionId:optId,
          vendorItemId:vid||optId, productId:invId, adStatus,
          visitors:vis.value, views:pv.value, cartAdds:ca.value,
          orders:ord.value, salesQty:us.value, revenue:gmv.value, conversionRate:cv.value });
      }
    }
    return out;
  });
}

// ─── KPI 카드 추출 ───
async function extractKpis() {
  return state.wingPage.evaluate(() => {
    const kpis = {};
    function pkn(s) {
      if (!s) return 0;
      const t=String(s).trim();
      const e=t.match(/([\d,.]+)\s*억/); if(e) return Math.round((parseFloat(e[1].replace(/,/g,''))||0)*1e8);
      const m=t.match(/([\d,.]+)\s*만/); if(m) return Math.round((parseFloat(m[1].replace(/,/g,''))||0)*1e4);
      return parseFloat(t.replace(/[^\d.-]/g,''))||0;
    }
    const conv = document.querySelector('[data-testid="conversion-stats-card"]');
    if (conv) {
      const items = conv.querySelectorAll('[class*="stat-item"]');
      ['visitor','pageView','addToCart','order','conversion'].forEach((l,i) => {
        const it=items[i]; if(!it) return;
        const v=it.querySelector('[class*="value_"]'), b=it.querySelector('[class*="badge_"]');
        const raw=v?v.textContent.trim():'';
        kpis[l]={value:raw,numValue:pkn(raw),change:b?b.textContent.trim():''};
      });
    }
    const sales = document.querySelector('[data-testid="sales-stats-card"]');
    if (sales) {
      const items = sales.querySelectorAll('[class*="stat-item"]');
      ['unitSold','sales'].forEach((l,i) => {
        const it=items[i]; if(!it) return;
        const v=it.querySelector('[class*="value_"]'), b=it.querySelector('[class*="badge_"]');
        const raw=v?v.textContent.trim():'';
        kpis[l]={value:raw,numValue:pkn(raw),change:b?b.textContent.trim():''};
      });
    }
    return kpis;
  });
}

// ─── 전체 페이지 수 파악 ───
async function getTotalPages() {
  return state.wingPage.evaluate(() => {
    const allAs = document.querySelectorAll('a');
    const nums = Array.from(allAs).filter(a => /^\d+$/.test(a.textContent.trim()) && parseInt(a.textContent.trim()) <= 200);
    return nums.length ? Math.max(...nums.map(a=>parseInt(a.textContent.trim()))) : 1;
  });
}

// ─── 다음 페이지 화살표 클릭 ───
async function clickNextPage() {
  return state.wingPage.evaluate(() => {
    const allAs = document.querySelectorAll('a');
    const nums = Array.from(allAs).filter(a => /^\d+$/.test(a.textContent.trim()) && parseInt(a.textContent.trim()) <= 200);
    if (!nums.length) return false;
    const pDiv = nums[0].parentElement?.parentElement;
    if (!pDiv) return false;
    const spans = Array.from(pDiv.children);
    // 텍스트 없는 <a> = prev/next 화살표
    const arrows = spans.filter(s => { const a=s.querySelector('a'); return a&&!a.textContent.trim(); });
    const nextArrow = arrows[arrows.length-1];
    if (!nextArrow) return false;
    nextArrow.querySelector('a').click();
    return true;
  });
}

// ─── 그리드 변경 감지 (첫 상품명 변경 확인) ───
async function waitForGridChange(prevFirst) {
  for (let i = 0; i < 20; i++) {
    await state.wingPage.waitForTimeout(300);
    const cur = await state.wingPage.evaluate(() => {
      const c = document.querySelector('[class*="container_1pewv"]');
      if (!c || c.children.length <= 3) return '';
      return c.children[4]?.textContent?.trim()?.substring(0,30) || '';
    });
    if (cur !== prevFirst && cur !== '') return;
  }
  // 타임아웃 — 일단 진행
}

// ─── 하루치 전체 페이지 수집 ───
async function scrapeDayAllPages(date) {
  const url = `https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=${date}&end_date=${date}`;
  await state.wingPage.goto(url);
  await state.wingPage.waitForTimeout(4500);

  const totalPages = await getTotalPages();
  console.log(`  ${date}: ${totalPages}페이지`);

  const allProducts = [];

  for (let pg = 1; pg <= totalPages; pg++) {
    if (pg > 1) {
      const prevFirst = await state.wingPage.evaluate(() => {
        const c = document.querySelector('[class*="container_1pewv"]');
        return c?.children[4]?.textContent?.trim()?.substring(0,30) || '';
      });
      await clickNextPage();
      await waitForGridChange(prevFirst);
    }

    const products = await extractPageProducts();
    allProducts.push(...products);
    console.log(`    페이지 ${pg}/${totalPages}: ${products.length}개 (누적 ${allProducts.length}개)`);
  }

  return allProducts;
}

// ─── 메인 실행 ───
const dates = getDateList(TARGET);
console.log(`\n수집 날짜: ${dates[0]} ~ ${dates[dates.length-1]} (${dates.length}일)\n`);

let totalSynced = 0;
const errors = [];

for (let di = 0; di < dates.length; di++) {
  const date = dates[di];
  try {
    console.log(`\n[${di+1}/${dates.length}] ${date} 수집 중...`);

    const products = await scrapeDayAllPages(date);
    if (products.length === 0) {
      console.log(`  → 데이터 없음`);
      continue;
    }

    const kpis = await extractKpis();
    const summary = {
      visitors: kpis.visitor?.numValue||0,
      views: kpis.pageView?.numValue||0,
      cartAdds: kpis.addToCart?.numValue||0,
      orders: kpis.order?.numValue||0,
      salesQty: kpis.unitSold?.numValue||0,
      revenue: kpis.sales?.numValue||0,
    };

    const payload = {
      type: 'traffic',
      data: products.map(p => ({
        productId: p.inventoryId || p.vendorItemId,
        visitors: p.visitors, views: p.views, cartAdds: p.cartAdds,
        orders: p.orders, salesQty: p.salesQty, revenue: p.revenue,
        conversionRate: p.conversionRate,
      })),
      summary,
      period: 1,
      startDate: date,
      endDate: date,
      timestamp: new Date().toISOString(),
      url: `https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=${date}&end_date=${date}`,
    };

    const res = await fetch(`${API_URL}/api/ads/extension/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    if (json.success) {
      console.log(`  → ✅ ${json.upserted || products.length}개 동기화 완료`);
      totalSynced += products.length;
    } else {
      console.log(`  → ❌ 실패: ${json.error || json.message}`);
      errors.push({ date, error: json.error || json.message });
    }

    if (di < dates.length - 1) await state.wingPage.waitForTimeout(1500);

  } catch (err) {
    console.error(`  → 오류 (${date}): ${err.message}`);
    errors.push({ date, error: err.message });
  }
}

console.log(`\n${'='.repeat(40)}`);
console.log(`수집 완료: ${totalSynced}개 상품 데이터 동기화`);
if (errors.length > 0) {
  console.log(`실패 ${errors.length}건:`);
  errors.forEach(e => console.log(`  - ${e.date}: ${e.error}`));
}
JSEOF
)"

echo ""
echo "완료."
