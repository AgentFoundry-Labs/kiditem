'use client';

import {
  useState,
  type ChangeEvent,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  ChevronDown,
  GraduationCap,
  ImagePlus,
  Images,
  Info,
  ListChecks,
  Loader2,
  Package,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn, formatTime } from '@/lib/utils';
import { moveSafetyLabelImagesToEnd } from '../lib/detail-page-image-order';
import { cropImageWhitespaceFile } from '../lib/image-whitespace-crop';
import type {
  BoxSetStatus,
  ColorVariantStatus,
  DetailImageCount,
  DetailPageAgeGroup,
  KcCertificationStatus,
  UsageSectionMode,
  DuplicateWorkspaceState,
} from '../hooks/useGenerateForm';

const MAX_IMAGES = 15;
const MAX_OPTIONS = 10;

interface ProductInputSectionProps {
  rawTitle: string;
  setRawTitle: (value: string) => void;
  rawCategory: string;
  setRawCategory: (value: string) => void;
  target: string;
  setTarget: (value: string) => void;
  ageGroup: DetailPageAgeGroup;
  setAgeGroup: (value: DetailPageAgeGroup) => void;
  detailImageCount: DetailImageCount;
  setDetailImageCount: (value: DetailImageCount) => void;
  usageSectionMode: UsageSectionMode;
  setUsageSectionMode: (value: UsageSectionMode) => void;
  kcCertificationStatus: KcCertificationStatus;
  setKcCertificationStatus: (value: KcCertificationStatus) => void;
  kcCertificationNumber: string;
  setKcCertificationNumber: (value: string) => void;
  rawDescription: string;
  setRawDescription: (value: string) => void;
  productSize: string;
  setProductSize: (value: string) => void;
  boxSetStatus: BoxSetStatus;
  setBoxSetStatus: (value: BoxSetStatus) => void;
  boxSetQuantity: string;
  setBoxSetQuantity: (value: string) => void;
  colorVariantStatus: ColorVariantStatus;
  setColorVariantStatus: (value: ColorVariantStatus) => void;
  colorVariantNames: string;
  setColorVariantNames: (value: string) => void;
  rawOptions: string;
  setRawOptions: (value: string) => void;
  images: string[];
  setImages: Dispatch<SetStateAction<string[]>>;
  imagesLoading?: boolean;
  isLoading: boolean;
  isFormValid: boolean;
  isPrefilling: boolean;
  duplicateWorkspace: DuplicateWorkspaceState;
  generationStartedAt: string | null;
  onPrefill: () => void;
  onDuplicateCheck: () => void;
  onLoadDuplicateLatest: () => void;
  onSubmit: () => void;
}

const TARGET_OPTIONS = [
  { value: '', label: 'AI 추천 타겟' },
  { value: '부모 구매자', label: '부모 구매자' },
  { value: '유아/미취학 아동', label: '유아/미취학 아동' },
  { value: '초등학생', label: '초등학생' },
  { value: '어린이집/유치원', label: '어린이집/유치원' },
  { value: '선물 구매자', label: '선물 구매자' },
];

const AGE_GROUP_OPTIONS: Array<{ value: DetailPageAgeGroup; label: string }> = [
  { value: 'age-8-plus', label: '8세 이상' },
  { value: 'age-14-plus', label: '14세 이상' },
];

const DETAIL_IMAGE_COUNT_OPTIONS: Array<{ value: DetailImageCount; label: string }> = [
  { value: '2', label: '2개' },
  { value: '3', label: '3개' },
  { value: '4', label: '4개' },
  { value: '5', label: '5개' },
  { value: '6', label: '6개' },
];

const USAGE_SECTION_OPTIONS: Array<{ value: UsageSectionMode; label: string }> = [
  { value: 'include', label: '포함' },
  { value: 'exclude', label: '안 만듦' },
];

