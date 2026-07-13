import type {
  ChannelSyncRepositoryPort,
  CoupangSyncReturnPayload,
} from '../port/out/repository/channel-sync.repository.port';

export async function syncSingleCoupangReturn(
  syncRepository: ChannelSyncRepositoryPort,
  payload: CoupangSyncReturnPayload,
  organizationId: string,
): Promise<void> {
  const channelAccountId = await syncRepository.getPrimaryCoupangAccountId(organizationId);
  if (!channelAccountId) {
    throw new Error('Active primary Coupang ChannelAccount is required for return sync');
  }
  return syncRepository.syncSingleReturn(organizationId, channelAccountId, payload);
}
