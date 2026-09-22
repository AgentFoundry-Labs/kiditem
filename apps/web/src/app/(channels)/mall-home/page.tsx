'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Target } from 'lucide-react';
import { useMallAgentLoop } from '@/hooks/use-mall-agent-loop';
import { formatNumber } from '@/lib/utils';
import { useMallLoginTest } from '../../(orders)/mall-settings/hooks/use-mall-login-test';
import { AgentPipeline } from './components/AgentPipeline';
import { MallAgentCostCard } from './components/MallAgentCostCard';
import { MallAgentLoopControls } from './components/MallAgentLoopControls';
import { MallAlertPanel } from './components/MallAlertPanel';
import { MallHomeStats } from './components/MallHomeStats';
import { MallStatusBoard } from './components/MallStatusBoard';
import { PrinciplesSection } from './components/PrinciplesSection';
import { useMallAlerts } from './hooks/use-mall-alerts';
import { buildAgentPipeline } from './lib/agent-pipeline';
import { needsAttention, type MallAlertFilter, type MallStatusTile } from './lib/mall-alerts';
import { buildMallAgentMissions } from './lib/mall-agent-missions';

/**
 * 쇼핑몰 홈 — 쇼핑몰 에이전트의 대시보드.
 *
 * 위 줄은 대시보드 3 : 쇼핑몰 알림판 1 이다. 왼쪽은 지금 볼 것 네 칸과 몰별 상태이고, 오른쪽
 * 알림판은 그 줄 높이까지만 선다 — 몰별 상태 아래로 내려가지 않는다. 그 아래 넓게 에이전트
 * 파이프라인(미션 → 감지 → 판단 → 도구 → 사람 승인 → 기억)이 서고, 단계마다 그 단계의 일이
 * 아래로 적힌다. 미션은 파이프라인 첫 칸이다.
 *
 * 로그인 상태는 '로그인 확인'을 누를 때 확장이 몰마다 확인해 몰별 상태에 붙인다 — 화면을 열었다고 묻지 않고
 * (사장님 2026-09-19), 로그인은 하지 않는다. 풀린 몰은 빨갛게 서고, 알림판과 위 칸이 '로그인 필요'를 말한다.
 * 풀린 몰 타일을 누르면 그때만 쇼핑몰 계정의 로그인 테스트와 같은 길로 그 몰에 로그인을 다시 해 보고, 끝나면
 * 그 몰만 다시 확인한다. 쇼핑몰 에이전트의 이번 달 AI 비용은 알림판 위에 작게, 자동 운전 스위치는 머리에 선다(에이전트 홈 ·
 * 자동 운전 카드 대신, 사장님 2026-09-19).
 *
 * 몰 판정과 숫자는 쇼핑몰 현황과 같은 곳(`useMallCapabilityRows`)에서, 알림은 전역 알림판과
 * 같은 스트림에서 몰 일만 골라 읽는다 — 화면마다 다른 말을 하지 않게. 머리글의 한 줄도
 * 받은 숫자로만 적는다.
 */
export default function MallHomePage() {
  const home = useMallAlerts();
  // 자동 운전 고리 — 앱이 열려 있는 동안 어느 화면에서든 돈다. 여기서는 상태만 보여 준다.
  const loop = useMallAgentLoop();
  const [filter, setFilter] = useState<MallAlertFilter>('all');
  const [mallKey, setMallKey] = useState<string | null>(null);
  const loginTest = useMallLoginTest();
  const missions = useMemo(
    () => buildMallAgentMissions(home.overview ? home.totals : null),
    [home.overview, home.totals],
  );
  const serverAttention = useMemo(() => home.alerts.filter(needsAttention).length, [home.alerts]);
  // 로그인 상태는 다 확인한 뒤의 숫자만 파이프라인에 적는다.
  const sessionCounts = home.session.status === 'done' ? home.session.counts : null;
  const pipeline = useMemo(
    () =>
      buildAgentPipeline({
        missions,
        alerts: home.alertsReady ? { total: home.alerts.length, attention: serverAttention } : null,
        noLoginCount: home.noLoginCount,
        sessions: sessionCounts,
        soldOutTotal: home.soldOutTotal,
        coupangPendingAccept: home.coupangPendingAccept,
        openAlertCount: home.openAlertCount,
        totals: home.overview ? home.totals : null,
      }),
    [
      missions,
      home.alertsReady,
      home.alerts.length,
      serverAttention,
      home.noLoginCount,
      sessionCounts,
      home.soldOutTotal,
      home.coupangPendingAccept,
      home.openAlertCount,
      home.overview,
      home.totals,
    ],
  );
  const selected = mallKey ? (home.tiles.find((tile) => tile.mallKey === mallKey) ?? null) : null;
  // 머리글 한 줄 — 받은 숫자만. 몰 목록을 못 받았으면 숫자를 지어내지 않는다.
  const headline = home.overview
    ? `연결된 몰 ${formatNumber(home.tiles.length)}곳 · 확인 필요 ${formatNumber(home.counts.attention)}건`
    : '몰 목록을 불러오는 중입니다.';

  // 위 칸으로 거르면 몰 거르기는 푼다. 몰을 고르면 그 몰 알림을 다 본다.
  const filterAlerts = (next: MallAlertFilter) => {
    setFilter(next);
    setMallKey(null);
  };
  const selectMall = (next: string | null) => {
    setMallKey(next);
    if (next) setFilter('all');
  };
  // 한 번에 한 몰만. 결과(로그인됨 · 비밀번호 거부 · 인증 필요)는 로그인 테스트가 알리고 기록한다.
  const retryLogin = (tile: MallStatusTile) => {
    if (loginTest.testingKey) return;
    void loginTest.test(tile.mallKey, tile.mallName).then(() => home.session.recheck());
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Target size={20} />
          </div>
          <div>
            <h1 className="page-title">쇼핑몰 에이전트</h1>
            <p className="mt-0.5 text-sm text-slate-500">{headline}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <MallAgentLoopControls loop={loop} />
          <Link
            href="/mall-channels"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            쇼핑몰 현황
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="min-w-0 space-y-4 xl:col-span-3">
          <MallHomeStats
            attention={home.counts.attention}
            openAlerts={home.openAlertCount}
            loginNeeded={home.loginNeeded}
            soldOut={home.soldOutTotal}
            noRecipe={home.noRecipeCount}
            onFilter={filterAlerts}
          />
          <MallStatusBoard
            tiles={home.tiles}
            hasOverview={Boolean(home.overview)}
            selectedMallKey={mallKey}
            onSelect={selectMall}
            session={home.session}
            loggingInKey={loginTest.testingKey}
            onRetryLogin={retryLogin}
          />
        </div>
        {/* 오른쪽 칸: 위 줄(확인 필요 · 열린 몰 알림)에 맞춰 AI 비용을 작게, 그 아래 알림판이 남은 높이를 채운다. */}
        <div className="order-first flex min-w-0 flex-col gap-4 xl:order-none xl:col-span-1">
          <MallAgentCostCard />
          <MallAlertPanel
            alerts={home.alerts}
            derived={home.derived}
            ready={home.alertsReady}
            filter={filter}
            onFilterChange={setFilter}
            mall={selected ? { key: selected.mallKey, name: selected.mallName } : null}
            onClearMall={() => setMallKey(null)}
            className="flex-1"
          />
        </div>
      </div>

      <AgentPipeline stages={pipeline} missions={missions} />
      <PrinciplesSection />
    </div>
  );
}
