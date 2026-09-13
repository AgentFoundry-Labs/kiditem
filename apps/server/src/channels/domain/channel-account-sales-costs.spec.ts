import { describe, expect, it } from 'vitest';
import { channelAccountSalesCosts } from './channel-account-sales-costs';

describe('channelAccountSalesCosts', () => {
  it('does not apply a sales commission or other cost to a Rocket direct-purchase account', () => {
    expect(channelAccountSalesCosts({ channel: 'rocket' })).toEqual({
      salesCommissionApplies: false,
      otherCostApplies: false,
    });
  });

  it.each(['coupang', 'naver', 'smartstore', ''])(
    'applies both components to a %s account, whose values have no source yet',
    (channel) => {
      expect(channelAccountSalesCosts({ channel })).toEqual({
        salesCommissionApplies: true,
        otherCostApplies: true,
      });
    },
  );
});
