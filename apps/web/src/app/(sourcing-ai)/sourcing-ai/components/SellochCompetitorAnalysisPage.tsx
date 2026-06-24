'use client';

import { ArrowUpRight, Bell, Building2, Clock3, ExternalLink, Flame, PackageCheck, Radar, Search, Star, Store, Users } from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';

type ProductSignal = {
  id: string;
  title: string;
  source: string;
  channel: 'competitor' | 'topSeller' | 'followedSupplier';
  imageUrl: string;
  category: string;
  firstSeen: string;
  priceKrw: number;
  salesSignal: string;
  marginSignal: string;
  supplier: string;
  tags: string[];
  score: number;
};

type CompetitorAccount = {
  id: string;
  name: string;
  market: string;
  trackedProducts: number;
  newProducts: number;
  topCategory: string;
  pace: string;
};

const competitorAccounts: CompetitorAccount[] = [
  { id: 'c1', name: '키즈바로', market: '쿠팡', trackedProducts: 184, newProducts: 12, topCategory: '말랑이/스퀴시', pace: '신상 업로드 빠름' },
  { id: 'c2', name: '토이픽셀', market: '스마트스토어', trackedProducts: 143, newProducts: 9, topCategory: '블록/보드게임', pace: '상세 교체 잦음' },
  { id: 'c3', name: '맘스문구랩', market: '쿠팡', trackedProducts: 96, newProducts: 7, topCategory: '문구/팬시', pace: '가격 테스트 중' },
  { id: 'c4', name: '베베리빙', market: '쿠팡', trackedProducts: 77, newProducts: 5, topCategory: '물티슈/생활', pace: '리뷰 낮은 신상' },
];

const competitorProducts: ProductSignal[] = [
  {
    id: 'p1',
    title: '초저가 대용량 말랑이 캡슐 랜덤 세트',
    source: '경쟁업체 신상 등록',
    channel: 'competitor',
    imageUrl: 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?auto=format&fit=crop&w=700&q=80',
    category: '말랑이',
    firstSeen: '2시간 전',
    priceKrw: 12900,
    salesSignal: '3일 반응 184개',
    marginSignal: '예상 마진 41%',
    supplier: '义乌玩具源头厂',
    tags: ['저리뷰', '신규상승', '선택후보'],
    score: 92,
  },
  {
    id: 'p2',
    title: '어린이 감정 카드 보드게임 박스형',
    source: '경쟁업체 상세페이지 교체',
    channel: 'competitor',
    imageUrl: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=700&q=80',
    category: '보드게임',
    firstSeen: '오늘',
    priceKrw: 16900,
    salesSignal: '검색량 상승',
    marginSignal: '예상 마진 38%',
    supplier: '温州卡牌包装厂',
    tags: ['교육완구', '카피가능'],
    score: 87,
  },
  {
    id: 'p3',
    title: '초등 가방 키링 미니 피젯토이 세트',
    source: '경쟁업체 묶음 구성',
    channel: 'competitor',
    imageUrl: 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=700&q=80',
    category: '피젯토이',
    firstSeen: '어제',
    priceKrw: 9900,
    salesSignal: '리뷰 낮음',
    marginSignal: '예상 마진 45%',
    supplier: '东莞小玩具工厂',
    tags: ['소형택배', '충동구매'],
    score: 84,
  },
  {
    id: 'p4',
    title: '아기 물티슈 캡형 저가 번들 10팩',
    source: '경쟁업체 가격 테스트',
    channel: 'competitor',
    imageUrl: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=700&q=80',
    category: '생활소모품',
    firstSeen: '3일 전',
    priceKrw: 10900,
    salesSignal: '반응 안정',
    marginSignal: '예상 마진 21%',
    supplier: '保定湿巾供应链',
    tags: ['반복구매', '가격경쟁'],
    score: 78,
  },
];

const topSellerProducts: ProductSignal[] = [
  {
    id: 't1',
    title: '레고 호환 미니 경찰차 블록 4종',
    source: '탑셀러 신규 등록',
    channel: 'topSeller',
    imageUrl: 'https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=700&q=80',
    category: '블록완구',
    firstSeen: '방금',
    priceKrw: 13900,
    salesSignal: '상위 셀러 3곳 동시 등록',
    marginSignal: '마진 34%',
    supplier: '汕头积木玩具厂',
    tags: ['탑셀러', '급상승'],
    score: 91,
  },
  {
    id: 't2',
    title: '여름 물놀이 접이식 미니 버킷',
    source: '탑셀러 시즌 신상',
    channel: 'topSeller',
    imageUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=700&q=80',
    category: '시즌',
    firstSeen: '오늘',
    priceKrw: 11900,
    salesSignal: '계절 키워드 증가',
    marginSignal: '마진 39%',
    supplier: '台州塑料日用品厂',
    tags: ['여름시즌', '저단가'],
    score: 86,
  },
  {
    id: 't3',
    title: '어린이 방수 네임스티커 롤팩',
    source: '탑셀러 옵션 확장',
    channel: 'topSeller',
    imageUrl: 'https://images.unsplash.com/photo-1612810806546-ebbf22b53496?auto=format&fit=crop&w=700&q=80',
    category: '문구',
    firstSeen: '어제',
    priceKrw: 7900,
    salesSignal: '옵션 확장 중',
    marginSignal: '마진 52%',
    supplier: '义乌贴纸印刷厂',
    tags: ['소형상품', '반복구매'],
    score: 82,
  },
];

