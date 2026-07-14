import { type ReactNode } from 'react';
import type { ProductBasics } from '@/app/(product-pipeline)/product-pipeline/collected-products/lib/sourcing-api';
import { cn, formatDateTime } from '@/lib/utils';
import {
  parseMoney,
  type BasicDraft,
} from '../../../lib/basic-draft';
import TagEditor from '../detail/TagEditor';
import { KcImageField } from './KcImageField';
import { RocketPricingSection } from './RocketPricingSection';
import type { ProductEditState } from '../../../lib/product-workspace-types';

export {
  basicDraftFrom,
  productBasicsInputFromDraft,
  type BasicDraft,
} from '../../../lib/basic-draft';

interface ProductBasicsTabProps {
  editData: ProductEditState;
  basicInfo: ProductBasics | null;
  nameLength: number;
  isEditing: boolean;
  draft: BasicDraft;
  onDraftChange: (field: keyof BasicDraft, value: string) => void;
  onDraftTagsChange: (tags: string[]) => void;
  /** 보기 모드에서 KC 인증 이미지를 즉시 저장. 미제공 시 보기 모드 업로드는 draft 만 갱신. */
  onCommitKcImage?: (value: string) => void;
  /** KC 인증 이미지 즉시 저장 진행 중 여부. */
  isKcImageSaving?: boolean;
  /** 위안화 원가(소싱 후보). 로켓 마진 계산의 단가 원가 자동 환산에 사용. */
  costCny?: number | null;
  selectedRegistrationThumbnailUrl?: string | null;
  selectedDetailPageGenerationId?: string | null;
  selectedDetailPageSummary?: SelectedDetailPageSummary | null;
  readOnly?: boolean;
}

