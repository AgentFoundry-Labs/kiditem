import { Inject, Injectable } from '@nestjs/common';
import {
  CONTENT_REGISTRATION_FACTS_PORT,
  type ContentRegistrationFactsPort,
} from '../../../../content/application/port/in/workspace/registration-content-facts.port';
import type {
  ChannelRegistrableContentFactsPort,
  RegistrableContentIds,
} from '../../../application/port/out/content/registrable-content-facts.port';

/** 등록 상태 reader 가 Content 의 현재 콘텐츠 id 를 읽는 길(KID-320). */
@Injectable()
export class RegistrableContentFactsAdapter implements ChannelRegistrableContentFactsPort {
  constructor(@Inject(CONTENT_REGISTRATION_FACTS_PORT) private readonly content: ContentRegistrationFactsPort) {}

  readCurrentContentIds(input: { organizationId: string; salesProductIds: readonly string[] }): Promise<ReadonlyMap<string, RegistrableContentIds>> {
    return this.content.readCurrentContentIds(input);
  }
}
