import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  Boxes,
  LayoutGrid,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  NaverDatalabDevice,
  NaverDatalabGender,
  NaverDatalabTimeUnit,
} from '../../recommendations/lib/naver-keyword-api';
import {
  ageOptions,
  boardFilterOptions,
  deviceOptions,
  focusOptions,
  genderOptions,
  rankLimitOptions,
  timeUnitOptions,
  type BoardFilterKey,
  type FocusMode,
} from './keyword-analysis-helpers';

export function KeywordAnalysisWorkbench({
  timeUnit,
  gender,
  age,
  device,
  selectedBoardKey,
  rankLimit,
  focusMode,
  loading,
  onTimeUnitChange,
  onGenderChange,
  onAgeChange,
  onDeviceChange,
  onBoardChange,
  onRankLimitChange,
  onFocusModeChange,
  onRefresh,
}: {
  timeUnit: NaverDatalabTimeUnit;
  gender: 'all' | NaverDatalabGender;
  age: string;
  device: 'all' | NaverDatalabDevice;
  selectedBoardKey: BoardFilterKey;
  rankLimit: string;
  focusMode: FocusMode;
  loading: boolean;
  onTimeUnitChange: (value: NaverDatalabTimeUnit) => void;
  onGenderChange: (value: 'all' | NaverDatalabGender) => void;
  onAgeChange: (value: string) => void;
  onDeviceChange: (value: 'all' | NaverDatalabDevice) => void;
  onBoardChange: (value: BoardFilterKey) => void;
  onRankLimitChange: (value: string) => void;
  onFocusModeChange: (value: FocusMode) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <LayoutGrid size={17} className="text-[#ff5a1f]" />
        <h2 className="text-sm font-black">분류 선택</h2>
        <span className="text-[11px] font-bold text-[var(--text-tertiary)]">보드와 검색어를 먼저 좁힙니다.</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {boardFilterOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onBoardChange(option.value)}
            className={cn(
              'min-h-14 rounded-lg border px-3 py-2 text-left transition',
              selectedBoardKey === option.value
                ? 'border-[#ff5a1f] bg-[#fff4ef] text-[#d94112]'
                : 'border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--surface)]',
            )}
          >
            <span className="block text-xs font-black">{option.label}</span>
            <span className="mt-1 block text-[10px] font-bold opacity-75">{option.caption}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target size={17} className="text-[var(--primary)]" />
            <h2 className="text-sm font-black">가져올 키워드 조건</h2>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#ff5a1f] px-4 text-xs font-black text-white transition hover:bg-[#ef4f18] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            검색
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <ControlField label="집계 단위">
            <SegmentedTimeUnit value={timeUnit} onChange={onTimeUnitChange} />
          </ControlField>
          <ControlField label="표시 순위">
            <FilterSelect value={rankLimit} options={rankLimitOptions} onChange={onRankLimitChange} />
          </ControlField>
          <ControlField label="소싱 초점">
            <FilterSelect
              value={focusMode}
              options={focusOptions.map((option) => ({ value: option.value, label: option.label }))}
              onChange={(value) => onFocusModeChange(value as FocusMode)}
            />
          </ControlField>
          <ControlField label="성별">
            <FilterSelect value={gender} options={genderOptions} onChange={(value) => onGenderChange(value as 'all' | NaverDatalabGender)} />
          </ControlField>
          <ControlField label="연령대">
            <FilterSelect value={age} options={ageOptions} onChange={onAgeChange} />
          </ControlField>
          <ControlField label="기기">
            <FilterSelect value={device} options={deviceOptions} onChange={(value) => onDeviceChange(value as 'all' | NaverDatalabDevice)} />
          </ControlField>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <CriterionChip icon={MousePointerClick} label="검색량" value="DataLab 순위 기반" />
          <CriterionChip icon={Boxes} label="상품수" value="Wing 보강 예정" muted />
          <CriterionChip icon={ShieldCheck} label="브랜드" value="포함 후 판단" muted />
          <CriterionChip icon={ArrowUpRight} label="다음 액션" value="오늘의 추천 검증" />
        </div>
      </div>
    </section>
  );
}

function ControlField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black text-[var(--text-tertiary)]">{label}</span>
      {children}
    </label>
  );
}

function CriterionChip({
  icon: Icon,
  label,
  value,
  muted = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-8 min-w-0 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-black',
        muted
          ? 'border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]'
          : 'border-[#ffd8c8] bg-[#fff7ed] text-[#d94112]',
      )}
    >
      <Icon size={13} className="shrink-0" />
      <span className="shrink-0">{label}</span>
      <span className="truncate font-bold opacity-75">{value}</span>
    </span>
  );
}

function SegmentedTimeUnit({ value, onChange }: { value: NaverDatalabTimeUnit; onChange: (value: NaverDatalabTimeUnit) => void }) {
  return (
    <div className="inline-flex h-11 w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
      {timeUnitOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'h-9 flex-1 rounded-md px-3 text-sm font-black transition',
            value === option.value ? 'bg-[var(--surface)] text-[#ff5a1f] shadow-sm' : 'text-[var(--text-secondary)]',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FilterSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-black text-[var(--text-secondary)] outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
