import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';
import { mallCapabilities, mallReadiness, type MallReadiness } from './mall-capabilities';

export interface MallAccountRowDraft {
  loginId: string;
  supplierLoginId: string;
  /** 현재 입력칸 값. 비어 있고 seed 도 없으면 저장된 비밀번호를 그대로 둔다. */
  password: string;
  /**
   * 눈 아이콘으로 불러온 '저장된 비밀번호'.
   *
   * 불러오기만 한 상태를 변경으로 오해하면 안 되므로, 변경 판정은 입력값을 이
   * 값과 비교한다. 불러오지 않았으면 undefined.
   */
  seededPassword?: string;
  siteUrl: string;
  memo: string;
  enabled: boolean;
}

export interface MallAccountRow {
  account: OrderCollectionMallAccount;
  draft: MallAccountRowDraft;
  dirty: boolean;
  readiness: MallReadiness;
  supportsCollection: boolean;
  supportsTracking: boolean;
}

export function draftFromAccount(account: OrderCollectionMallAccount): MallAccountRowDraft {
  return {
    loginId: account.loginId ?? '',
    supplierLoginId: account.supplierLoginId ?? '',
    password: '',
    siteUrl: account.siteUrl ?? '',
    memo: account.memo ?? '',
    enabled: account.enabled,
  };
}

/** 입력한 비밀번호가 저장된 것과 다른가. 불러오기만 한 상태는 변경이 아니다. */
export function isPasswordChanged(draft: MallAccountRowDraft): boolean {
  return draft.password.trim().length > 0 && draft.password !== (draft.seededPassword ?? '');
}

/** 저장할 것이 있는가. */
export function isDraftDirty(
  account: OrderCollectionMallAccount,
  draft: MallAccountRowDraft,
): boolean {
  const saved = draftFromAccount(account);
  return draft.loginId !== saved.loginId
    || draft.supplierLoginId !== saved.supplierLoginId
    || draft.siteUrl !== saved.siteUrl
    || draft.memo !== saved.memo
    || draft.enabled !== saved.enabled
    || isPasswordChanged(draft);
}

export function buildMallAccountRows(
  accounts: readonly OrderCollectionMallAccount[],
  drafts: Readonly<Record<string, MallAccountRowDraft>>,
): MallAccountRow[] {
  return accounts.map((account) => {
    const draft = drafts[account.key] ?? draftFromAccount(account);
    const capabilities = mallCapabilities(account.key);
    return {
      account,
      draft,
      dirty: isDraftDirty(account, draft),
      readiness: mallReadiness(account),
      supportsCollection: capabilities.collection,
      supportsTracking: capabilities.tracking,
    };
  });
}

/** 저장 요청 본문. 비밀번호는 실제로 바뀌었을 때만 실어 보낸다. */
export function updateInputFromDraft(draft: MallAccountRowDraft) {
  const password = isPasswordChanged(draft) ? draft.password.trim() : '';
  return {
    loginId: draft.loginId.trim(),
    supplierLoginId: draft.supplierLoginId.trim(),
    siteUrl: draft.siteUrl.trim(),
    memo: draft.memo.trim(),
    enabled: draft.enabled,
    ...(password ? { password } : {}),
  };
}

export interface MallAccountSummary {
  total: number;
  ready: number;
  needsAccount: number;
  preparing: number;
  dirty: number;
}

export function summarizeMallAccountRows(rows: readonly MallAccountRow[]): MallAccountSummary {
  return {
    total: rows.length,
    ready: rows.filter((row) => row.readiness === 'ready').length,
    needsAccount: rows.filter((row) => row.readiness === 'needs_account').length,
    preparing: rows.filter((row) => row.readiness === 'preparing').length,
    dirty: rows.filter((row) => row.dirty).length,
  };
}
