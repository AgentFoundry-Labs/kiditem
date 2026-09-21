export const DASHBOARD_FINDINGS_REPOSITORY_PORT = Symbol(
  'DASHBOARD_FINDINGS_REPOSITORY_PORT',
);

export type RejectedListingCount = Readonly<{
  /** The mall key (`ChannelAccount.channel`). */
  channel: string;
  /** The name the mall listing matrix gives the mall's column. */
  mallName: string;
  count: number;
}>;

/** Owner facts the dashboard's findings count that are not a depletion verdict. */
export interface DashboardFindingsRepositoryPort {
  /** Active listings a mall rejected, per mall — the listing state's `error`. */
  readRejectedListings(organizationId: string): Promise<RejectedListingCount[]>;
}
