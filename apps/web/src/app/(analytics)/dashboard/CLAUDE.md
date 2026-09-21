Before working in this directory, always read this document first rather than relying on memory.

# web/dashboard - Operational Read Models

`dashboard/` owns the landing dashboard: a read-only summary of sales, ads, and
what each agent is doing. It is deliberately simple (owner decision
2026-09-18) — each fact appears once, and anything that repeated another panel
was removed.

## Composition

One five-column grid holds the page (사장님 2026-09-20). There is no grouping
surface behind the cards — cards on the page background, white with a 16px
radius, color only in the icon badge and small pills (DESIGN.md).

- Top row, five cards of one spec (`HeadlineCard`): 매출 · 쇼핑몰 · 마케팅 ·
  재고 · 상품 (사장님 2026-09-20). A card carries no header at all (사장님 2026-09-20) — no name, no icon, no
  owner-screen link; the headline value's own label names it and every row links
  to the screen that owns it. 상품 keeps only its 근거 and 재계산 controls, which
  act rather than navigate, and publishes A · B · C · 신상품 as four cells side
  by side — grade, count, this publication's ▲▼ flow, a share bar and the
  grade's weighted operating profit — so the distribution reads at a glance. Elsewhere a row is a name and a
  number: what would have been a caption under the
  number is a `title`, and a short reading beside the name (이익률, 가중 영업
  이익) is its `suffix`. 매출 reads as a receipt (사장님 2026-09-20): 월 매출, then 매입
  원가 and 광고비 as subtracted lines, then 월 순이익 under a heavier rule with
  its 이익률. All four are the Sellpia sales read's own published fields
  (`totalRevenue`, `totalCost`, `adCost`, `netProfit`, `profitRate`) — the card
  does not subtract anything itself, so the lines always add up. Each leads with its headline value large and violet — its own note
  under it — then a rule, then the other three as name-left / number-right rows
  with their evidence in small type under the name (사장님 2026-09-20); they render
  what the page resolved from the server read models and compute nothing. 재고
  reads Products' own summary — the product hub's overview read, same params and
  cache — and each count links to the hub filtered to it; 적자 without
  contribution evidence is unknown, not 0. 쇼핑몰 shows 오늘 주문 with 주문 수집 ·
  송장 수집 (`/api/dashboard/collections` last-completed times); 취소 · 반품 has
  no server count and says so instead of rendering 0.
- Second row, one line: 매출 추이 across three columns and AI 에이전트 across two.
- AI 에이전트 is where the agents speak: a header strip with 막힌 일 · 돈 새는 일
  · 내 결정 and this month's total AI cost (per-agent cost belongs to Agent Org),
  then 지금 하는 일 beside 지금 해야 할 일 in a row exactly as tall as the agent
  list (40px header + seven 40px rows = 320px, `lg:h-80`), so neither card ends
  in empty space; 지금 해야 할 일 scrolls inside that height. AI 제안 sits under
  both as one short row, outside that grid — inside it, it would halve the row.
  지금 하는 일 is titled LIVE ACTIVITY and lists each agent with its face, a traffic-light dot on that face,
  what it is doing now, and a red count badge —
  a number alone, like a notification. No column headings, no legend: the row
  says it. The faces
  are AI-generated 3D characters under `public/agents/<agent id>.png`, one set
  drawn the same way; regenerate the whole set rather than one odd face.
  지금 해야 할 일 ranks Agent Org's inbox and `/api/dashboard/findings` into one
  list (막힘 → 돈 → 결정, longest-waiting first) where every row says why in
  numbers and opens the screen that ends it. A row is two lines: the title with
  how long it has waited beside it, the evidence under it, and one arrow on the
  right — no button, no emoji. A blocked row is tinted red so the urgent ones
  read before the words do. `lib/work-queue` only ranks and phrases,
  inventing no value. Reorder rows stop at two so a decision is never
  pushed off; the header says how many are left. AI 제안 shows two cards at a time and pages
  through the rest (`lib/ai-suggestions`): the urgent reorders, then the money
  already on the table — 판매상품 not yet on any mall, 품절 that could reopen —
  then 매출 하락 and 등록 반려. Every line is a number an owner already
  published; a claim like "매출 10% 상승" is never written, because nobody
  measured it.
- Bottom row: Top 상품 · 매출순 across three columns and 최근 등록된 상품 across
  two. The 방금 feed was removed (사장님 2026-09-20); `DashboardAgentStatus`
  still builds it, and the page ignores it. For a whole month the server ranks Sellpia's per-product
  sales (every channel, options summed); other windows rank collected orders.
  A row with no grade says why in that cell — 품절 · 미연결 · 대기 — from the
  server's `gradeAbsence` (사장님 2026-09-21); a blank beside a large revenue
  reads as a bug. The profit columns follow the row's `profitKind`: for a whole
  month they are 매출총이익 · 총이익률 (매출 − 셀피아 매입 원가, before ads and
  mall fees), and for other windows the settled 순이익 · 이익률. A product whose
  cost came in as 0 has no cost, not a 100% margin, so its profit stays blank. 최근 등록된 상품 renders the first rows of Channels' mall listing matrix
  (`filter=all`, Sellpia code order) with the published-mall count.
- Every card header is one style: `DashboardCardHeader` — 40px, a tinted icon
  badge, and the owner-screen link on the right.

The 'AI가 발견한 문제' tiles were removed (사장님 2026-09-20): 재고 부족 is the
재고 card's 품절 임박, and 매출 하락 · 상품 등록 실패 are rows in 지금 해야 할 일.
`DashboardAiIssues` stays unused rather than being deleted.

The header's 데이터 수집 button (restored by the owner 2026-09-19) opens the
shared `ReadinessModal`, which also opens itself once per session on a
collection issue, with the Wing daily traffic control underneath. Every other
collection starts from its owner screen; failures also reach 긴급.

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
  under another source's card. 누적 sums confirmed days only; an uncovered
  day stays a gap (`revenuePoints`).
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
  page already shows. 지금 해야 할 일 repeats on purpose (owner 2026-09-20): it
  restates Agent Org's inbox and the findings as one queue, reading the same
  published source as the panel it repeats, so the two cannot disagree. A repeat
  that reads a second source is still forbidden.
