import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ChannelIntegrityPort } from '../../../application/port/out/integrity/channel-integrity.port';

@Injectable()
export class ChannelIntegrityAdapter implements ChannelIntegrityPort {
  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
