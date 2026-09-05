/** Existing TOP known-room selection, shared with the server-frozen plan. */
export function selectTaobaoLiveIds(liveIds: string[]): string[] {
  return Array.from(new Set(liveIds.map((id) => id.trim()).filter(Boolean))).slice(0, 30);
}
