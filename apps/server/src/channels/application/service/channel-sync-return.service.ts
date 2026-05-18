import type {
  ChannelSyncRepositoryPort,
  CoupangSyncReturnPayload,
} from '../port/out/channel-sync.repository.port';

export function syncSingleCoupangReturn(
  syncRepository: ChannelSyncRepositoryPort,
  payload: CoupangSyncReturnPayload,
  organizationId: string,
): Promise<void> {
  return syncRepository.syncSingleReturn(organizationId, payload);
}
