import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { callPage } from '../page-call';
import { DIALOG_GUARD_FILE, type TabPage } from '../tab-page';
import type { MallFormSpec, NormalizedForm } from './form';
import { DETAIL_HOSTS, DetailHostLoginError, detailImageHtml, hostDetailImage, isMallReadable, toDataUrls, type LoadedImage } from './images';
import type { MallFill, MallWriteContext } from './writer';

/**
 * 몰 등록 폼 채우기 절차(옛 `mall-form-register.js` `register()` 이식, KID-256). 몰마다 다른 것은 명세(`MallFormSpec`)뿐이다.
 *  1. 서비스워커가 사진을 data URL로 읽고, 상세 사진이 몰이 못 읽는 주소면 첨부 저장소에 먼저 올린다(탭을 열기 전).
 *  2. 쓰기 탭에서 페이지 처리기(`content/page-call/form-fill.js`, 전용 몰은 `<mall>-register.js`)로 채운다. 폼이 iframe에
 *     있는 몰은 그 프레임이 가라앉을 때까지 기다리고 폼이 있는 프레임에서만 채운다.
 *  3. 팝업 에디터 몰(도매꾹)은 채운 뒤 상세를 에디터로 넣는다.
 * [등록]은 누르지 않는다 — 몰 명세에는 검증된 누르기가 없다(ADR-0019, `submit-gate.ts`).
 */
export const FORM_FILL_FILE = 'content/page-call/form-fill.js';
export const FORM_FRAME_FILE = 'content/page-call/form-frame.js';
export const REGISTRATION_FILL_FAILED = 'REGISTRATION_FILL_FAILED' as const;
/** 사진 내려받기·화면 로딩·동적 고시 칸 생성까지(옛 `FILL_TIMEOUT_MS`). */
const FILL_TIMEOUT_MS = 120_000;
const STATE_TIMEOUT_MS = 5_000;

/** 탭을 열기 전에 준비한 값(사진·상세). */
export interface PreparedForm {
  form: NormalizedForm;
  images: LoadedImage[];
  imageGroups: Record<string, LoadedImage[]>;
  repImage: LoadedImage | null;
  detailImage: LoadedImage | null;
  detailHtml: string;
  warnings: string[];
}

/** 페이지 처리기의 답(옛 모양). `noForm`: 이 문서에 등록 폼이 없다(대개 로그인이 풀렸거나 다른 프레임). */
interface PageFill {
  ok?: boolean;
  noForm?: boolean;
  steps?: string[];
  warnings?: string[];
  dialogs?: string[];
  error?: string;
}

