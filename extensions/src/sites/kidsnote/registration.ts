import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { RUNTIME_PLAN_INVALID } from '../mall-write/form';
import { FORM_FILL_FILE, REGISTRATION_FILL_FAILED } from '../mall-write/form-register';
import { registrationGuard } from '../mall-write/guard';
import { toDataUrls } from '../mall-write/images';
import { asRaw, planInvalid, requireRaw } from '../mall-write/raw';
import { registerMallWriter, type MallFill, type MallWriteContext } from '../mall-write/writer';
import { callPage } from '../page-call';
import { DIALOG_GUARD_FILE, type TabPage } from '../tab-page';
import { KIDSNOTE_LOGIN, KIDSNOTE_PAGE_GUARD } from './index';

export const KIDSNOTE_REGISTER_FILE = 'content/page-call/kidsnote-register.js';
const REGISTER_ORIGIN = 'https://shop.kidsnote.com';
const REGISTER_PATH = '/_manage/';
const REGISTER_BODY = 'product@product_register';
/** 파일 칸 셋(실측). 다른 칸에는 넣지 않는다. */
const IMAGE_SLOTS = new Set(['upfile1', 'upfile2', 'upfile3']);
const FILL_TIMEOUT_MS = 120_000;

/** 키즈노트 상품등록 화면(`/_manage/?body=product@product_register`)만. */
export function isKidsnoteRegisterUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  return url.origin === REGISTER_ORIGIN && url.pathname === REGISTER_PATH && url.searchParams.get('body') === REGISTER_BODY;
}

export interface KidsnoteForm {
  url: string;
  fields: Record<string, string>;
  checks: string[];
  radios: Record<string, string>;
  fileUploads: Array<{ name: string; url: string }>;
  detailUploads: Array<{ url: string }>;
  detailHtmlTarget: string;
  manualSteps: string[];
}

/** 폼 지시가 우리가 만든 모양인지 본다(옛 `normalizeForm`). 임의 페이지에 임의 값을 넣지 않게 하는 문지기다. */
export function normalizeKidsnoteForm(value: unknown): KidsnoteForm {
  const raw = requireRaw(value, '폼 데이터가 없습니다.');
  if (!isKidsnoteRegisterUrl(raw.url)) throw planInvalid('키즈노트 상품등록 주소가 아닙니다.');
  if (raw.formId !== 'prdFrm') throw planInvalid('알 수 없는 폼입니다.');
  const fields: Record<string, string> = {};
  for (const [name, fieldValue] of Object.entries(asRaw(raw.fields))) {
    if (name) fields[name] = fieldValue === null || fieldValue === undefined ? '' : String(fieldValue);
  }
  const radios: Record<string, string> = {};
  for (const [name, radioValue] of Object.entries(asRaw(raw.radios))) if (name) radios[name] = String(radioValue);
  const list = (entry: unknown) => (Array.isArray(entry) ? entry : []);
  return {
    url: String(raw.url).trim(),
    fields,
    checks: list(raw.checks).filter((name): name is string => typeof name === 'string'),
    radios,
    fileUploads: list(raw.fileUploads)
      .map(asRaw)
      .filter((entry) => IMAGE_SLOTS.has(String(entry.name)) && typeof entry.url === 'string')
      .map((entry) => ({ name: String(entry.name), url: String(entry.url) })),
    // 상세설명 이미지는 몰 호스팅에 올린 뒤 그 주소로 HTML을 만든다.
    detailUploads: list(raw.detailUploads).map(asRaw).filter((entry) => typeof entry.url === 'string').map((entry) => ({ url: String(entry.url) })),
    detailHtmlTarget: typeof raw.detailHtmlTarget === 'string' ? raw.detailHtmlTarget : '',
    manualSteps: list(raw.manualSteps).filter((step): step is string => typeof step === 'string'),
  };
}

type PageFill = { ok?: boolean; noForm?: boolean; steps?: string[]; warnings?: string[]; dialogs?: string[]; error?: string };

/**
 * 키즈노트 채우기(옛 `register()`): 서비스워커가 사진·상세 사진을 data URL로 읽고(못 읽은 것은 경고), 쓰기 탭에서 페이지
 * 처리기로 채운다. 폼이 없으면 로그인 문턱이 그 탭에서 로그인하고 다시 채운다. 상품 폼은 보내지 않는다.
 */
async function fillKidsnote(context: MallWriteContext, page: TabPage, input: { form: Record<string, unknown> }): Promise<{ fill: MallFill; providerAccountId: string | null }> {
  const form = normalizeKidsnoteForm(input.form);
  const loaded = await toDataUrls(context.fetch, form.fileUploads);
  const detail = await toDataUrls(context.fetch, form.detailUploads.map((entry, index) => ({ name: `detail${index + 1}`, url: entry.url })));
  const failures = [
    ...loaded.filter((image) => image.error).map((image) => `이미지 다운로드 실패 — ${image.name}: ${image.error}`),
    ...detail.filter((image) => image.error).map((image) => `상세 이미지 다운로드 실패 — ${image.name}: ${image.error}`),
  ];
  const outcome = await callPage<PageFill>(page, 'kidsnote.fill', {
    ...form,
    images: loaded.filter((image) => image.dataUrl),
    detailImages: detail.filter((image) => image.dataUrl),
  }, {
    timeoutMs: FILL_TIMEOUT_MS,
    guard: context.guard,
    main: [DIALOG_GUARD_FILE, FORM_FILL_FILE, KIDSNOTE_REGISTER_FILE],
    displayName: context.displayName,
  });
  if (outcome?.ok !== true) {
    if (outcome?.noForm) throw new RuntimeError(SITE_LOGIN_REQUIRED, context.guard.loginMessage, { url: form.url, reason: 'no_form' });
    throw new RuntimeError(REGISTRATION_FILL_FAILED, outcome?.error ?? '키즈노트 상품등록 폼을 채우지 못했습니다.', { mallKey: 'kidsnote', steps: outcome?.steps ?? [] });
  }
  return {
    fill: { steps: outcome.steps ?? [], warnings: [...failures, ...(outcome.warnings ?? [])], manualSteps: form.manualSteps, dialogs: outcome.dialogs ?? [] },
    providerAccountId: null,
  };
}

registerMallWriter({
  mallKey: 'kidsnote',
  displayName: '키즈노트',
  guard: registrationGuard(KIDSNOTE_PAGE_GUARD, '키즈노트'),
  dialogHosts: ['shop.kidsnote.com'],
  login: KIDSNOTE_LOGIN,
  custom: {
    url: (input) => {
      if (input.executionKind !== 'register') {
        throw new RuntimeError(RUNTIME_PLAN_INVALID, '키즈노트는 기존 상품 수정 화면 채우기를 지원하지 않습니다.', { mallKey: 'kidsnote', executionKind: input.executionKind });
      }
      const raw = asRaw(input.form);
      if (!isKidsnoteRegisterUrl(raw.url)) throw new RuntimeError(RUNTIME_PLAN_INVALID, '키즈노트 상품등록 주소가 아닙니다.', { reason: 'register_url' });
      return String(raw.url).trim();
    },
    fill: fillKidsnote,
  },
});
