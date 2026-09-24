import { Inject, Injectable } from '@nestjs/common';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { SOURCE_RECORD_PORT, type SourceRecordPort } from '../../../../sourcing/application/port/in/source-record.port';
import type { ChannelSourceRecordPort } from '../../../application/port/out/sourcing/source-record.port';

@Injectable()
export class SourceRecordAdapter implements ChannelSourceRecordPort {
  constructor(@Inject(SOURCE_RECORD_PORT) private readonly records: SourceRecordPort) {}
  deleteForDraft(transaction: OwnerTransaction, input: { organizationId: string; sourceRecordId: string }) {
    return this.records.deleteForDraft(transaction, input);
  }
}