/** 서비스워커가 먼저 할 일: 사진·상세 준비. 못 읽은 것은 경고로 남긴다 — 빠진 채로 "채웠다"고 하지 않는다. */
export async function prepareMallForm(context: Pick<MallWriteContext, 'fetch'>, spec: MallFormSpec, form: NormalizedForm): Promise<PreparedForm> {
  const warnings: string[] = [];
  const uploaded = await toDataUrls(context.fetch, form.fileUploads);
  const images = uploaded.filter((image) => image.dataUrl);
  for (const image of uploaded.filter((entry) => entry.error)) warnings.push(`이미지 ${image.name}: ${image.error}`);

  // 상세설명은 몰이 읽을 수 있는 주소여야 한다. 우리 렌더 산출물은 로컬 MinIO라 그대로 넣으면 구매자에게 빈 상세가 보인다.
  const detailWarnings: string[] = [];
  const host = spec.detailHost ? DETAIL_HOSTS[spec.detailHost] ?? null : null;
  let detailUrl = form.detailUploads.find((entry) => isMallReadable(entry.url))?.url ?? '';
  if (!detailUrl && form.detailUploads.length > 0 && host) {
    try {
      detailUrl = await hostDetailImage(context.fetch, host, form.detailUploads[0]!.url);
    } catch (error) {
      detailWarnings.push(
        error instanceof DetailHostLoginError && host.loginLabel
          ? `상세 이미지를 올리지 못했습니다 — ${host.loginLabel}에 로그인되어 있지 않습니다. ${host.loginLabel}에 로그인한 뒤 다시 채우세요.`
          : `${host.label}에 상세설명을 올리지 못했습니다: ${error instanceof Error ? error.message : String(error)}. 화면에서 직접 올리세요.`,
      );
    }
  } else if (!detailUrl && form.detailUploads.length > 0 && !spec.detailSelfUpload) {
    detailWarnings.push('상세설명 이미지가 몰이 읽을 수 있는 주소가 아닙니다. 화면에서 직접 올리세요.');
  }
  const detailHtml = detailUrl ? detailImageHtml(detailUrl, Boolean(spec.detailParagraph)) : '';

  // 몰이 자기 서버에 받아 주는 사진(파일 칸·몰 업로더)은 data URL로 건넨다.
  const imageGroups: Record<string, LoadedImage[]> = {};
  const slotSpecs = [
    ...(spec.imageFileInputs ?? []),
    ...(spec.imageDialogs ?? []),
    ...(spec.imageRepeat ? [{ key: spec.imageRepeat.groupKey, label: spec.imageRepeat.label }] : []),
    ...(spec.imageUpload ? [{ key: spec.imageUpload.groupKey, label: spec.imageUpload.label }] : []),
    ...(spec.sectionImages ? [{ key: spec.sectionImages.groupKey, label: spec.sectionImages.label }] : []),
    ...(spec.tableForm?.images ?? []).map((slot) => ({ key: slot.key, label: slot.row })),
    ...(spec.dedicated ? [{ key: spec.dedicated.imageGroupKey, label: '상품이미지' }] : []),
  ];
  for (const slot of slotSpecs) {
    const urls = form.imageGroups[slot.key] ?? [];
    if (urls.length === 0) continue;
    const loaded = await toDataUrls(context.fetch, urls.map((url, index) => ({ name: `${slot.key}${index}`, url })));
    for (const bad of loaded.filter((image) => image.error)) warnings.push(`${slot.label} 이미지를 읽지 못했습니다: ${bad.error}`);
    const ok = loaded.filter((image) => image.dataUrl);
    if (ok.length > 0) imageGroups[slot.key] = ok;
  }
  let repImage: LoadedImage | null = null;
  if (spec.imageFileInput && form.imageUrls[0]) {
    const [image] = await toDataUrls(context.fetch, [{ name: 'rep', url: form.imageUrls[0] }]);
    if (image?.dataUrl) repImage = image;
    else warnings.push(`대표이미지를 읽지 못했습니다: ${image?.error ?? '알 수 없음'}`);
  }
  let detailImage: LoadedImage | null = null;
  if (spec.detailSelfUpload && form.detailUploads[0]) {
    const [image] = await toDataUrls(context.fetch, [{ name: 'detail', url: form.detailUploads[0].url }]);
    if (image?.dataUrl) detailImage = image;
    else warnings.push(`상세설명 이미지를 읽지 못했습니다: ${image?.error ?? '알 수 없음'}`);
  }
  return { form, images, imageGroups, repImage, detailImage, detailHtml, warnings: [...warnings, ...detailWarnings] };
}

