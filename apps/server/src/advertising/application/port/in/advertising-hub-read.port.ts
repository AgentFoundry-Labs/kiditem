import type { AdsHubData } from '@kiditem/shared/advertising';

/** Read-only advertising hub projection used by fixed report exports. */
export const ADVERTISING_HUB_READ_PORT = Symbol('ADVERTISING_HUB_READ_PORT');

export interface AdvertisingHubReadPort {
  getHubData(organizationId: string): Promise<AdsHubData>;
}