const followedSupplierProducts: ProductSignal[] = [
  {
    id: 'f1',
    title: '원천공장 캡슐 말랑이 100mm 신형',
    source: '팔로우 거래처 업데이트',
    channel: 'followedSupplier',
    imageUrl: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=700&q=80',
    category: '말랑이',
    firstSeen: '1시간 전',
    priceKrw: 6200,
    salesSignal: '공장 신상 24개',
    marginSignal: '마진 48%',
    supplier: '义乌松快电子商务',
    tags: ['팔로우', '원천공장'],
    score: 89,
  },
  {
    id: 'f2',
    title: '두꺼운 클렌징 타월 유아용 리무버 팩',
    source: '팔로우 거래처 신상품',
    channel: 'followedSupplier',
    imageUrl: 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=700&q=80',
    category: '생활',
    firstSeen: '오늘',
    priceKrw: 7600,
    salesSignal: '월거래 증가',
    marginSignal: '마진 33%',
    supplier: '绍兴日用棉品厂',
    tags: ['재구매형', '패키징가능'],
    score: 81,
  },
  {
    id: 'f3',
    title: '소형 스티커북 랜덤팩 12종',
    source: '팔로우 거래처 옵션 추가',
    channel: 'followedSupplier',
    imageUrl: 'https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=700&q=80',
    category: '스티커',
    firstSeen: '2일 전',
    priceKrw: 4300,
    salesSignal: '옵션 12개 추가',
    marginSignal: '마진 55%',
    supplier: '温州儿童贴纸厂',
    tags: ['원가낮음', '묶음가능'],
    score: 79,
  },
];

const allSignals = [...competitorProducts, ...topSellerProducts, ...followedSupplierProducts];