/** 페이지 처리기 인자(옛 `executeScript` args 그대로). */
export function fillPayload(spec: MallFormSpec, prepared: PreparedForm): { call: string; files: string[]; payload: Record<string, unknown> } {
  const { form, imageGroups, repImage, detailImage, detailHtml } = prepared;
  if (spec.dedicated) {
    return {
      call: spec.dedicated.call,
      files: [spec.dedicated.file],
      payload: {
        form: form.dedicated,
        images: imageGroups[spec.dedicated.imageGroupKey] ?? [],
        ...spec.dedicated.options,
        detailImage,
        detailHtml,
      },
    };
  }
  const editor = spec.detailEditor ?? null;
  const sectionForm = spec.sectionForm as Record<string, unknown> | undefined;
  return {
    call: 'mallForm.fill',
    files: [],
    payload: {
      formSelector: spec.formSelector,
      dynamic: spec.dynamic,
      acceptRecommendation: spec.acceptRecommendation ?? null,
      groupInputs: spec.groupInputs ?? [],
      groups: form.groups,
      selectorChecks: spec.selectorChecks ?? [],
      selectorCheckValues: form.selectorChecks,
      selectorFields: spec.selectorFields ?? [],
      selectorFieldValues: form.selectorFields,
      selectFirstOptions: spec.selectFirstOptions ?? [],
      wizardSteps: spec.wizardSteps ?? [],
      detailRich: spec.detailRich ?? null,
      categoryPicker: spec.categoryPicker ?? null,
      categoryPaths: form.categoryPaths,
      imageFileInput: spec.imageFileInput ?? null,
      repImage,
      detailSelfUpload: spec.detailSelfUpload ?? null,
      detailImage,
      categorySearch: spec.categorySearch ?? null,
      categoryFirst: Boolean(spec.categoryFirst),
      categoryConnect: spec.categoryConnect ?? null,
      rowFields: spec.rowFields ?? [],
      rowFieldValues: form.rowFields,
      rowOptions: spec.rowOptions ?? [],
      rowOptionValues: form.rowOptions,
      detailSelector: spec.detailSelector ?? '',
      detailPreviewSelector: spec.detailPreviewSelector ?? '',
      imageFileInputs: spec.imageFileInputs ?? [],
      imageRepeat: spec.imageRepeat ?? null,
      imageDialogs: spec.imageDialogs ?? [],
      imageUpload: spec.imageUpload ?? null,
      imageGroups,
      fields: form.fields,
      radios: form.radios,
      checks: form.checks,
      images: prepared.images,
      // 팝업 에디터 몰은 칸에 직접 쓰지 않는다. 폼을 채운 뒤 버튼을 눌러서 넣는다.
      detailHtmlTarget: editor ? '' : form.detailHtmlTarget,
      detailHtml: editor ? '' : detailHtml,
      multiFormFields: form.multiFormFields,
      multiFormRadios: form.multiFormRadios,
      multiFormChecks: form.multiFormChecks,
      categoryFields: spec.categoryFields ?? null,
      categoryCode: form.category?.code ?? '',
      categoryPath: form.category?.path ?? '',
      noticeSection: spec.noticeSection ?? null,
      noticeItemCode: form.notice?.itemCode ?? '',
      noticeSafeYn: form.notice?.safeYn ?? 'N',
      noticeRows: form.notice?.rows ?? [],
      noticeRadios: form.notice?.radios ?? {},
      detailSmartEditor: spec.detailSmartEditor ?? null,
      // 섹션 제목이 유일한 손잡이인 몰(ESM Plus). 스펙 네 조각을 한 덩어리로 묶어 넘긴다.
      sectionLayout: sectionForm
        ? { ...sectionForm, category: spec.sectionCategory ?? null, detail: spec.sectionDetail ?? null, images: spec.sectionImages ?? null }
        : null,
      sectionFields: form.sectionFields,
      sectionRadios: form.sectionRadios,
      sectionDropdowns: form.sectionDropdowns,
      sectionCategory: form.sectionCategory,
      optionalSections: form.optionalSections,
      dismissDialogs: spec.dismissDialogs ?? null,
      formWaitMs: spec.formWaitMs ?? 0,
      readySelector: spec.readySelector ?? '',
      preRadios: spec.preRadios ?? [],
      afterSelectorClicks: spec.afterSelectorClicks ?? [],
      infoRows: spec.infoRows ?? null,
      fireKeyup: Boolean(spec.fireKeyup),
      infoRowValues: form.infoRows,
      tableForm: spec.tableForm ?? null,
      tableFields: form.tableFields,
      tableRadios: form.tableRadios,
      tableSelects: form.tableSelects,
      tablePicks: form.tablePicks,
      frameUrlIncludes: spec.frameUrlIncludes ?? '',
    },
  };
}

