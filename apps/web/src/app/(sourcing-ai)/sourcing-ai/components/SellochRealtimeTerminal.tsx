const terminalEvents = [
  {
    time: '14:42:11',
    source: 'coupang.rank',
    message: '문구 카테고리 신규 등록 31건 감지',
    value: '+31',
  },
  {
    time: '14:42:18',
    source: 'naver.search',
    message: '방수 네임스티커 검색량 7,600회 유지',
    value: '7.6K',
  },
  {
    time: '14:42:26',
    source: 'trend.score',
    message: '최근 3일 반응 상품 40개 재정렬 완료',
    value: '40',
  },
  {
    time: '14:42:33',
    source: 'margin.check',
    message: '예상 마진 25% 이상 후보 12개 필터링',
    value: '12',
  },
  {
    time: '14:42:41',
    source: 'category.map',
    message: '문구 하위 카테고리 후보 8개 매칭',
    value: '8',
  },
  {
    time: '14:42:49',
    source: 'risk.scan',
    message: '인증 확인 필요 후보 3개 보류',
    value: '3',
  },
  {
    time: '14:42:57',
    source: 'candidate.push',
    message: '상위 후보 10개 대기열 반영',
    value: '10',
  },
  {
    time: '14:43:06',
    source: '1688.match',
    message: '동일 이미지 도매 후보 18개 연결',
    value: '18',
  },
  {
    time: '14:43:14',
    source: 'rocket.filter',
    message: '판매자 로켓 가능 후보 6개 표시',
    value: '6',
  },
];

const collectorStats = [
  { label: '카테고리 분석', value: '12개', detail: '가격, 리뷰, 월매출, 전환율' },
  { label: '키워드 분석', value: '3년', detail: '검색량 추이와 경쟁 상품 매출' },
  { label: '1688 매칭', value: '18개', detail: '도매가, 원가율, 이미지 유사도' },
  { label: '판매자 로켓 후보', value: '6개', detail: '인증 부담 낮고 매출 높은 후보' },
];

const collectionStages = [
  { label: '키워드 수집', value: 82, detail: '검색량, 연관어, 3년 추이' },
  { label: '쿠팡 카테고리 분석', value: 74, detail: '1차/2차 카테고리, 월매출' },
  { label: '쿠팡 최근상품 수집', value: 68, detail: '최근등록, 가격, 전환 후보' },
  { label: '상품 리뷰 수집', value: 54, detail: '리뷰 수, 평점, 불만 키워드' },
  { label: '1688 소싱 매칭', value: 36, detail: '도매가, 원가율, 후보 이미지' },
  { label: '인증/브랜드 리스크', value: 46, detail: 'KC, IP, 판매 제한 가능성' },
];

const totalProgress = 64;

export function RealtimeSourcingTerminal() {
  return (
    <section className="overflow-hidden rounded-[24px] border border-[#dbe5f4] bg-gradient-to-r from-[#e8fbfb] via-[#eef8ff] to-[#eeedff]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-black text-[#111827]">실시간 소싱 수집</h2>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            LIVE
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-black text-[#667085]">
          <span className="rounded-full border border-white/90 bg-white/88 px-2.5 py-1 backdrop-blur-md">3일 반응 추적</span>
          <span className="rounded-full border border-white/90 bg-white/88 px-2.5 py-1 backdrop-blur-md">
            최근등록 + 검색량 우선
          </span>
          <span className="rounded-full border border-white/90 bg-white/88 px-2.5 py-1 backdrop-blur-md">문구 카테고리</span>
        </div>
      </div>

      <div className="grid min-h-[300px] gap-5 p-5 lg:grid-cols-[1fr_420px]">
        <div className="relative flex flex-col justify-between gap-5 rounded-2xl border border-white/90 bg-white/88 p-5 backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-white">
          <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
            <div className="relative flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-white/90 bg-white/90 p-5 backdrop-blur-md before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-white">
              <div
                className="grid h-44 w-44 place-items-center rounded-full"
                style={{ background: `conic-gradient(#6d5dfc ${totalProgress}%, rgba(255,255,255,0.72) 0)` }}
              >
                <div className="grid h-32 w-32 place-items-center rounded-full border border-white/90 bg-white/90 backdrop-blur-md">
                  <div className="text-center">
                    <p className="text-4xl font-black text-[#111827]">{totalProgress}%</p>
                    <p className="text-[11px] font-black text-[#7a8494]">전체 수집률</p>
                  </div>
                </div>
              </div>
              <p className="mt-5 font-mono text-xs font-black text-[#5376a2]">kiditem.sourcing.collector</p>
              <p className="mt-2 text-center text-sm font-black text-[#111827]">한국 트렌드 상품 반응 수집 중</p>
            </div>
            <div className="flex flex-col justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black tracking-normal text-[#111827]">실시간 후보 순위 갱신</h3>
                <p className="mt-2 text-sm font-bold leading-6 text-[#667085]">
                  최근 등록 증가, 검색량, 월매출, 리뷰, 1688 원가율, 인증 리스크를 합쳐서 후보를 좁힙니다.
                </p>
              </div>
              <div className="grid gap-2 xl:grid-cols-2">
                {collectionStages.map((stage) => (
                  <div
                    key={stage.label}
                    className="relative rounded-xl border border-white/90 bg-white/90 px-3 py-2.5 backdrop-blur-md before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#111827]">{stage.label}</p>
                        <p className="mt-0.5 truncate text-[11px] font-bold text-[#7a8494]">{stage.detail}</p>
                      </div>
                      <span className="font-mono text-xs font-black text-[#6d5dfc]">{stage.value}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8eef8]">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#6d5dfc] to-[#54c7e8]" style={{ width: `${stage.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {collectorStats.map((stat) => (
              <div
                key={stat.label}
                className="relative rounded-2xl border border-white/90 bg-white/90 p-4 backdrop-blur-md before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-white"
              >
                <p className="text-xs font-black text-[#7a8494]">{stat.label}</p>
                <p className="mt-2 text-2xl font-black text-[#111827]">{stat.value}</p>
                <p className="mt-2 line-clamp-2 text-xs font-bold leading-5 text-[#667085]">{stat.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="relative rounded-2xl border border-white/90 bg-white/88 p-4 backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-white">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-xs font-black text-[#475467]">REALTIME LOG</p>
            <span className="rounded-full border border-white/90 bg-white/88 px-2 py-1 text-[10px] font-black text-[#667085] backdrop-blur-md">
              tail -f
            </span>
          </div>
          <div className="max-h-[256px] space-y-2 overflow-hidden font-mono text-xs">
            {terminalEvents.map((event) => (
              <div
                key={`${event.time}-${event.source}`}
                className="relative rounded-xl border border-white/90 bg-white/90 px-3 py-2 backdrop-blur-md before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-white"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#98a2b3]">[{event.time}]</span>
                  <span className="rounded bg-[#6d5dfc]/10 px-1.5 py-0.5 text-[10px] font-black text-[#6d5dfc]">{event.value}</span>
                </div>
                <p className="mt-1 text-[11px] font-black text-[#5376a2]">{event.source}</p>
                <p className="mt-1 truncate text-[#344054]">{event.message}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