export function SellochCompetitorAnalysisPage() {
  return (
    <div className="w-full space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[22px] border border-[#dbe5f4] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black text-[#6d5dfc]">경쟁업체 분석</p>
              <h2 className="mt-1 text-2xl font-black tracking-normal text-[#111827]">경쟁사가 먼저 올린 최신상품을 추적</h2>
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-[#667085]">
                경쟁업체 신상, 탑셀러 등록 상품, 팔로우 거래처 업데이트를 한 화면에서 보고 소싱 후보로 넘기는 화면입니다.
              </p>
            </div>
            <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[#e4eaf3] bg-[#f8fafc]">
              <SummaryCell label="추적 업체" value={formatNumber(competitorAccounts.length)} />
              <SummaryCell label="신상 신호" value={formatNumber(allSignals.length)} />
              <SummaryCell label="고점수" value={formatNumber(allSignals.filter((item) => item.score >= 85).length)} />
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {competitorAccounts.map((account) => (
              <CompetitorAccountCard key={account.id} account={account} />
            ))}
          </div>
        </div>

        <aside className="rounded-[22px] border border-[#dbe5f4] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#6d5dfc]">수집 조건</p>
              <h2 className="mt-1 text-lg font-black text-[#111827]">추적 필터</h2>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#f2f5ff] text-[#5b52e6]">
              <Radar size={18} />
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <FilterRow icon={Users} label="경쟁업체" value="관심 스토어 4곳" />
            <FilterRow icon={Flame} label="탑셀러" value="상위 판매자 최신등록" />
            <FilterRow icon={Store} label="거래처" value="팔로우 공장 업데이트" />
            <FilterRow icon={Clock3} label="기간" value="최근 72시간" />
          </div>
          <button type="button" className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#5b52e6] text-sm font-black text-white shadow-[0_12px_24px_rgba(91,82,230,0.22)]">
            <Search size={16} />
            경쟁 신상품 다시 수집
          </button>
        </aside>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <SignalBoard
          title="경쟁업체 소싱 최신상품"
          caption="경쟁업체가 최근 등록하거나 가격/상세를 바꾼 상품"
          icon={Building2}
          products={competitorProducts}
          columns="xl:grid-cols-4"
        />

        <section className="space-y-6">
          <SignalList title="탑셀러 최신상품" icon={Star} products={topSellerProducts} />
          <SignalList title="팔로우 거래처 최신상품" icon={Bell} products={followedSupplierProducts} />
        </section>
      </section>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[96px] border-r border-[#e4eaf3] px-4 py-3 text-center last:border-r-0">
      <p className="text-[11px] font-black text-[#8a95a6]">{label}</p>
      <p className="mt-1 text-xl font-black text-[#111827]">{value}</p>
    </div>
  );
}

function CompetitorAccountCard({ account }: { account: CompetitorAccount }) {
  return (
    <article className="rounded-2xl border border-[#e4eaf3] bg-[#fbfcfe] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[#111827]">{account.name}</p>
          <p className="mt-1 text-xs font-bold text-[#8a95a6]">{account.market} · {account.topCategory}</p>
        </div>
        <span className="rounded-full bg-[#fff4ee] px-2 py-1 text-[11px] font-black text-[#d94112]">+{account.newProducts}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-[#667085]">
        <MetricPill label="추적" value={`${formatNumber(account.trackedProducts)}개`} />
        <MetricPill label="패턴" value={account.pace} />
      </div>
    </article>
  );
}

function SignalBoard({
  title,
  caption,
  icon: Icon,
  products,
  columns,
}: {
  title: string;
  caption: string;
  icon: typeof Building2;
  products: ProductSignal[];
  columns?: string;
}) {
  return (
    <section className="rounded-[22px] border border-[#dbe5f4] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2f5ff] text-[#5b52e6]">
            <Icon size={20} />
          </span>
          <div>
            <h2 className="text-lg font-black text-[#111827]">{title}</h2>
            <p className="mt-1 text-xs font-bold text-[#667085]">{caption}</p>
          </div>
        </div>
        <span className="rounded-full bg-[#f2f5ff] px-3 py-1.5 text-xs font-black text-[#4e6cf5]">
          {formatNumber(products.length)}개
        </span>
      </div>

      <div className={cn('mt-4 grid gap-3 sm:grid-cols-2', columns ?? 'xl:grid-cols-3')}>
        {products.map((product) => (
          <ProductSignalCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

function SignalList({ title, icon: Icon, products }: { title: string; icon: typeof Star; products: ProductSignal[] }) {
  return (
    <section className="rounded-[22px] border border-[#dbe5f4] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2f5ff] text-[#5b52e6]">
            <Icon size={20} />
          </span>
          <h2 className="text-lg font-black text-[#111827]">{title}</h2>
        </div>
        <span className="text-xs font-black text-[#8a95a6]">{formatNumber(products.length)}개</span>
      </div>
      <div className="mt-4 space-y-3">
        {products.map((product) => (
          <CompactSignalRow key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

function ProductSignalCard({ product }: { product: ProductSignal }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#e4eaf3] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#f1f5fb]">
        <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" loading="lazy" />
        <span className="absolute left-3 top-3 rounded-full bg-white/92 px-2 py-1 text-[11px] font-black text-[#d94112] ring-1 ring-[#f0d4c7]">
          {product.score}점
        </span>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="text-[11px] font-black text-[#6d5dfc]">{product.source}</p>
          <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-black leading-5 text-[#111827]">{product.title}</h3>
          <p className="mt-1 truncate text-xs font-bold text-[#8a95a6]">{product.category} · {product.firstSeen}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f8fafc] p-2 text-[11px] font-bold text-[#667085]">
          <MetricMini label="판매 신호" value={product.salesSignal} />
          <MetricMini label="판매가" value={`${formatKRW(product.priceKrw)}원`} />
          <MetricMini label="마진" value={product.marginSignal} />
          <MetricMini label="거래처" value={product.supplier} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {product.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[#f2f5ff] px-2 py-1 text-[10px] font-black text-[#5b52e6]">{tag}</span>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#e3eaf5] bg-white text-xs font-black text-[#667085] hover:bg-[#f8fafc]">
            <PackageCheck size={14} />
            소싱 후보
          </button>
          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#e3eaf5] bg-white text-[#667085] hover:bg-[#f8fafc]">
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

function CompactSignalRow({ product }: { product: ProductSignal }) {
  return (
    <article className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 rounded-2xl border border-[#e4eaf3] bg-[#fbfcfe] p-3">
      <div className="relative h-[86px] overflow-hidden rounded-xl bg-[#f1f5fb]">
        <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" loading="lazy" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#5b52e6] ring-1 ring-[#e4eaf3]">{product.score}점</span>
          <span className="text-[10px] font-black text-[#8a95a6]">{product.firstSeen}</span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-black leading-5 text-[#111827]">{product.title}</h3>
        <p className="mt-1 truncate text-xs font-bold text-[#667085]">{product.supplier}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs font-black text-[#d94112]">{product.marginSignal}</span>
          <button type="button" className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#5b52e6] px-2 text-[10px] font-black text-white">
            보기
            <ArrowUpRight size={12} />
          </button>
        </div>
      </div>
    </article>
  );
}

function FilterRow({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[32px_1fr] items-center gap-3 rounded-xl bg-[#f8fafc] p-3">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#5b52e6] ring-1 ring-[#e4eaf3]">
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-black text-[#8a95a6]">{label}</p>
        <p className="truncate text-sm font-black text-[#111827]">{value}</p>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white px-3 py-2 ring-1 ring-[#eef1f5]">
      <p className="text-[10px] font-black text-[#8a95a6]">{label}</p>
      <p className="mt-1 truncate text-xs font-black text-[#111827]">{value}</p>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[#8a95a6]">{label}</p>
      <p className="truncate font-black text-[#111827]">{value}</p>
    </div>
  );
}
