import type { MasterImageRole } from '@/lib/hub-roles';

export type SlotKind = 'product' | 'packaging' | 'color_variant' | 'bundle_item' | 'reference';
export type SlotSource = 'upload' | 'hub' | 'prev-gen' | 'other-product';

export interface Slot {
  id: string;
  kind: SlotKind;
  label: string;
  role: MasterImageRole;
  value: string | null;
  source: SlotSource | null;
  sourceProductId?: string;
}

let slotCounter = 0;
function genSlotId(prefix: string): string {
  slotCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${slotCounter.toString(36)}`;
}

const KIND_DEFAULTS: Record<SlotKind, { role: MasterImageRole; labelFn: (index?: number) => string }> = {
  product: { role: 'product', labelFn: () => 'Main product' },
  packaging: { role: 'box', labelFn: () => 'Packaging' },
  color_variant: { role: 'color_variant', labelFn: (i = 0) => `Color variant ${i + 1}` },
  bundle_item: { role: 'product', labelFn: (i = 0) => `Product ${String.fromCharCode(65 + i)}` },
  reference: { role: 'detail', labelFn: () => 'Style reference' },
};

export interface MakeSlotOpts {
  value?: string | null;
  source?: SlotSource | null;
  index?: number;
  sourceProductId?: string;
  label?: string;
}

export function makeSlot(kind: SlotKind, opts: MakeSlotOpts = {}): Slot {
  const def = KIND_DEFAULTS[kind];
  return {
    id: genSlotId(kind),
    kind,
    role: def.role,
    label: opts.label ?? def.labelFn(opts.index),
    value: opts.value ?? null,
    source: opts.source ?? null,
    sourceProductId: opts.sourceProductId,
  };
}

export type EditorModeLite = 'edit' | 'creative';
export type EditCaseLite = 'compose' | 'color-variants' | 'single' | 'bundle' | null;

export interface BuildInitialSlotsCtx {
  initialProductImage?: string | null;
  sceneType?: string;
  /**
   * 편집기 진입 시 URL 의 productId. bundle 케이스에서 첫 슬롯의 owner 로 박힘 →
   * single → bundle promote 시에도 "이 상품" 이 결과물 저장 기준으로 유지된다.
   */
  ownerProductId?: string | null;
}

export function buildInitialSlots(
  mode: EditorModeLite,
  editCase: EditCaseLite,
  ctx: BuildInitialSlotsCtx = {},
): Slot[] {
  const hasInitialImage = !!ctx.initialProductImage;
  const productSeed = hasInitialImage
    ? makeSlot('product', { value: ctx.initialProductImage!, source: 'upload' })
    : makeSlot('product');

  if (mode === 'creative') {
    return [productSeed, makeSlot('reference')];
  }

  switch (editCase) {
    case 'compose':
      return [productSeed, makeSlot('packaging')];
    case 'single':
      return [productSeed];
    case 'color-variants':
      // single → color-variants promote 시 기존 product 이미지 carry-over.
      // 사용자가 single 에서 로드한 이미지는 곧 첫 색상 variant 로 자연스럽게 이전.
      if (hasInitialImage) {
        return [
          makeSlot('color_variant', {
            value: ctx.initialProductImage!,
            source: 'upload',
            index: 0,
          }),
          makeSlot('color_variant', { index: 1 }),
        ];
      }
      return [makeSlot('color_variant', { index: 0 }), makeSlot('color_variant', { index: 1 })];
    case 'bundle':
      // single → bundle promote 시 기존 product 이미지 carry-over.
      // sourceProductId 는 편집기 진입 productId — 결과 저장 기준이 일관되게 유지된다.
      if (hasInitialImage) {
        return [
          makeSlot('bundle_item', {
            value: ctx.initialProductImage!,
            source: 'upload',
            sourceProductId: ctx.ownerProductId ?? undefined,
            index: 0,
          }),
          makeSlot('bundle_item', { index: 1 }),
        ];
      }
      return [makeSlot('bundle_item', { index: 0 }), makeSlot('bundle_item', { index: 1 })];
    case null:
    default:
      return hasInitialImage ? [productSeed] : [];
  }
}

export function selectProductValue(slots: Slot[]): string | null {
  return slots.find((s) => s.kind === 'product')?.value ?? null;
}
export function selectPackagingValue(slots: Slot[]): string | null {
  return slots.find((s) => s.kind === 'packaging')?.value ?? null;
}
export function selectColorValues(slots: Slot[]): string[] {
  return slots.filter((s) => s.kind === 'color_variant' && s.value).map((s) => s.value as string);
}
export function selectReferenceValue(slots: Slot[]): string | null {
  return slots.find((s) => s.kind === 'reference')?.value ?? null;
}
export function selectBundleImages(slots: Slot[]): string[] {
  return slots.filter((s) => s.kind === 'bundle_item' && s.value).map((s) => s.value as string);
}
export function selectBundleLabels(slots: Slot[]): string[] {
  return slots.filter((s) => s.kind === 'bundle_item' && s.value).map((s) => s.label);
}
export function selectBundleOwnerProductId(slots: Slot[]): string | undefined {
  return slots.find((s) => s.kind === 'bundle_item' && s.value)?.sourceProductId;
}

export function setFirstSlotValueByKind(
  slots: Slot[],
  kind: SlotKind,
  value: string | null,
  source: SlotSource = 'upload',
): Slot[] {
  const idx = slots.findIndex((s) => s.kind === kind);
  if (idx === -1) {
    return [...slots, makeSlot(kind, { value, source: value ? source : null })];
  }
  const next = slots.slice();
  next[idx] = {
    ...next[idx],
    value,
    source: value ? source : null,
  };
  return next;
}

export function replaceSlotsByKind(slots: Slot[], kind: SlotKind, values: string[]): Slot[] {
  const others = slots.filter((s) => s.kind !== kind);
  const fresh = values.map((v, i) => makeSlot(kind, { value: v, source: 'upload', index: i }));
  return [...others, ...fresh];
}

function relabelGroup(slots: Slot[], kind: SlotKind): Slot[] {
  const def = KIND_DEFAULTS[kind];
  let i = 0;
  return slots.map((s) => {
    if (s.kind !== kind) return s;
    const next = { ...s, label: def.labelFn(i) };
    i += 1;
    return next;
  });
}

export function setSlotValueById(
  slots: Slot[],
  id: string,
  value: string | null,
  source: SlotSource = 'upload',
): Slot[] {
  const idx = slots.findIndex((s) => s.id === id);
  if (idx === -1) return slots;
  const next = slots.slice();
  next[idx] = { ...next[idx], value, source: value ? source : null };
  return next;
}

export function setSlotFromOtherProduct(
  slots: Slot[],
  id: string,
  value: string,
  sourceProductId: string,
): Slot[] {
  const idx = slots.findIndex((s) => s.id === id);
  if (idx === -1) return slots;
  const next = slots.slice();
  next[idx] = { ...next[idx], value, source: 'other-product', sourceProductId };
  return next;
}

export function removeSlotById(slots: Slot[], id: string): Slot[] {
  const removed = slots.find((s) => s.id === id);
  const filtered = slots.filter((s) => s.id !== id);
  if (!removed) return filtered;
  return relabelGroup(filtered, removed.kind);
}

export function clearSlotValueById(slots: Slot[], id: string): Slot[] {
  return setSlotValueById(slots, id, null);
}

export function addToGroup(
  slots: Slot[],
  kind: SlotKind,
  values: string[] = [],
  source: SlotSource = 'upload',
): Slot[] {
  const next =
    values.length > 0
      ? [...slots, ...values.map((v) => makeSlot(kind, { value: v, source }))]
      : [...slots, makeSlot(kind)];
  return relabelGroup(next, kind);
}

export interface SlotPick {
  value: string;
  source: SlotSource;
  sourceProductId?: string;
}

export function applyPickToSlot(slots: Slot[], id: string, pick: SlotPick): Slot[] {
  const idx = slots.findIndex((s) => s.id === id);
  if (idx === -1) return slots;
  const next = slots.slice();
  next[idx] = {
    ...next[idx],
    value: pick.value,
    source: pick.source,
    sourceProductId: pick.sourceProductId,
  };
  return next;
}

export function addPicksToGroup(slots: Slot[], kind: SlotKind, picks: SlotPick[]): Slot[] {
  if (picks.length === 0) return slots;
  const fresh = picks.map((p) =>
    makeSlot(kind, { value: p.value, source: p.source, sourceProductId: p.sourceProductId }),
  );
  return relabelGroup([...slots, ...fresh], kind);
}

export function countByKind(slots: Slot[], kind: SlotKind): number {
  return slots.filter((s) => s.kind === kind).length;
}

/**
 * 현재 슬롯 구성 → 백엔드 프롬프트 라우팅 키로 자동 분류.
 *
 * 우선순위: bundle_item > color_variant > packaging > (기본) single
 * 하나의 editCase 만 active. UI 엔트리가 "자동 정리" 단일 버튼이라도
 * 사용자가 어떤 종류 이미지를 추가했나 보고 자동으로 맞는 프롬프트로 간다.
 *
 * 분류용 Gemini API 콜 불필요 — 이미 사용자가 슬롯에 kind 태깅하면서 정보 제공.
 */
export function pickCaseFromSlots(slots: Slot[]): 'compose' | 'color-variants' | 'single' | 'bundle' {
  const hasBundle = slots.some((s) => s.kind === 'bundle_item' && s.value);
  if (hasBundle) return 'bundle';
  const hasColor = slots.some((s) => s.kind === 'color_variant' && s.value);
  if (hasColor) return 'color-variants';
  const hasPackaging = slots.some((s) => s.kind === 'packaging' && s.value);
  if (hasPackaging) return 'compose';
  return 'single';
}

export type LayoutKindLite = 'auto' | 'fan' | 'arch' | 'grid' | 'stack' | 'radial';

export interface SlotsDtoExtras {
  productId?: string | null;
  supplementaryLabel?: string;
  pieceCount?: number | null;
  purpose: 'compliance' | 'quality';
  mode: EditorModeLite;
  userPrompt?: string;
  sceneType?: string;
  styleType?: string;
  productDescription?: string;
  productImageOverride?: string | null;
  /** 배치 프리셋 — 여러 낱개 합성 시 구도 강제. 'auto' 또는 미지정이면 모델 자율. */
  layout?: LayoutKindLite | null;
}

export interface GenerateDto {
  productId?: string;
  productImage?: string;
  packagingImage?: string;
  supplementaryLabel?: string;
  colorImages?: string[];
  bundleImages?: string[];
  bundleLabels?: string[];
  pieceCount?: number;
  backgroundReference?: string;
  purpose: 'compliance' | 'quality';
  mode?: EditorModeLite;
  userPrompt?: string;
  sceneType?: string;
  styleType?: string;
  productDescription?: string;
  /** 배치 프리셋 (auto/fan/grid/...) — 백엔드 ThumbnailEditorDto.layout 과 동일 값 */
  layout?: LayoutKindLite;
}

export function slotsToDto(slots: Slot[], editCase: EditCaseLite, extras: SlotsDtoExtras): GenerateDto {
  const {
    mode,
    purpose,
    productId,
    supplementaryLabel,
    pieceCount,
    userPrompt,
    sceneType,
    styleType,
    productDescription,
    productImageOverride,
    layout,
  } = extras;

  const productValue = productImageOverride ?? selectProductValue(slots);
  const packagingValue = selectPackagingValue(slots);
  const colorValues = selectColorValues(slots);
  const referenceValue = selectReferenceValue(slots);
  const bundleValues = selectBundleImages(slots);
  const bundleLabels = selectBundleLabels(slots);
  const bundleOwner = selectBundleOwnerProductId(slots);

  const isBundle = editCase === 'bundle';

  return {
    productId: (isBundle ? bundleOwner : productId) ?? undefined,
    productImage: isBundle ? undefined : productValue ?? undefined,
    packagingImage: isBundle ? undefined : packagingValue ?? undefined,
    supplementaryLabel: editCase === 'compose' ? supplementaryLabel : undefined,
    colorImages: editCase === 'color-variants' ? colorValues : undefined,
    bundleImages: isBundle ? bundleValues : undefined,
    bundleLabels: isBundle ? bundleLabels : undefined,
    pieceCount: pieceCount ?? undefined,
    backgroundReference: referenceValue ?? undefined,
    purpose,
    mode,
    userPrompt: userPrompt || undefined,
    sceneType: mode === 'creative' ? sceneType : undefined,
    styleType: mode === 'creative' ? styleType : undefined,
    productDescription: mode === 'creative' ? productDescription || undefined : undefined,
    layout: layout && layout !== 'auto' ? layout : undefined,
  };
}
