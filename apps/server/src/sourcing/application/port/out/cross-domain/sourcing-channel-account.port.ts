// Anti-corruption outgoing port: a Wing search collection runs on one
// Coupang account's Wing login (KID-360), so Sourcing checks that the account
// is this organization's active Coupang account before taking its lock. The
// adapter binds this to Channels' published `CHANNEL_ACCOUNT_PORT`.

export const SOURCING_CHANNEL_ACCOUNT_PORT = Symbol('SOURCING_CHANNEL_ACCOUNT_PORT');

export interface SourcingChannelAccountPort {
  /** 이 조직의 활성 쿠팡 계정인가. */
  isActiveCoupangAccount(organizationId: string, channelAccountId: string): Promise<boolean>;
}
