/**
 * 몰 등록 폼 명세와 폼 지시 검사(옛 `mall-form-register.js` SPECS 모양·`normalizeForm` 이식, KID-256). 몰마다 다른 것은
 * `sites/<mall>/registration.ts`의 명세 한 덩어리뿐이고 채우는 절차(`form-register.ts`)는 같다. 명세의 칸 대부분은 페이지
 * 처리기(`content/page-call/form-fill.js`)에 그대로 넘어가므로 여기서는 런타임이 직접 읽는 칸만 타입을 둔다.
 *
 * 제출: 몰 명세에는 [등록] 누르기(`submit`)가 없다 — 몰 17곳은 채우기만 하고 폼을 사람에게 남긴다(ADR-0019, KID-364
 * 2026-09-27 정정). 누르기는 Wing 명세만 갖는다.
 */
import { RuntimeError } from '../../core/errors';

export const RUNTIME_PLAN_INVALID = 'RUNTIME_PLAN_INVALID' as const;

/** 파일 칸 하나(여러 칸 몰). */
export interface ImageSlotSpec {
  key: string;
  label: string;
  selector?: string;
  [key: string]: unknown;
}

/** 전용 페이지 처리기로 채우는 몰(신세계·스마트스토어·GS샵·롯데ON·카카오)의 값 묶음. */
export interface DedicatedFormSpec {
  /** 페이지 처리기 파일(`content/page-call/<mall>-register.js`)과 호출 이름. */
  file: string;
  call: string;
  /** 사진 묶음 키(`form.imageGroups[key]`). */
  imageGroupKey: string;
  /** 폼 지시에서 이 몰 값 묶음을 읽는 키(`form.ssg` 등)와 검사. 페이지 처리기에 그대로 넘어간다. */
  formKey: string;
  normalize(raw: unknown): Record<string, unknown>;
  /** 페이지 처리기에 함께 넘길 명세 값(최대 장수·기다림). */
  options: Record<string, unknown>;
}

export interface MallFormSpec {
  label: string;
  origin: string;
  pathPrefix: string;
  formSelector: string;
  /** 주소 규칙: 경로가 정확히 같아야(수정·복사 화면 거절), 쿼리 금지(수정 화면), 해시 라우트. */
  exactPath?: boolean;
  noQuery?: boolean;
  hash?: string;
  imageSlots?: readonly string[];
  imageFileInput?: { label: string; selector?: string; [key: string]: unknown };
  imageFileInputs?: readonly ImageSlotSpec[];
  imageDialogs?: readonly ImageSlotSpec[];
  imageRepeat?: { groupKey: string; label: string; [key: string]: unknown };
  imageUpload?: { groupKey: string; label: string; [key: string]: unknown };
  sectionImages?: { groupKey: string; label: string; [key: string]: unknown };
  tableForm?: { images?: ReadonlyArray<{ key: string; row: string; [key: string]: unknown }>; [key: string]: unknown };
  detailSelfUpload?: Record<string, unknown>;
  detailHost?: 'kidsnote' | 'onch';
  detailParagraph?: boolean;
  /** 팝업 에디터로 상세를 넣는 몰(도매꾹). */
  detailEditor?: Record<string, unknown>;
  /** 폼이 다른 도메인 iframe에 있는 몰(떠리몰): 그 프레임 주소 조각. 모든 프레임에 넣는 몰(11번가)은 `allFrames`. */
  allFrames?: boolean;
  frameUrlIncludes?: string;
  frameWaitMs?: number;
  readySelector?: string;
  formWaitMs?: number;
  multiForm?: boolean;
  dedicated?: DedicatedFormSpec;
  /** 페이지 처리기에만 넘어가는 나머지 칸(분류 고르기·고시·에디터 …). */
  [key: string]: unknown;
}

