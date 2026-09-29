import type { ChannelAccountFactQueries, ChannelAccountPort } from '../../in/account/channel-account.port';
import type { ChannelAccountListRow } from '../../../../domain/account/channel-account';
export type { ChannelAccountListRow } from '../../../../domain/account/channel-account';
import type {
  CoupangAccountSettings,
  UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';

export const CHANNEL_ACCOUNT_PERSISTENCE_PORT = Symbol('CHANNEL_ACCOUNT_PERSISTENCE_PORT');

/**
 * 주문 수집 몰은 아니지만 몰과 같은 저장 로그인(`config.orderCollection`)을 두는 마켓 행(KID-377). 쿠팡 윙 로그인은
 * 대표 윙 계정 행에 둔다 — 확장이 윙 실행 안에서 그 자격으로 로그인한다. 행을 새로 만들지 않고, 주문 수집 몰 목록·순서에는
 * 넣지 않는다(주문 수집 화면이 윙을 몰로 돌리지 않게).
 */
export const LOGIN_ACCOUNT_MARKETS = [
  { key: 'coupang', name: '쿠팡 WING', sharedAccountChannel: 'coupang' },
] as const;
export type LoginAccountMarketKey = (typeof LOGIN_ACCOUNT_MARKETS)[number]['key'];


export interface MallAccountRecord {
  id: string;
  channel: string;
  name: string;
  externalAccountId: string | null;
  status: string;
  config: unknown;
  updatedAt: Date;
}

export type MallAccountWrite =
  | {
      /** Existing-row updates are organization-scoped by the adapter. Omitted metadata is untouched. */
      operation: 'update';
      id: string;
      channel?: string;
      externalAccountId?: string | null;
      name?: string;
      status?: string;
      config: Record<string, unknown>;
    }
  | {
      /** A new row always has an explicit mall identity and starts non-primary. */
      operation: 'create';
      channel: string;
      externalAccountId: string | null;
      name: string;
      status: string;
      config: Record<string, unknown>;
    };

/** Scoped transaction context; the adapter owns locks and the DB client. */
export interface MallAccountTransaction {
  list(): Promise<MallAccountRecord[]>;
  save(input: MallAccountWrite): Promise<MallAccountRecord>;
}

export interface ChannelAccountPersistencePort extends ChannelAccountFactQueries, Pick<ChannelAccountPort, 'claimProviderIdentity'> {
  listMallAccounts(organizationId: string): Promise<MallAccountRecord[]>;
  withMallAccounts<T>(organizationId: string, work: (accounts: MallAccountTransaction) => Promise<T>): Promise<T>;

  getCoupangSettings(organizationId: string): Promise<CoupangAccountSettings>;

  upsertCoupangSettings(
    organizationId: string,
    input: UpdateCoupangAccountSettings,
  ): Promise<CoupangAccountSettings>;

  listActive(organizationId: string): Promise<ChannelAccountListRow[]>;

  ensureRocketAccount(organizationId: string): Promise<ChannelAccountListRow>;

  getPrimaryCoupangAccountId(organizationId: string): Promise<string | null>;
}
