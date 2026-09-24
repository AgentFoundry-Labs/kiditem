import type { ChannelAccountFactQueries, ChannelAccountPort } from '../../in/account/channel-account.port';
import type { ChannelAccountListRow } from '../../../../domain/account/channel-account';
export type { ChannelAccountListRow } from '../../../../domain/account/channel-account';
import type {
  CoupangAccountSettings,
  UpdateCoupangAccountSettings,
} from '@kiditem/shared/channel-account';

export const CHANNEL_ACCOUNT_PERSISTENCE_PORT = Symbol('CHANNEL_ACCOUNT_PERSISTENCE_PORT');


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