/** 검사를 통과한 폼 지시(옛 `normalizeForm` 결과 모양 그대로 — 페이지 처리기가 이 이름을 읽는다). */
export interface NormalizedForm {
  url: string;
  fields: Record<string, string>;
  radios: Record<string, string>;
  checks: Record<string, boolean>;
  multiFormFields: Record<string, Record<string, string>>;
  multiFormRadios: Record<string, Record<string, unknown>>;
  multiFormChecks: Record<string, Record<string, unknown>>;
  category: { code: string; path: string } | null;
  notice: { itemCode: string; safeYn: 'Y' | 'N'; rows: Array<{ title: string; value: string }>; radios: Record<string, string> } | null;
  fileUploads: Array<{ name: string; url: string }>;
  detailHtmlTarget: string;
  promoHtml: string;
  selectorChecks: Record<string, boolean>;
  categoryPaths: string[][];
  imageUrls: string[];
  imageGroups: Record<string, string[]>;
  selectorFields: Record<string, string>;
  rowFields: Record<string, string>;
  sectionFields: Record<string, string>;
  sectionRadios: Record<string, string>;
  sectionDropdowns: Record<string, string>;
  optionalSections: string[];
  sectionCategory: { query: string; path: string } | null;
  rowOptions: Record<string, string>;
  tableFields: Record<string, string>;
  tableRadios: Record<string, string>;
  tableSelects: Record<string, string>;
  tablePicks: Array<{ row: string; query: string; pick: string }>;
  groups: Record<string, string[]>;
  infoRows: Record<string, string>;
  detailUploads: Array<{ url: string; [key: string]: unknown }>;
  manualSteps: string[];
  /** 전용 처리기 몰의 값 묶음. */
  dedicated: Record<string, unknown> | null;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const entries = (value: unknown): Array<[string, unknown]> => (isObject(value) ? Object.entries(value) : []);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** 값이 null·undefined인 칸은 빼고 글자로 바꾼 맵. */
function textMap(value: unknown, keepEmptyKey = true): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of entries(value)) {
    if ((!keepEmptyKey && !key) || entry === null || entry === undefined) continue;
    out[key] = String(entry);
  }
  return out;
}

/** 폼 지시가 그 몰의 등록 주소를 가리키는지 본다. 임의 페이지에 값을 넣지 않게 하는 문지기다. */
export function assertRegisterUrl(spec: MallFormSpec, value: unknown): string {
  const invalid = (suffix = '') => new RuntimeError(RUNTIME_PLAN_INVALID, `${spec.label} 상품등록 주소가 아닙니다.${suffix}`, { reason: 'register_url' });
  let url: URL;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw invalid();
  }
  if (url.origin !== spec.origin || !url.pathname.startsWith(spec.pathPrefix)) throw invalid();
  if (spec.exactPath && url.pathname.replace(/\/+$/, '') !== spec.pathPrefix) throw invalid();
  // 등록과 수정이 같은 주소를 쓰는 몰(신세계)은 쿼리가 붙은 주소를 수정 화면으로 본다.
  if (spec.noQuery && url.search) throw invalid(' 기존 상품 수정 화면에는 채우지 않습니다.');
  // 해시 라우트 몰(스마트스토어)은 문서가 하나다. 해시가 등록 화면이 아니면 수정·목록 화면이다.
  if (spec.hash && (url.pathname !== spec.pathPrefix || url.hash !== spec.hash)) throw invalid(' 기존 상품 수정 화면에는 채우지 않습니다.');
  return url.toString();
}

