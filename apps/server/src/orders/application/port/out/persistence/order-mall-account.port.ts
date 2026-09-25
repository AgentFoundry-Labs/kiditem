export const ORDER_MALL_ACCOUNT_PORT = Symbol('ORDER_MALL_ACCOUNT_PORT');

/** 주문 수집이 쓰는 몰 계정(Channels 몰 식별). */
export interface OrderMallAccount {
  channelAccountId: string;
  mallKey: string;
  mallName: string;
}

/**
 * 몰 키 → 그 조직의 주문 수집 몰 계정(KID-359 H3). Channels가 몰 식별을 소유하고, Orders는 공개 capability
 * (`ChannelAccountPort.resolveMallIdentities`)로 읽는다. 채널 레지스트리에 없는 몰이거나 계정이 없으면 null.
 */
export interface OrderMallAccountPort {
  resolveMallAccount(input: { organizationId: string; mallKey: string }): Promise<OrderMallAccount | null>;
}
