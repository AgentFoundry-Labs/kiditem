import { Injectable } from '@nestjs/common';
import { DeletionPasswordService } from '../../../../organizations/deletion-password.service';
import type { ChannelsDeletionPasswordPort } from '../../../application/port/out/cross-domain/deletion-password.port';

@Injectable()
export class ChannelsDeletionPasswordAdapter implements ChannelsDeletionPasswordPort {
  constructor(private readonly deletionPassword: DeletionPasswordService) {}

  assertPassword(organizationId: string, password: string): Promise<void> {
    return this.deletionPassword.assertPassword(organizationId, password);
  }
}