/** 옛 `normalizeForm` 그대로: 모르는 칸은 버리고 값은 글자로 굳힌다. */
export function normalizeForm(spec: MallFormSpec, value: unknown): NormalizedForm {
  if (!isObject(value)) throw new RuntimeError(RUNTIME_PLAN_INVALID, '폼 데이터가 없습니다.', { reason: 'form_missing' });
  const url = assertRegisterUrl(spec, value.url);

  const fields: Record<string, string> = {};
  for (const [name, fieldValue] of entries(value.fields)) {
    if (!name) continue;
    fields[name] = fieldValue === null || fieldValue === undefined ? '' : String(fieldValue);
  }
  const radios: Record<string, string> = {};
  for (const [name, radioValue] of entries(value.radios)) if (name) radios[name] = String(radioValue);
  // 체크박스는 두 모양을 받는다. 키즈노트는 이름 배열, 도매꾹은 이름→불리언 맵이다.
  const checks: Record<string, boolean> = {};
  if (Array.isArray(value.checks)) {
    for (const name of value.checks) if (typeof name === 'string') checks[name] = true;
  } else {
    for (const [name, on] of entries(value.checks)) checks[name] = Boolean(on);
  }

  // 폼이 여럿인 몰(아이스크림몰)은 폼 id 까지 받는다.
  const multiFormFields: Record<string, Record<string, string>> = {};
  const multiFormRadios: Record<string, Record<string, unknown>> = {};
  const multiFormChecks: Record<string, Record<string, unknown>> = {};
  if (spec.multiForm) {
    for (const [formId, values] of entries(value.formFields)) {
      if (!isObject(values)) continue;
      const box: Record<string, string> = {};
      for (const [name, raw] of Object.entries(values)) if (name) box[name] = raw == null ? '' : String(raw);
      if (Object.keys(box).length > 0) multiFormFields[formId] = box;
    }
    for (const [formId, values] of entries(value.formRadios)) if (isObject(values)) multiFormRadios[formId] = { ...values };
    for (const [formId, values] of entries(value.formChecks)) if (isObject(values)) multiFormChecks[formId] = { ...values };
  }
  const category = isObject(value.category)
    ? { code: String(value.category.code ?? ''), path: String(value.category.path ?? '') }
    : null;
  const rawNotice = value.notice;
  const notice = isObject(rawNotice)
    ? {
      itemCode: String(rawNotice.itemCode ?? ''),
      safeYn: rawNotice.safeCertiTgtYn === 'Y' ? 'Y' as const : 'N' as const,
      rows: list(rawNotice.rows)
        .filter((row): row is Json => isObject(row) && typeof row.title === 'string' && row.title !== '')
        .map((row) => ({ title: row.title as string, value: row.value == null ? '' : String(row.value) })),
      radios: {
        ...(rawNotice.kcCertified ? { '072': String(rawNotice.kcCertified) } : {}),
        ...(rawNotice.safeCertiTgtYn ? { safeCertiTgtYn: String(rawNotice.safeCertiTgtYn) } : {}),
      },
    }
    : null;

  const slotNames = spec.imageSlots ?? [];
  const slots = new Set(slotNames);
  const fileUploads = list(value.fileUploads)
    .filter((entry): entry is { name: string; url: string } => isObject(entry) && slots.has(String(entry.name)) && typeof entry.url === 'string')
    .map((entry) => ({ name: entry.name, url: entry.url }));
  const imageUploads = list(value.imageUploads)
    .filter((entry): entry is { url: string } => isObject(entry) && typeof entry.url === 'string')
    .map((entry, index) => ({ name: slotNames[index] ?? '', url: entry.url }))
    .filter((entry) => entry.name);

  const imageGroups: Record<string, string[]> = {};
  for (const [key, group] of entries(value.imageGroups)) {
    if (Array.isArray(group)) imageGroups[key] = group.filter((url): url is string => typeof url === 'string' && url !== '');
  }
  // 칸 하나(`multiple`)에 대표·추가를 한 번에 넣는 몰(ESM Plus). 빌더는 `images` 한 줄로 보낸다 — 그룹으로 옮겨 두지
  // 않으면 사진을 아예 내려받지 않는다(아이스크림몰에서 같은 실수로 사진이 통째로 빠졌다).
  if (spec.sectionImages && Array.isArray(value.images)) {
    const images = value.images.filter((url): url is string => typeof url === 'string' && url !== '');
    if (images.length > 0) imageGroups[spec.sectionImages.groupKey] = images;
  }

  const selectorChecks: Record<string, boolean> = {};
  for (const [key, on] of entries(value.selectorChecks)) selectorChecks[key] = Boolean(on);
  const groups: Record<string, string[]> = {};
  for (const [key, group] of entries(value.groups)) {
    if (Array.isArray(group)) groups[key] = group.map((entry) => String(entry ?? '')).filter(Boolean);
  }

  const dedicated = spec.dedicated ? spec.dedicated.normalize(value[spec.dedicated.formKey]) : null;

  return {
    url,
    fields,
    radios,
    checks,
    multiFormFields,
    multiFormRadios,
    multiFormChecks,
    category,
    notice,
    fileUploads: fileUploads.length > 0 ? fileUploads : imageUploads,
    detailHtmlTarget: typeof value.detailHtmlTarget === 'string' ? value.detailHtmlTarget : '',
    promoHtml: typeof value.promoHtml === 'string' ? value.promoHtml : '',
    selectorChecks,
    categoryPaths: list(value.categoryPaths)
      .filter((path): path is unknown[] => Array.isArray(path) && path.length > 0)
      .map((path) => path.map((part) => String(part))),
    imageUrls: list(value.imageUrls).map((url) => (typeof url === 'string' ? url : '')),
    imageGroups,
    selectorFields: textMap(value.selectorFields),
    rowFields: textMap(value.rowFields),
    sectionFields: textMap(value.sectionFields),
    sectionRadios: textMap(value.sectionRadios),
    sectionDropdowns: textMap(value.sectionDropdowns),
    optionalSections: list(value.optionalSections).filter((title): title is string => typeof title === 'string' && title !== ''),
    sectionCategory: isObject(value.category) && typeof value.category.path === 'string' && value.category.path
      ? { query: String(value.category.query ?? ''), path: value.category.path }
      : null,
    rowOptions: textMap(value.rowOptions),
    tableFields: textMap(value.tableFields, false),
    tableRadios: textMap(value.tableRadios, false),
    tableSelects: textMap(value.tableSelects, false),
    tablePicks: list(value.tablePicks)
      .filter((entry): entry is Json => isObject(entry) && typeof entry.row === 'string' && entry.row !== '' && typeof entry.pick === 'string' && entry.pick !== '')
      .map((entry) => ({
        row: entry.row as string,
        query: typeof entry.query === 'string' && entry.query ? entry.query : (entry.pick as string),
        pick: entry.pick as string,
      })),
    groups,
    infoRows: textMap(value.infoRows, false),
    detailUploads: list(value.detailUploads).filter((entry): entry is { url: string } => isObject(entry) && typeof entry.url === 'string'),
    manualSteps: list(value.manualSteps).filter((step): step is string => typeof step === 'string'),
    dedicated,
  };
}
