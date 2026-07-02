'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterChip {
  id: string;
  label: string;
  icon?: string;
}

const rankingTabs: FilterChip[] = [
  { id: 'best-recommend', label: '베스트 추천 상품' },
  { id: 'popular', label: '인기순위' },
  { id: 'sales-surge', label: '판매량 급상승 랭킹' },
  { id: 'trend-new', label: '트렌드 신제품 랭킹' },
  { id: 'live-commerce', label: '라이브 커머스 랭킹' },
];

const sourceChips: FilterChip[] = [
  { id: '1688', label: '1688', icon: '🛒' },
  { id: 'tiktok', label: 'TikTok', icon: '♪' },
  { id: 'douyin', label: 'Douyin', icon: '抖' },
  { id: 'amazon', label: 'Amazon', icon: 'A' },
  { id: 'domestic', label: '국내 이커머스', icon: 'K' },
];

const countryChips: FilterChip[] = [
  { id: 'us', label: '미국', icon: '🇺🇸' },
  { id: 'uk', label: '영국', icon: '🇬🇧' },
  { id: 'jp', label: '일본', icon: '🇯🇵' },
  { id: 'kr', label: '한국', icon: '🇰🇷' },
  { id: 'ca', label: '캐나다', icon: '🇨🇦' },
  { id: 'de', label: '독일', icon: '🇩🇪' },
];

const categoryChips: FilterChip[] = [
  { id: 'toys', label: '완구·게임' },
  { id: 'kids-fashion', label: '유아동 패션' },
  { id: 'home', label: '리빙·침구' },
  { id: 'stationery', label: '문구·스티커' },
  { id: 'outdoor', label: '물놀이·아웃도어' },
  { id: 'electronics', label: '전자·소형가전' },
  { id: 'pet', label: '반려동물' },
  { id: 'more', label: '많은 카테고리' },
];

const primaryCategoryOptions = ['장난감', '유아동 패션', '리빙·침구', '문구·스티커', '물놀이·아웃도어', '전자·소형가전'];

const secondaryCategoryOptions: Record<string, string[]> = {
  장난감: ['2차 분류 선택', '역할놀이', '보드게임', '블록·조립', '물놀이 장난감', '교육 완구'],
  '유아동 패션': ['2차 분류 선택', '키즈 신발', '아동 잡화', '선글라스·모자', '헤어 액세서리'],
  '리빙·침구': ['2차 분류 선택', '냉감 침구', '베개·커버', '식탁매트', '수납·정리'],
  '문구·스티커': ['2차 분류 선택', '스티커북', '필통', '학용품 세트', '다이어리 꾸미기'],
  '물놀이·아웃도어': ['2차 분류 선택', '물총', '비치완구', '방수팩', '캠핑 소품'],
  '전자·소형가전': ['2차 분류 선택', '휴대용 선풍기', 'USB 충전', '차량용 소품', '조명·램프'],
};

const marketBestChips: FilterChip[] = [
  { id: 'kr-best', label: '한국베스트상품', icon: '🇰🇷' },
  { id: 'c-best', label: 'C사베스트상품', icon: '🚀' },
  { id: 'a-best', label: 'A사베스트상품', icon: '↗' },
];

const supplierEvalOptions: FilterChip[] = [
  { id: 'verified', label: '검증된 공급사' },
  { id: 'rating-5', label: '서비스등급 5점' },
  { id: 'rating-45-5', label: '서비스등급 4.5~5점' },
  { id: 'rating-4-45', label: '서비스등급 4~4.5점' },
  { id: 'rating-under-4', label: '서비스등급 4점이하' },
];

const serviceTypeOptions: FilterChip[] = [
  { id: 'returns-7d', label: '7일내 환불/교환가능' },
  { id: 'today-shipping', label: '오늘발송' },
  { id: 'shipping-48h', label: '48시간 이내 발송' },
  { id: 'small-order', label: '소량주문가능' },
];