/**
 * 폼이 다른 도메인 iframe에 있는 몰(떠리몰): 그 프레임이 붙고 **가라앉을 때까지**(칸이 그려진 같은 문서가 2초 그대로)
 * 기다린다 — 붙은 뒤에도 한 번 더 다시 붙는다(라이브 실측 2026-09-11: 6.9초에 붙고 10.7초에 다시).
 */
async function waitForFormFrame(context: MallWriteContext, page: TabPage, spec: MallFormSpec): Promise<void> {
  if (!spec.frameUrlIncludes) return;
  const until = context.now() + (spec.frameWaitMs ?? 30_000);
  let lastDoc: number | null = null;
  let steady = 0;
  while (context.now() < until && steady < 2) {
    const frame = (await frameStates(page)).find((entry) => entry.href.includes(spec.frameUrlIncludes!)) ?? null;
    const ready = frame ? await readyIn(context, page, spec, frame.frameId) : false;
    steady = frame && ready && frame.doc === lastDoc ? steady + 1 : 0;
    lastDoc = frame ? frame.doc : null;
    if (steady < 2) await context.sleep(1_000);
  }
}

async function frameStates(page: TabPage): Promise<Array<{ frameId: number; href: string; doc: number }>> {
  try {
    const frames = await page.frames<{ href?: unknown; doc?: unknown }>([FORM_FRAME_FILE]);
    return frames
      .map((frame) => ({ frameId: frame.frameId, href: String(frame.result.href ?? ''), doc: Number(frame.result.doc ?? 0) }))
      .sort((a, b) => a.frameId - b.frameId);
  } catch {
    // 화면이 바뀌는 중이거나 권한 밖 프레임.
    return [];
  }
}

async function readyIn(context: MallWriteContext, page: TabPage, spec: MallFormSpec, frameId: number): Promise<boolean> {
  try {
    const state = await callPage<{ form?: boolean; ready?: boolean }>(page, 'mallForm.state', { formSelector: spec.formSelector, readySelector: spec.readySelector ?? '' }, {
      timeoutMs: STATE_TIMEOUT_MS,
      guard: context.guard,
      main: [FORM_FILL_FILE],
      displayName: context.displayName,
      frameId,
    });
    return state?.form === true && state.ready === true;
  } catch {
    return false;
  }
}

/** 채울 프레임들. 맨 위 문서만 쓰는 몰은 [맨 위]. 모든 프레임 몰은 폼 프레임 주소가 맞는 것부터(없으면 맨 위부터 차례로). */
async function fillTargets(page: TabPage, spec: MallFormSpec): Promise<Array<number | undefined>> {
  if (!spec.allFrames) return [undefined];
  const frames = await frameStates(page);
  if (frames.length === 0) return [undefined];
  const preferred = spec.frameUrlIncludes ? frames.filter((frame) => frame.href.includes(spec.frameUrlIncludes!)) : frames;
  return (preferred.length > 0 ? preferred : frames).map((frame) => frame.frameId);
}

async function callFill(context: MallWriteContext, page: TabPage, spec: MallFormSpec, prepared: PreparedForm): Promise<PageFill> {
  const { call, files, payload } = fillPayload(spec, prepared);
  let last: PageFill = { ok: false, error: '폼 채움 결과를 받지 못했습니다.' };
  for (const frameId of await fillTargets(page, spec)) {
    const answer = await callPage<PageFill>(page, call, payload, {
      timeoutMs: FILL_TIMEOUT_MS,
      guard: context.guard,
      main: [DIALOG_GUARD_FILE, FORM_FILL_FILE, ...files],
      displayName: context.displayName,
      ...(frameId !== undefined ? { frameId } : {}),
    });
    last = answer ?? last;
    // 폼이 없는 프레임의 답(`noForm`)은 실패가 아니라 '여기 아님'이다.
    if (last.ok === true || !last.noForm) return last;
  }
  return last;
}

/**
 * 열린 쓰기 탭에서 채운다. 폼이 없으면(대개 로그인이 풀려 로그인 화면이 열렸다) `SITE_LOGIN_REQUIRED`로 멈춘다 — 로그인
 * 입구가 있는 몰은 쓰기 탭의 로그인 문턱이 그 탭에서 한 번 로그인하고 다시 채운다(옛 `ensureLogin` 뒤 다시 채우기).
 * 폼을 찾았는데 채우다 실패한 것(분류 선택 실패·수정 화면)은 로그인 문제가 아니다 → `REGISTRATION_FILL_FAILED`.
 */
