import { Inject, Injectable } from '@nestjs/common';
import { REGISTRATION_SOURCE_PORT, type RegistrationSourcePort } from '../../../../sourcing/application/port/in/registration-source.port';
import type { ChannelRegistrationSourcePort } from '../../../application/port/out/sourcing/registration-source.port';

@Injectable()
export class RegistrationSourceAdapter implements ChannelRegistrationSourcePort {
  constructor(@Inject(REGISTRATION_SOURCE_PORT) private readonly source: RegistrationSourcePort) {}
  readRegistrationBasics(...args: Parameters<ChannelRegistrationSourcePort['readRegistrationBasics']>) {
    return this.source.readRegistrationBasics(...args);
  }
}