export function SellochWholesaleRankingTabs() {
  const [activeRankingId, setActiveRankingId] = useState(rankingTabs[0]?.id ?? '');
  const [activeSourceId, setActiveSourceId] = useState(sourceChips[0]?.id ?? '');
  const [activeCountryId, setActiveCountryId] = useState(countryChips[0]?.id ?? '');
  const [activeCategoryId, setActiveCategoryId] = useState(categoryChips[0]?.id ?? '');
  const [primaryCategory, setPrimaryCategory] = useState(primaryCategoryOptions[0] ?? '');
  const [secondaryCategory, setSecondaryCategory] = useState(secondaryCategoryOptions[primaryCategory]?.[0] ?? '');
  const [activeMarketBestId, setActiveMarketBestId] = useState(marketBestChips[0]?.id ?? '');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [supplierEvalIds, setSupplierEvalIds] = useState<string[]>(['verified']);
  const [serviceTypeIds, setServiceTypeIds] = useState<string[]>(['today-shipping']);

  const secondaryOptions = secondaryCategoryOptions[primaryCategory] ?? ['2차 분류 선택'];

  const handlePrimaryCategoryChange = (value: string) => {
    setPrimaryCategory(value);
    setSecondaryCategory(secondaryCategoryOptions[value]?.[0] ?? '2차 분류 선택');
  };

  return (
    <section className="rounded-[18px] border border-[#eef1f5] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="space-y-3">
        <FilterRow
          label="랭킹 유형"
          chips={rankingTabs}
          activeId={activeRankingId}
          onSelect={setActiveRankingId}
        />
        <FilterRow
          label="카테고리"
          chips={categoryChips}
          activeId={activeCategoryId}
          onSelect={setActiveCategoryId}
        />
        <FilterRow
          label="마켓별베스트"
          chips={marketBestChips}
          activeId={activeMarketBestId}
          onSelect={setActiveMarketBestId}
        />
        <FilterRow
          label="랭킹 소스"
          chips={sourceChips}
          activeId={activeSourceId}
          onSelect={setActiveSourceId}
        />

        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setFiltersExpanded((expanded) => !expanded)}
            aria-label={filtersExpanded ? '상세 필터 접기' : '상세 필터 펼치기'}
            title={filtersExpanded ? '상세 필터 접기' : '상세 필터 펼치기'}
            className="group flex h-10 w-16 items-center justify-center rounded-full border border-[#dbe2ea] bg-[#fbfcfe] text-[#4b5563] transition hover:border-[#6d5dfc] hover:bg-white hover:text-[#6d5dfc] hover:shadow-[0_8px_18px_rgba(109,93,252,0.12)]"
          >
            <ChevronDown
              size={24}
              strokeWidth={2.4}
              className={cn('transition-transform duration-200 group-hover:translate-y-0.5', filtersExpanded && 'rotate-180 group-hover:translate-y-0')}
            />
          </button>
        </div>

        {filtersExpanded && (
          <div className="space-y-3 border-t border-[#eef1f5] pt-4">
            <FilterRow
              label="타겟 국가"
              chips={countryChips}
              activeId={activeCountryId}
              onSelect={setActiveCountryId}
            />
            <DetailedFilterPanel
              primaryCategory={primaryCategory}
              secondaryCategory={secondaryCategory}
              secondaryOptions={secondaryOptions}
              supplierEvalIds={supplierEvalIds}
              serviceTypeIds={serviceTypeIds}
              onPrimaryCategoryChange={handlePrimaryCategoryChange}
              onSecondaryCategoryChange={setSecondaryCategory}
              onToggleSupplierEval={(id) => setSupplierEvalIds((current) => toggleSelectedId(current, id))}
              onToggleServiceType={(id) => setServiceTypeIds((current) => toggleSelectedId(current, id))}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function DetailedFilterPanel({
  primaryCategory,
  secondaryCategory,
  secondaryOptions,
  supplierEvalIds,
  serviceTypeIds,
  onPrimaryCategoryChange,
  onSecondaryCategoryChange,
  onToggleSupplierEval,
  onToggleServiceType,
}: {
  primaryCategory: string;
  secondaryCategory: string;
  secondaryOptions: string[];
  supplierEvalIds: string[];
  serviceTypeIds: string[];
  onPrimaryCategoryChange: (value: string) => void;
  onSecondaryCategoryChange: (value: string) => void;
  onToggleSupplierEval: (id: string) => void;
  onToggleServiceType: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[92px_1fr] lg:items-center">
        <FilterLabel>세부 분류</FilterLabel>
        <div className="grid gap-2 md:grid-cols-2 xl:max-w-[760px]">
          <SelectControl
            value={primaryCategory}
            options={primaryCategoryOptions}
            onChange={onPrimaryCategoryChange}
          />
          <SelectControl
            value={secondaryCategory}
            options={secondaryOptions}
            onChange={onSecondaryCategoryChange}
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[92px_1fr] lg:items-center">
        <FilterLabel>공급사평가</FilterLabel>
        <CheckboxGroup
          options={supplierEvalOptions}
          selectedIds={supplierEvalIds}
          onToggle={onToggleSupplierEval}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[92px_1fr] lg:items-center">
        <FilterLabel>서비스유형</FilterLabel>
        <CheckboxGroup
          options={serviceTypeOptions}
          selectedIds={serviceTypeIds}
          onToggle={onToggleServiceType}
        />
      </div>
    </div>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-black text-[#111827]">{children}</div>;
}

function SelectControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative block">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full appearance-none rounded-lg border border-[#d8dee8] bg-white px-4 pr-10 text-sm font-black text-[#111827] outline-none transition focus:border-[#6d5dfc] focus:ring-2 focus:ring-[#6d5dfc]/10"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
      <ChevronDown size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#4b5563]" />
    </label>
  );
}

function CheckboxGroup({
  options,
  selectedIds,
  onToggle,
}: {
  options: FilterChip[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-x-7 gap-y-3">
      {options.map((option) => {
        const checked = selectedIds.includes(option.id);
        return (
          <label key={option.id} className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm font-black text-[#111827]">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(option.id)}
              className="h-5 w-5 rounded border-[#b8c0cc] text-[#6d5dfc] focus:ring-[#6d5dfc]/20"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

function toggleSelectedId(current: string[], id: string): string[] {
  return current.includes(id)
    ? current.filter((selectedId) => selectedId !== id)
    : [...current, id];
}

function FilterRow({
  label,
  chips,
  activeId,
  onSelect,
}: {
  label: string;
  chips: FilterChip[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[92px_1fr] lg:items-center">
      <div className="text-sm font-black text-[#111827]">{label}</div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => onSelect(chip.id)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-black transition',
              chip.id === activeId
                ? 'border-[#6d5dfc] bg-white text-[#6d5dfc] shadow-[0_6px_16px_rgba(109,93,252,0.10)]'
                : 'border-[#e5eaf1] bg-[#fbfcfe] text-[#3f4652] hover:border-[#c8d0dc]',
            )}
          >
            {chip.icon && <span className="text-base leading-none">{chip.icon}</span>}
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
