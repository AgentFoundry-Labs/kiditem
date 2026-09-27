import { RuntimeError } from '../../core/errors';
import type { SiteLease } from '../registry';
import { createSiteSignIn, type LoginDeps, type LoginSpec, type SiteSignIn } from '../site-login';
import type { PageGuard, TabPage, TabPages } from '../tab-page';
import { normalizeForm, RUNTIME_PLAN_INVALID, type MallFormSpec } from './form';
import { fillMallForm, prepareMallForm } from './form-register';
import type { Fetch } from './images';
import { shouldPressRegister, type SubmitDecision } from './submit-gate';
import { openWriteTab } from './write-tab';

/**
 * 몰 쓰기 모듈(KID-256)의 몰 하나. `sites/<mall>/registration.ts`(등록 폼)·`availability.ts`(품절·재개·가격·읽기)가 파일 끝에서
 * 몰 키로 스스로 등록하고, 몰 쓰기 라우터(`sites/mall-write`)가 plan의 몰 키로 찾는다. 로그인 입구가 있는 몰은 실행 자격으로
 * 그 탭에서 한 번 로그인하고, 없는 몰(카카오·떠리몰·스마트스토어·지마켓·11번가 — 로그인 폼 명세 없음, 올웨이즈 JWT)은
 * `PageGuard.isLogin`으로 `SITE_LOGIN_REQUIRED`에서 멈추고 탭을 남긴다.
 */
export interface MallWriteDeps extends LoginDeps {
  tabs: TabPages;
  fetch: Fetch;
}

/** 채우기 결과(`registration_fill` 청크와 finish `result.fill`). */
export interface MallFill {
  steps: string[];
  warnings: string[];
  manualSteps: string[];
  dialogs: string[];
}

/**
 * [등록]을 누른 뒤 몰이 보인 것. `pressed`: 버튼을 실제로 눌렀는가(못 찾았으면 false — 제출이 아니다). `accepted`: 받았다(true)·
 * 거절했다(false)·모른다(null).
 */
export interface MallSubmission {
  pressed: boolean;
  accepted: boolean | null;
  externalListingId: string | null;
  observedUrl: string | null;
  mallMessage: string | null;
}

export interface MallFillInput {
  /** register는 새 상품 등록 화면, update·composition_change는 기존 리스팅의 수정 화면(`externalListingId`)이다. */
  executionKind: 'register' | 'update' | 'composition_change';
  externalListingId: string | null;
  form: Record<string, unknown>;
  /** 실행이 [등록]까지 부탁했는가(관문 조건 1). */
  submit: boolean;
  expectedProviderAccountId: string | null;
}

/** 폼을 채운 쓰기 탭 하나. 누를지는 관문이 정했다(`decision`); `submit`은 관문이 누르라고 할 때만 부른다. `done`이 탭을 넘긴다. */
export interface MallFillSession {
  fill: MallFill;
  decision: SubmitDecision;
  /** 몰 화면에서 읽은 판매자 식별자(Wing 업체코드). 읽지 못하는 몰은 null. */
  providerAccountId: string | null;
  observedUrl: string | null;
  submit(): Promise<MallSubmission>;
  done(): Promise<void>;
}

/** 채우기 하나를 돌리는 도구(탭·로그인·사진 읽기). */
export interface MallWriteContext extends MallWriteDeps {
  mallKey: string;
  displayName: string;
  guard: PageGuard;
  signIn: SiteSignIn | null;
}

/** 폼 명세로 채우지 않는 몰(키즈노트·Wing)의 채우기. 열린 쓰기 탭에서 채우고, 누르기가 검증된 몰만 `submit`을 둔다. */
export interface MallCustomRegistration {
  /** 채울 화면 주소(새 등록 화면, 또는 수정이면 그 리스팅의 수정 화면). 몰의 주소가 아니거나 열 수 없으면 던진다. */
  url(input: MallFillInput): string;
  /** 페이지 번들보다 먼저 돌아야 하는 보완 파일(Wing formV2 런타임 호환) — 쓰기 탭이 그 파일을 새 문서 스크립트로 걸고 옮긴다. */
  bootstrapFile?: string;
  fill(context: MallWriteContext, page: TabPage, input: MallFillInput): Promise<{ fill: MallFill; providerAccountId: string | null }>;
  submit?(context: MallWriteContext, page: TabPage): Promise<MallSubmission>;
}

