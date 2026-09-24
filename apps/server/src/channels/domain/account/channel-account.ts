export interface ChannelAccountListRow {
  id: string;
  channel: string;
  name: string;
  externalAccountId: string | null;
  vendorId: string | null;
  sellerId: string | null;
  isPrimary: boolean;
}
