import type { OwnerTransaction } from '../../../../../common/owner-transaction';

export const CHANNEL_SOURCE_RECORD_PORT = Symbol('CHANNEL_SOURCE_RECORD_PORT');

/**
 * 초안이 가리키는 원본 기록(Sourcing 소유)에 Channels 가 부탁하는 것 — 초안을 지울 때 원본도 함께
 * 지우는 것 하나다(KID-313). 원본 사실을 읽는 화면은 Sourcing 의 읽기 경로를 직접 쓴다.
 */
export interface ChannelSourceRecordPort {
  /** 초안 삭제 트랜잭션 안에서 원본 기록을 지운다. 이미 없으면 아무것도 하지 않는다. */
  deleteForDraft(transaction: OwnerTransaction, input: { organizationId: string; sourceRecordId: string }): Promise<void>;
}