export interface MallWriterDefinition {
  mallKey: string;
  displayName: string;
  /** 쓰기 화면 탭이 있어도 되는 곳과 로그인 화면(로그인 폼 명세가 없는 몰은 여기서 멈춘다). */
  guard: PageGuard;
  /** 불러오는 중 알림 창 가드를 걸 호스트(로그인 입구가 있으면 그 호스트를 쓴다). */
  dialogHosts: readonly string[];
  login?: LoginSpec;
  /** 옛 `mall-form-register.js` SPECS 한 줄(몰 17곳) 또는 전용 흐름(키즈노트·Wing). */
  form?: MallFormSpec;
  custom?: MallCustomRegistration;
}

const writers = new Map<string, MallWriterDefinition>();

/** `sites/<mall>/registration.ts`가 부른다. 몰 하나 = 정의 하나. */
export function registerMallWriter(definition: MallWriterDefinition): void {
  if (writers.has(definition.mallKey)) throw new Error(`duplicate mall writer: ${definition.mallKey}`);
  writers.set(definition.mallKey, definition);
}

export function mallWriterFor(mallKey: string): MallWriterDefinition | null {
  return writers.get(mallKey) ?? null;
}

export function registeredMallWriters(): MallWriterDefinition[] {
  return [...writers.values()].sort((a, b) => (a.mallKey < b.mallKey ? -1 : a.mallKey > b.mallKey ? 1 : 0));
}

/** 실행 하나의 쓰기 도구. 로그인 입구는 실행마다 하나(로그인은 한 번만). */
export function mallWriteContext(definition: MallWriterDefinition, deps: MallWriteDeps, lease: SiteLease): MallWriteContext {
  return {
    ...deps,
    mallKey: definition.mallKey,
    displayName: definition.displayName,
    guard: definition.guard,
    signIn: definition.login ? createSiteSignIn(definition.login, lease.credentials, deps) : null,
  };
}

/**
 * 등록 폼 채우기 하나(register·update·composition_change). 쓰기 탭을 열어 채우고, 관문(`shouldPressRegister`)이 누를지를
 * 정해 둔다. 채우다 실패하면 탭을 운영자에게 넘기고 던진다. 성공이면 탭은 `done`까지 이 실행 것이다(누르기 뒤 넘긴다).
 */
export async function fillRegistration(definition: MallWriterDefinition, context: MallWriteContext, input: MallFillInput): Promise<MallFillSession> {
  const spec = definition.form;
  const custom = definition.custom;
  if (!spec && !custom) {
    throw new RuntimeError(RUNTIME_PLAN_INVALID, `${definition.displayName}은 상품등록 폼 채우기를 지원하지 않습니다.`, { mallKey: definition.mallKey });
  }
  // 몰 폼 명세는 새 상품 등록 화면만 안다(수정·복사 화면 주소는 거절한다) — 기존 리스팅 수정 화면을 채우는 몰(Wing)만 수정을 받는다.
  if (spec && !custom && input.executionKind !== 'register') {
    throw new RuntimeError(RUNTIME_PLAN_INVALID, `${definition.displayName}은 기존 상품 수정 화면 채우기를 지원하지 않습니다.`, {
      mallKey: definition.mallKey,
      executionKind: input.executionKind,
    });
  }
  // 폼 지시 검사와 사진 준비는 탭을 열기 전에 한다(옛 순서) — 몰 주소가 아니면 탭을 열지 않는다.
  const normalized = spec ? normalizeForm(spec, input.form) : null;
  const prepared = spec && normalized ? await prepareMallForm(context, spec, normalized) : null;
  const url = normalized ? normalized.url : custom!.url(input);
  const tab = await openWriteTab(context, url, {
    signIn: context.signIn,
    dialogHosts: definition.dialogHosts,
    ...(custom?.bootstrapFile ? { bootstrapFile: custom.bootstrapFile } : {}),
  });
  try {
    const filled = await tab.run(async (page) => {
      if (spec && prepared) return { fill: await fillMallForm(context, page, spec, prepared), providerAccountId: null };
      return custom!.fill(context, page, input);
    });
    const decision = shouldPressRegister({
      submit: input.submit,
      verifiedSubmit: Boolean(custom?.submit),
      warnings: filled.fill.warnings,
      manualSteps: filled.fill.manualSteps,
    });
    const observedUrl = await tab.page.currentUrl().catch(() => null);
    return {
      fill: filled.fill,
      decision,
      providerAccountId: filled.providerAccountId,
      observedUrl: observedUrl ? observedUrl.split(/[?#]/)[0]! : null,
      submit: async () => {
        if (!decision.press || !custom?.submit) throw new Error('관문이 누르지 않기로 한 등록입니다.');
        return custom.submit(context, tab.page);
      },
      done: () => tab.done(),
    };
  } catch (error) {
    await tab.done();
    throw error;
  }
}
