export const SELLPIA_INVENTORY_EVENTS = {
  SNAPSHOT_VERIFIED: 'inventory.sellpia-snapshot.verified.v1',
} as const;

export type SellpiaInventorySnapshotVerifiedEvent = Readonly<{
  organizationId: string;
  runId: string;
  generation: string | null;
}>;