export async function fillMallForm(context: MallWriteContext, page: TabPage, spec: MallFormSpec, prepared: PreparedForm): Promise<MallFill> {
  await waitForFormFrame(context, page, spec);
  let outcome = await callFill(context, page, spec, prepared);
  // 폼 프레임이 채우는 도중에 새로 뜨면(토큰 갱신) 그 프레임의 답이 사라져 '여기 아님'만 남는다. 가라앉기를 기다려 한 번만 다시
  // 넣는다 — 문서가 새로 떴으니 반쯤 채운 값이 남아 있지 않다.
  if (outcome.ok !== true && outcome.noForm && spec.frameUrlIncludes) {
    await waitForFormFrame(context, page, spec);
    outcome = await callFill(context, page, spec, prepared);
  }
  if (outcome.ok !== true) {
    if (outcome.noForm && (context.signIn || /로그인/.test(outcome.error ?? ''))) {
      throw new RuntimeError(SITE_LOGIN_REQUIRED, context.guard.loginMessage, { url: prepared.form.url, reason: 'no_form' });
    }
    throw new RuntimeError(REGISTRATION_FILL_FAILED, outcome.error ?? `${context.displayName} 상품등록 폼을 채우지 못했습니다.`, {
      mallKey: context.mallKey,
      steps: outcome.steps ?? [],
    });
  }
  const steps = [...(outcome.steps ?? [])];
  const warnings = [...(outcome.warnings ?? []), ...prepared.warnings];
  const editor = spec.detailEditor;
  if (editor && prepared.detailHtml && prepared.form.detailHtmlTarget) {
    const said = await writeDetailThroughEditor(context, page, spec, prepared).catch((error: unknown) => {
      warnings.push(`상세설명을 에디터로 넣지 못했습니다: ${error instanceof Error ? error.message : String(error)}. 화면에서 직접 넣으세요.`);
      return null;
    });
    if (said !== null) steps.push('상세설명(작성하기 에디터)');
  }
  return { steps, warnings, manualSteps: prepared.form.manualSteps, dialogs: outcome.dialogs ?? [] };
}

/** '상품상세내용 작성하기'를 눌러 팝업 에디터로 상세를 넣는다(도매꾹). 사람이 하는 순서 그대로: 버튼 → 팝업 → 내용 → 등록. */
async function writeDetailThroughEditor(context: MallWriteContext, page: TabPage, spec: MallFormSpec, prepared: PreparedForm): Promise<true> {
  const editor = spec.detailEditor as Record<string, unknown>;
  const outcome = await callPage<{ ok?: boolean; filled?: boolean; error?: string; alerts?: string[] }>(page, 'mallForm.detailEditor', {
    html: prepared.detailHtml,
    formSelector: spec.formSelector,
    target: prepared.form.detailHtmlTarget,
    buttonId: editor.buttonId,
    editorKey: editor.editorKey,
    toggleSelector: editor.toggleSelector,
    framePrefix: editor.framePrefix,
    frameSuffix: editor.frameSuffix,
    submitId: editor.submitId,
    promoKey: editor.promoKey ?? '',
    promoHtml: prepared.form.promoHtml,
    openTimeoutMs: editor.openTimeoutMs,
    submitTimeoutMs: editor.submitTimeoutMs,
  }, {
    timeoutMs: FILL_TIMEOUT_MS,
    guard: context.guard,
    main: [DIALOG_GUARD_FILE, FORM_FILL_FILE],
    displayName: context.displayName,
  });
  if (!outcome?.ok) throw new Error(outcome?.error ?? '상세내용을 넣지 못했습니다.');
  if (!outcome.filled) throw new Error((outcome.alerts ?? []).join(' / ') || '에디터가 등록을 받지 않았습니다.');
  return true;
}