export default function ProductInputSection({
  rawTitle,
  setRawTitle,
  rawCategory,
  setRawCategory,
  target,
  setTarget,
  ageGroup,
  setAgeGroup,
  detailImageCount,
  setDetailImageCount,
  usageSectionMode,
  setUsageSectionMode,
  kcCertificationStatus,
  setKcCertificationStatus,
  kcCertificationNumber,
  setKcCertificationNumber,
  rawDescription,
  setRawDescription,
  productSize,
  setProductSize,
  boxSetStatus,
  setBoxSetStatus,
  boxSetQuantity,
  setBoxSetQuantity,
  colorVariantStatus,
  setColorVariantStatus,
  colorVariantNames,
  setColorVariantNames,
  rawOptions,
  setRawOptions,
  images,
  setImages,
  imagesLoading,
  isLoading,
  isFormValid,
  isPrefilling,
  duplicateWorkspace,
  generationStartedAt,
  onPrefill,
  onDuplicateCheck,
  onLoadDuplicateLatest,
  onSubmit,
}: ProductInputSectionProps) {
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [optionDraft, setOptionDraft] = useState('');

  const options = splitOptions(rawOptions);
  const canPrefill = rawTitle.trim() !== '' && !isPrefilling && !isLoading;
  const canCheckDuplicate = rawTitle.trim() !== '' && duplicateWorkspace.status !== 'checking' && !isLoading;
  const sizeFields = parseSizeFields(productSize);
  const updateSizeField = (key: keyof ProductSizeFields, value: string) => {
    setProductSize(formatSizeFields({ ...sizeFields, [key]: value }));
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = e.target.files;
    if (!files) return;
    const slotsLeft = Math.max(0, MAX_IMAGES - images.length);
    const selectedFiles = Array.from(files).slice(0, slotsLeft);
    if (selectedFiles.length === 0) {
      input.value = '';
      return;
    }
    setUploadError(null);
    setUploadingCount(selectedFiles.length);
    try {
      const results = await Promise.allSettled(
        selectedFiles.map(async (file) => {
          const uploadFile = await cropImageWhitespaceFile(file).catch((err) => {
            console.warn('[generate] upload image whitespace crop failed, using original', err);
            return file;
          });
          const formData = new FormData();
          formData.append('file', uploadFile);
          const result = await apiClient.upload<{ url: string }>(
            '/api/ai/detail-page/images',
            formData,
          );
          return { name: file.name, url: result.url };
        }),
      );
      const uploaded: string[] = [];
      const failed: string[] = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') uploaded.push(r.value.url);
        else failed.push(selectedFiles[idx]?.name ?? `파일 ${idx + 1}`);
      });
      if (uploaded.length > 0) {
        setImages((prev) =>
          moveSafetyLabelImagesToEnd([...prev, ...uploaded]).slice(0, MAX_IMAGES),
        );
      }
      if (failed.length > 0) {
        setUploadError(
          `${failed.length}개 이미지 업로드 실패: ${failed.join(', ')}`,
        );
      }
    } finally {
      setUploadingCount(0);
      input.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const addOption = () => {
    const value = optionDraft.trim();
    if (!value || options.includes(value) || options.length >= MAX_OPTIONS) return;
    setRawOptions(joinOptions([...options, value]));
    setOptionDraft('');
  };

  const removeOption = (value: string) => {
    setRawOptions(joinOptions(options.filter((option) => option !== value)));
  };

  return (
    <section className="w-full max-w-[960px]">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-black text-[var(--text-primary)]">
            AI 상세페이지 생성
          </h1>
          <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
            상품 이미지와 핵심 정보를 바탕으로 상세페이지 카피와 구성을 자동 작성합니다.
          </p>
        </div>

        <div className="space-y-4">
          <Field label="상품명" required>
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative min-w-0 flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Package className="text-[var(--text-tertiary)]" size={17} />
                </div>
                <input
                  type="text"
                  value={rawTitle}
                  onChange={(e) => setRawTitle(e.target.value.replace(/[^\p{L}\p{N}\s]/gu, ''))}
                  placeholder="예: 휴대용목걸이비눗방울"
                  className="h-12 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] pl-9 pr-3 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
                />
              </div>
              <button
                type="button"
                onClick={onDuplicateCheck}
                disabled={!canCheckDuplicate}
                className={cn(
                  'inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-bold transition',
                  canCheckDuplicate
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'cursor-not-allowed border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text-muted)]',
                )}
              >
                {duplicateWorkspace.status === 'checking' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ListChecks size={16} />
                )}
                중복 확인
              </button>
              <button
                type="button"
                onClick={onPrefill}
                disabled={!canPrefill}
                className={cn(
                  'inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg border px-5 text-sm font-bold transition',
                  canPrefill
                    ? 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100'
                    : 'cursor-not-allowed border-[var(--border)] bg-[var(--surface-sunken)] text-[var(--text-muted)]',
                )}
              >
                {isPrefilling ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                AI로 내용 채우기
              </button>
            </div>
            {duplicateWorkspace.status === 'exists' && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                <span>같은 상품명의 기존 이력이 있습니다.</span>
                <button
                  type="button"
                  onClick={onLoadDuplicateLatest}
                  className="rounded-full bg-white px-3 py-1 font-black text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                >
                  최신 이력 불러오기
                </button>
              </div>
            )}
            {duplicateWorkspace.status === 'none' && (
              <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                같은 상품명의 기존 이력이 없습니다.
              </div>
            )}
            {duplicateWorkspace.status === 'loaded' && (
              <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">
                기존 최신 이력을 불러왔습니다.
              </div>
            )}
          </Field>

          <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
            <Field label="카테고리">
              <input
                type="text"
                value={rawCategory}
                onChange={(e) => setRawCategory(e.target.value)}
                placeholder="비워두면 AI가 자동으로 채워요"
                className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
              />
            </Field>
            <Field label="주요 타겟">
              <SelectField value={target} onChange={setTarget} options={TARGET_OPTIONS} />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
            <Field label="사용 연령">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-1">
                {AGE_GROUP_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAgeGroup(option.value)}
                    className={cn(
                      'inline-flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-black transition',
                      ageGroup === option.value
                        ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm ring-1 ring-[var(--border)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    <GraduationCap size={15} />
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="사용법 영역">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-1">
                {USAGE_SECTION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setUsageSectionMode(option.value)}
                    className={cn(
                      'inline-flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-black transition',
                      usageSectionMode === option.value
                        ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm ring-1 ring-[var(--border)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    <ListChecks size={15} />
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="DETAIL 이미지 수">
              <div className="relative">
                <Images
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
                />
                <select
                  value={detailImageCount}
                  onChange={(e) => setDetailImageCount(e.target.value as DetailImageCount)}
                  className="h-11 w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-9 text-sm font-bold text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)]"
                >
                  {DETAIL_IMAGE_COUNT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
                />
              </div>
            </Field>
          </div>

          <Field label="KC 인증번호">
            <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
              <SelectField
                value={kcCertificationStatus}
                onChange={(value) => setKcCertificationStatus(value as KcCertificationStatus)}
                options={[
                  { value: 'unknown', label: 'AI가 판단' },
                  { value: 'none', label: '없음' },
                  { value: 'exists', label: '있음' },
                ]}
              />
              <div className="relative">
                <ShieldCheck
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
                />
                <input
                  type="text"
                  value={kcCertificationNumber}
                  onChange={(e) => setKcCertificationNumber(e.target.value)}
                  placeholder="예: CB061R1234-1001"
                  disabled={kcCertificationStatus === 'none'}
                  className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] pl-9 pr-3 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          </Field>

          <Field label="제품 주요 특징">
            <textarea
              value={rawDescription}
              onChange={(e) => setRawDescription(e.target.value)}
              rows={5}
              placeholder="비워두면 AI가 채워요. 핵심 특징을 직접 적어도 됩니다."
              className="min-h-[132px] w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
            />
          </Field>

          <Field label="제품 사이즈">
            <div className="grid gap-3 md:grid-cols-3">
              <SizeInput
                label="높이"
                value={sizeFields.height}
                onChange={(value) => updateSizeField('height', value)}
                placeholder="예: 80mm"
              />
              <SizeInput
                label="가로"
                value={sizeFields.width}
                onChange={(value) => updateSizeField('width', value)}
                placeholder="예: 45mm"
              />
              <SizeInput
                label="폭"
                value={sizeFields.depth}
                onChange={(value) => updateSizeField('depth', value)}
                placeholder="예: 40mm"
              />
            </div>
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="색상 구성">
              <div className="grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
                <SelectField
                  value={colorVariantStatus}
                  onChange={(value) => setColorVariantStatus(value as ColorVariantStatus)}
                  options={[
                    { value: 'auto', label: 'AI가 이미지로 판단' },
                    { value: 'none', label: '색상 없음' },
                    { value: 'single', label: '단일 색상' },
                    { value: 'multiple', label: '여러 색상' },
                  ]}
                />
                <input
                  type="text"
                  value={colorVariantNames}
                  onChange={(e) => setColorVariantNames(e.target.value)}
                  placeholder="색상명 예: 핑크 / 화이트"
                  disabled={colorVariantStatus === 'none'}
                  className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </Field>

            <Field label="박스/세트 구분">
              <div className="grid gap-3 md:grid-cols-[1fr_0.7fr]">
                <SelectField
                  value={boxSetStatus}
                  onChange={(value) => setBoxSetStatus(value as BoxSetStatus)}
                  options={[
                    { value: 'auto', label: 'AI가 이미지로 판단' },
                    { value: 'none', label: '없음' },
                    { value: 'box', label: '박스 있음' },
                    { value: 'set', label: '세트 있음' },
                  ]}
                />
                <input
                  type="text"
                  value={boxSetQuantity}
                  onChange={(e) => setBoxSetQuantity(e.target.value)}
                  placeholder="수량 예: 박스 12 / 세트 2"
                  disabled={boxSetStatus === 'none'}
                  className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </Field>
          </div>

          <Field label="상품 이미지" required trailing={`필수 · ${images.length} / ${MAX_IMAGES}`}>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] p-3">
              <div className="flex h-[116px] gap-3 overflow-x-auto pb-1">
                <label
                  className={cn(
                    'relative flex h-[104px] w-[104px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]',
                    images.length >= MAX_IMAGES || uploadingCount > 0
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer',
                  )}
                >
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    disabled={images.length >= MAX_IMAGES || uploadingCount > 0}
                  />
                  {uploadingCount > 0 ? (
                    <Loader2 size={22} className="animate-spin" />
                  ) : (
                    <ImagePlus size={24} />
                  )}
                  <span className="text-[11px] font-bold">
                    {uploadingCount > 0 ? `${uploadingCount}장 업로드` : '이미지 추가'}
                  </span>
                </label>

                {images.map((img, idx) => (
                  <div
                    key={`${img}-${idx}`}
                    className="group relative h-[104px] w-[104px] shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
                  >
                    <img
                      src={img}
                      alt={`상품 이미지 ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                      aria-label="이미지 삭제"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}

                {images.length === 0 && (
                  <div className="flex h-[104px] min-w-[220px] items-center text-xs font-medium text-[var(--text-muted)]">
                    상세페이지 생성에는 상품 이미지가 최소 1장 필요합니다.
                  </div>
                )}
              </div>
            </div>
          </Field>

          <Field label="옵션(종류)" trailing={`${options.length} / ${MAX_OPTIONS}`}>
            <div className="space-y-3">
              <div className="flex gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2">
                <Plus className="mt-1 shrink-0 text-[var(--text-tertiary)]" size={16} />
                <input
                  type="text"
                  value={optionDraft}
                  onChange={(e) => setOptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder="예: 노란색"
                  className="h-8 min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={addOption}
                  disabled={!optionDraft.trim() || options.length >= MAX_OPTIONS}
                  className="h-8 rounded-full bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] ring-1 ring-[var(--border)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  추가
                </button>
              </div>
              {options.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {options.map((option) => (
                    <span
                      key={option}
                      className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] ring-1 ring-[var(--border)]"
                    >
                      {option}
                      <button
                        type="button"
                        onClick={() => removeOption(option)}
                        className="rounded-full text-[var(--text-tertiary)] hover:text-red-500"
                        aria-label={`${option} 옵션 삭제`}
                      >
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Field>
        </div>

        {uploadError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {uploadError}
          </div>
        )}

        {imagesLoading && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
            <Loader2 size={14} className="animate-spin" />
            허브 이미지를 불러오는 중...
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col items-center text-center">
        <div className="mb-3 flex w-full max-w-[520px] items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left shadow-sm">
          <Info className="mt-0.5 shrink-0 text-[var(--primary)]" size={16} />
          <p className="text-xs font-semibold leading-5 text-[var(--text-secondary)]">
            생성 전 고지: 색상·디자인은 랜덤 출고될 수 있고 이미지와 구성품은 실제와 다를 수 있습니다.
            사용법 영역은 생성 옵션 기준으로 포함하거나 숨길 수 있고, KC/바코드 이미지는 하단 안전표시로 분리됩니다.
          </p>
        </div>
        {isLoading && generationStartedAt && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[var(--surface)] px-4 py-1.5 text-xs font-bold text-[var(--text-secondary)] shadow-sm ring-1 ring-[var(--border)]">
            <Loader2 size={13} className="animate-spin" />
            생성 시작 {formatTime(generationStartedAt, { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={isLoading || !isFormValid || uploadingCount > 0}
          className={cn(
            'inline-flex h-12 w-full max-w-[300px] items-center justify-center gap-2 rounded-full text-base font-bold text-white shadow-sm transition active:scale-[0.99]',
            isLoading || !isFormValid || uploadingCount > 0
              ? 'cursor-not-allowed bg-[var(--text-muted)] opacity-60'
              : 'bg-neutral-950 hover:bg-neutral-800',
          )}
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              요청 등록 중
            </>
          ) : uploadingCount > 0 ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              이미지 업로드 중
            </>
          ) : (
            <>
              <Sparkles size={18} />
              초안 생성
            </>
          )}
        </button>
        <p className="mt-2 text-xs font-medium text-[var(--text-tertiary)]">
          완료되면 알림에서 에디터로 이동할 수 있습니다.
        </p>
      </div>
    </section>
  );
}

interface FieldProps {
  label: string;
  required?: boolean;
  trailing?: string;
  children: ReactNode;
}

function Field({ label, required, trailing, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="block text-sm font-bold text-[var(--text-primary)]">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
        {trailing && (
          <span className="text-xs font-bold text-[var(--text-tertiary)]">{trailing}</span>
        )}
      </div>
      {children}
    </div>
  );
}

interface SelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

function SelectField({ value, onChange, options }: SelectFieldProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 pr-9 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
      />
    </div>
  );
}

interface ProductSizeFields {
  height: string;
  width: string;
  depth: string;
}

interface SizeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

function SizeInput({ label, value, onChange, placeholder }: SizeInputProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black text-[var(--text-secondary)]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--primary)]"
      />
    </label>
  );
}

function parseSizeFields(value: string): ProductSizeFields {
  const text = value.trim();
  const pick = (labels: string[]): string => {
    const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const match = text.match(new RegExp(`(?:${escaped.join('|')})\\s*[:：]?\\s*([^,，/\\n]+)`, 'i'));
    return match?.[1]?.trim() ?? '';
  };
  return {
    height: pick(['높이', '세로', 'height', 'h']),
    width: pick(['가로', '너비', 'width', 'w']),
    depth: pick(['폭', '두께', 'depth', 'd']),
  };
}

function formatSizeFields(fields: ProductSizeFields): string {
  return [
    fields.height.trim() ? `높이: ${fields.height.trim()}` : '',
    fields.width.trim() ? `가로: ${fields.width.trim()}` : '',
    fields.depth.trim() ? `폭: ${fields.depth.trim()}` : '',
  ].filter(Boolean).join('\n');
}

function splitOptions(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_OPTIONS);
}

function joinOptions(options: string[]): string {
  return options.join('\n');
}