export default function ProductBasicsTab({
  editData,
  basicInfo,
  nameLength,
  isEditing,
  draft,
  onDraftChange,
  onDraftTagsChange,
  onCommitKcImage,
  isKcImageSaving = false,
  costCny,
  selectedRegistrationThumbnailUrl,
  selectedDetailPageGenerationId,
  selectedDetailPageSummary,
  readOnly = false,
}: ProductBasicsTabProps) {
  const registrationThumbnailUrl =
    selectedRegistrationThumbnailUrl === undefined
      ? basicInfo?.selectedThumbnailUrl ?? null
      : selectedRegistrationThumbnailUrl;
  const registrationDetailPageGenerationId =
    selectedDetailPageGenerationId === undefined
      ? basicInfo?.selectedDetailPageGenerationId ?? null
      : selectedDetailPageGenerationId;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <SectionHeader
          title="상품 정보"
          description="상품 생성 또는 수집 데이터에서 등록에 사용할 상품 사실만 정리합니다."
        />
        <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          <InfoRow label="상품명">
            {isEditing ? (
              <div className="grid gap-1">
                <input
                  aria-label="상품명"
                  value={draft.name}
                  maxLength={100}
                  onChange={(event) => onDraftChange('name', event.target.value)}
                  className="h-9 w-full rounded-md border border-emerald-200 bg-emerald-50/30 px-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10"
                />
                <span className={cn('text-right text-xs font-bold', draft.name.length > 100 ? 'text-red-500' : 'text-slate-400')}>
                  {draft.name.length}/100자
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <InfoValue value={draft.name} />
                <span className={cn('shrink-0 text-xs font-bold', nameLength > 100 ? 'text-red-500' : 'text-slate-400')}>
                  {nameLength}/100자
                </span>
              </div>
            )}
          </InfoRow>
          <InfoRow label="카테고리">
            {isEditing ? (
              <input
                aria-label="카테고리"
                value={draft.category}
                placeholder="미입력"
                onChange={(event) => onDraftChange('category', event.target.value)}
                className={fieldClassName}
              />
            ) : (
              <InfoValue value={draft.category} />
            )}
          </InfoRow>
          <InfoRow label="검색 키워드">
            {isEditing ? (
              <input
                aria-label="검색 키워드"
                value={draft.keywords}
                placeholder="쉼표로 구분"
                onChange={(event) => onDraftChange('keywords', event.target.value)}
                className={fieldClassName}
              />
            ) : (
              <InfoValue value={draft.keywords} />
            )}
          </InfoRow>
          <InfoRow label="판매 기준가">
            {isEditing ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <MoneyInput
                  label="판매가"
                  value={draft.salePrice}
                  onChange={(value) => onDraftChange('salePrice', value)}
                />
                <MoneyInput
                  label="정상가"
                  value={draft.originalPrice}
                  onChange={(value) => onDraftChange('originalPrice', value)}
                />
                <MoneyInput
                  label="할인율"
                  value={draft.discountRate}
                  suffix="%"
                  onChange={(value) => onDraftChange('discountRate', value)}
                />
              </div>
            ) : (
              <InlineValueList
                items={[
                  ['판매가', moneyDisplayValue(draft.salePrice)],
                  ['정상가', moneyDisplayValue(draft.originalPrice)],
                  ['할인율', percentDisplayValue(draft.discountRate)],
                ]}
              />
            )}
          </InfoRow>
          <InfoRow label="상품 설명">
            {isEditing ? (
              <textarea
                aria-label="상품 설명"
                value={draft.description}
                rows={3}
                placeholder="미입력"
                onChange={(event) => onDraftChange('description', event.target.value)}
                className="min-h-[84px] w-full resize-none rounded-md border border-emerald-200 bg-emerald-50/30 px-2 py-1 text-sm font-semibold leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/10"
              />
            ) : (
              <DescriptionValue value={draft.description} />
            )}
          </InfoRow>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <SectionHeader
          title="등록 콘텐츠"
          description="상품 등록에 사용할 대표 썸네일과 상세페이지 버전입니다."
        />
        <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          <InfoRow label="등록 대표 썸네일">
            {registrationThumbnailUrl ? (
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={registrationThumbnailUrl}
                  alt="등록 대표 썸네일"
                  className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-slate-50 object-cover"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">대표 이미지 선택됨</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    썸네일 탭에서 등록 대표 이미지를 변경할 수 있습니다.
                  </p>
                </div>
              </div>
            ) : (
              <ContentMissingLabel title="대표 썸네일 미선택" />
            )}
          </InfoRow>
          <InfoRow label="등록 상세페이지">
            {registrationDetailPageGenerationId ? (
              <SelectedDetailPageCard summary={selectedDetailPageSummary} />
            ) : (
              <ContentMissingLabel title="상세페이지 미선택" />
            )}
          </InfoRow>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <SectionHeader title="상품 속성" />
        <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          <InfoRow label="주요 타겟">
            {isEditing ? (
              <input
                aria-label="주요 타겟"
                value={draft.target}
                placeholder="미입력"
                onChange={(event) => onDraftChange('target', event.target.value)}
                className={fieldClassName}
              />
            ) : (
              <InfoValue value={draft.target} />
            )}
          </InfoRow>
          <InfoRow label="사용 연령">
            {isEditing ? (
              <select
                aria-label="사용 연령"
                value={draft.ageGroup}
                onChange={(event) => onDraftChange('ageGroup', event.target.value)}
                className={fieldClassName}
              >
                <option value="">미입력</option>
                <option value="age-8-plus">8세 이상</option>
                <option value="age-14-plus">14세 이상</option>
              </select>
            ) : (
              <InfoValue value={ageGroupLabel(draft.ageGroup)} />
            )}
          </InfoRow>
          <InfoRow label="KC 인증">
            {isEditing ? (
              <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
                <select
                  aria-label="KC 인증 상태"
                  value={draft.kcCertificationStatus}
                  onChange={(event) => onDraftChange('kcCertificationStatus', event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">미입력</option>
                  <option value="unknown">확인 필요</option>
                  <option value="none">없음</option>
                  <option value="exists">있음</option>
                </select>
                <input
                  aria-label="KC 인증번호"
                  value={draft.kcCertificationNumber}
                  placeholder="예: CB061R1234-1001"
                  disabled={draft.kcCertificationStatus === 'none'}
                  onChange={(event) => onDraftChange('kcCertificationNumber', event.target.value)}
                  className={fieldClassName}
                />
              </div>
            ) : (
              <InlineValueList
                items={[
                  ['상태', kcStatusLabel(draft.kcCertificationStatus)],
                  ['인증번호', draft.kcCertificationNumber || '미입력'],
                ]}
              />
            )}
          </InfoRow>
          <InfoRow label="KC 인증 이미지">
            <KcImageField
              value={draft.kcCertificationImageUrl}
              busy={!isEditing && isKcImageSaving}
              readOnly={readOnly}
              onChange={(value) => {
                if (isEditing) {
                  onDraftChange('kcCertificationImageUrl', value);
                } else {
                  onCommitKcImage?.(value);
                }
              }}
            />
          </InfoRow>
          <InfoRow label="제품 사이즈">
            {isEditing ? (
              <input
                aria-label="제품 사이즈"
                value={draft.productSize}
                placeholder="미입력"
                onChange={(event) => onDraftChange('productSize', event.target.value)}
                className={fieldClassName}
              />
            ) : (
              <InfoValue value={draft.productSize} />
            )}
          </InfoRow>
          <InfoRow label="색상 구성">
            {isEditing ? (
              <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
                <select
                  aria-label="색상 구성 상태"
                  value={draft.colorVariantStatus}
                  onChange={(event) => onDraftChange('colorVariantStatus', event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">미입력</option>
                  <option value="auto">AI 판단</option>
                  <option value="none">색상 없음</option>
                  <option value="single">단일 색상</option>
                  <option value="multiple">여러 색상</option>
                </select>
                <input
                  aria-label="색상명"
                  value={draft.colorVariantNames}
                  placeholder="예: 핑크, 화이트"
                  disabled={draft.colorVariantStatus === 'none'}
                  onChange={(event) => onDraftChange('colorVariantNames', event.target.value)}
                  className={fieldClassName}
                />
              </div>
            ) : (
              <InlineValueList
                items={[
                  ['구성', colorStatusLabel(draft.colorVariantStatus)],
                  ['색상명', draft.colorVariantNames || '미입력'],
                ]}
              />
            )}
          </InfoRow>
          <InfoRow label="박스/세트">
            {isEditing ? (
              <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
                <select
                  aria-label="박스/세트 상태"
                  value={draft.boxSetStatus}
                  onChange={(event) => onDraftChange('boxSetStatus', event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">미입력</option>
                  <option value="auto">AI 판단</option>
                  <option value="none">없음</option>
                  <option value="box">박스 있음</option>
                  <option value="set">세트 있음</option>
                </select>
                <input
                  aria-label="박스/세트 수량"
                  value={draft.boxSetQuantity}
                  placeholder="예: 1박스"
                  disabled={draft.boxSetStatus === 'none'}
                  onChange={(event) => onDraftChange('boxSetQuantity', event.target.value)}
                  className={fieldClassName}
                />
              </div>
            ) : (
              <InlineValueList
                items={[
                  ['상태', boxStatusLabel(draft.boxSetStatus)],
                  ['수량', draft.boxSetQuantity || '미입력'],
                ]}
              />
            )}
          </InfoRow>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <SectionHeader
          title="쿠팡 로켓 가격"
          description="소비자가(판매가) 기준으로 로켓 판매가·공급가·마진율을 계산합니다."
        />
        <div className="mt-4">
          <RocketPricingSection
            consumerPrice={parseMoney(draft.salePrice)}
            quantity={draft.rocketBundleQuantity}
            unitCost={draft.rocketUnitCost}
            costCny={costCny}
            isEditing={isEditing}
            onQuantityChange={(value) => onDraftChange('rocketBundleQuantity', value)}
            onUnitCostChange={(value) => onDraftChange('rocketUnitCost', value)}
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <SectionHeader title="옵션과 검색 정보" />
        <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          <InfoRow label="옵션명">
            {isEditing ? (
              <input
                aria-label="옵션명"
                value={draft.optionNames}
                placeholder="쉼표로 구분"
                onChange={(event) => onDraftChange('optionNames', event.target.value)}
                className={fieldClassName}
              />
            ) : (
              <InfoValue value={draft.optionNames} />
            )}
          </InfoRow>
          <InfoRow label="태그">
            {isEditing ? (
              <TagEditor tags={draft.tags} onTagsChange={onDraftTagsChange} />
            ) : (
              <InfoValue value={draft.tags.join(', ')} />
            )}
          </InfoRow>
        </div>
      </section>

      {editData.features.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <SectionHeader title="상품 특징" />
          <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {editData.features.map((feature) => (
              <InfoRow key={feature.title} label={feature.title}>
                <p className="text-sm leading-6 text-slate-700">{feature.description}</p>
              </InfoRow>
            ))}
          </div>
        </section>
      )}

      {editData.productInfo.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <SectionHeader title="상품정보제공공시" />
          <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {editData.productInfo.map((item) => (
              <InfoRow key={item.key} label={item.key}>
                <InfoValue value={item.value} />
              </InfoRow>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export interface SelectedDetailPageSummary {
  id: string;
  title: string;
  templateLabel: string;
  createdAt: string;
  status: string;
}

const fieldClassName =
  'h-9 w-full rounded-md border border-transparent bg-transparent px-0 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:bg-emerald-50/40 focus:px-2 focus:ring-2 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:text-slate-400';

function MoneyInput({
  label,
  value,
  suffix = '원',
  onChange,
}: {
  label: string;
  value: string;
  suffix?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
      <span className="shrink-0 text-[11px] font-black text-slate-500">{label}</span>
      <input
        aria-label={label}
        inputMode="numeric"
        value={value}
        placeholder="0"
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ''))}
        className="h-7 min-w-0 flex-1 bg-transparent text-right text-sm font-bold text-slate-900 outline-none placeholder:text-slate-300"
      />
      <span className="shrink-0 text-[11px] font-bold text-slate-400">{suffix}</span>
    </label>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h2 className="text-base font-black text-slate-900">{title}</h2>
      {description && (
        <p className="mt-1 text-xs font-semibold text-slate-500">{description}</p>
      )}
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function InfoValue({ value }: { value?: string | null }) {
  const display = value?.trim();
  return (
    <div className={cn('text-sm font-semibold', display ? 'text-slate-900' : 'text-slate-400')}>
      {display || '미입력'}
    </div>
  );
}

function DescriptionValue({ value }: { value?: string | null }) {
  const lines = descriptionDisplayLines(value);
  if (lines.length === 0) {
    return <InfoValue value={null} />;
  }
  return (
    <div className="space-y-1 text-sm font-semibold leading-6 text-slate-900">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

function descriptionDisplayLines(value?: string | null): string[] {
  const display = value?.trim();
  if (!display) return [];
  return display
    .replace(/\s+(?=\d+\.\s)/g, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function InlineValueList({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="flex min-h-8 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5"
        >
          <span className="text-[11px] font-black text-slate-500">{label}</span>
          <span className={cn('text-xs font-bold', value === '미입력' ? 'text-slate-400' : 'text-slate-900')}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ContentMissingLabel({ title }: { title: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-400">{title}</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-400">
        등록 전에 작업 탭에서 사용할 콘텐츠를 선택해 주세요.
      </p>
    </div>
  );
}

function SelectedDetailPageCard({
  summary,
}: {
  summary?: SelectedDetailPageSummary | null;
}) {
  if (!summary) {
    return (
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">상세페이지 버전 선택됨</p>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">
          상세페이지 탭에서 등록 상세페이지 버전을 확인하거나 변경할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
          등록 상세
        </span>
        <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">
          {summary.templateLabel}
        </span>
      </div>
      <p className="line-clamp-2 text-sm font-bold text-slate-900" title={summary.title}>
        {summary.title}
      </p>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        {formatDateTime(new Date(summary.createdAt))}
      </p>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        상세페이지 탭에서 버전을 확인하거나 변경할 수 있습니다.
      </p>
    </div>
  );
}

function moneyDisplayValue(value: string): string {
  const amount = parseMoney(value);
  return amount > 0 ? `${amount.toLocaleString('ko-KR')}원` : '미입력';
}

function percentDisplayValue(value: string): string {
  const amount = parseMoney(value);
  return amount > 0 ? `${amount}%` : '미입력';
}

function ageGroupLabel(value: string): string {
  if (value === 'age-8-plus') return '8세 이상';
  if (value === 'age-14-plus') return '14세 이상';
  return '';
}

function kcStatusLabel(value: string): string {
  if (value === 'unknown') return '확인 필요';
  if (value === 'none') return '없음';
  if (value === 'exists') return '있음';
  return '미입력';
}

function colorStatusLabel(value: string): string {
  if (value === 'auto') return 'AI 판단';
  if (value === 'none') return '색상 없음';
  if (value === 'single') return '단일 색상';
  if (value === 'multiple') return '여러 색상';
  return '미입력';
}

function boxStatusLabel(value: string): string {
  if (value === 'auto') return 'AI 판단';
  if (value === 'none') return '없음';
  if (value === 'box') return '박스 있음';
  if (value === 'set') return '세트 있음';
  return '미입력';
}
