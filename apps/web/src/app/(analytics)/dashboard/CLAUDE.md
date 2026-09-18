Before working in this directory, always read this document first rather than relying on memory.

# web/dashboard - Operational Read Models

`dashboard/` owns the landing dashboard: a read-only summary of sales, ads, and
what each agent is doing. It is deliberately simple (owner decision
2026-09-18) — each fact appears once, and anything that repeated another panel
was removed.

## Composition

- Header: identity, catalog counts, and the period control (월 · 주 · 일 · 기간).
  The period governs everything below it, so it sits above all of it.
- Headline cards: 매출 (월 매출 · 월 순이익 · 오늘 매출 · 광고비율) and 광고 (ROAS ·
  CTR · 광고 전환매출 · 광고비) — the first dashboard's two KPI rows. They render
  values the page resolves from the server read models; they compute nothing.
- 매출 추이: one line chart. By default 총 매출 · 쿠팡 · 쿠팡 외 몰; a settings panel
  lets the operator add up to three non-Coupang malls as their own lines, and
  the choice is remembered in this browser only. Lines, not stacks — the
  series overlap in meaning, so stacking would count revenue twice.
- Top 상품.
- Right column: agent status (에이전트 | 지금 진행 중인 일, in the sidebar's
  order), 긴급 (links straight to the screen that handles each item), and 방금.

There is no collection control on this page. Collections start from their
owner screens; failures reach the operator through 긴급.

## State Rules

- Use `queryKeys.dashboard.*` for dashboard read models.
- Prefer `apiClient.getParsed()` with shared schemas for dashboard endpoints.
- Filter state is local UI state; aggregation and calculations stay backend
  read-model responsibility. Revenue split by Coupang / non-Coupang and the
  total daily line come from the Sellpia sales owner (`coupang`,
  `nonCoupang`, `total`); the screen never infers Coupang from seller names
  and never adds or subtracts series to make a total. Shares are the server's.
- An unknown value renders as unknown, never as 0: an uncovered day is a gap,
  a withheld profit stays empty, and one source's profit is never borrowed
  under another source's card.
- A failed read is named once under the header with a retry; it is not shown
  as an empty value.
- Agent status reads the Agent Org model (`useAgentOrg`, `buildPipeAgents`) so
  both screens say the same thing about the same agent. The dashboard groups
  Agent Org agents into the sidebar's agents (analysis joins 소싱, orders join
  쇼핑몰); an agent with no stages reads 기록 없음, never 정상.
- Top Products render Products' stored evaluation snapshot. Never rebuild
  contribution profit locally.

## Boundary Rules

- Do not recompute dashboard totals from product/order/ad raw endpoints in the
  browser.
- Do not add dashboard-local stores for data that React Query already owns.
- Do not add dashboard-only operation handlers or a generic operations panel.
  The dashboard reads; the owner screens act.
- New dashboard metrics require checking backend dashboard schemas and this
  route rendering together, and must not repeat a value another panel on the
  page already shows.
