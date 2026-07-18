import { Inject, Injectable } from '@nestjs/common';
import {
  CANDIDATE_CONTENT_ASSET_PORT as AI_CANDIDATE_CONTENT_ASSET_PORT,
  type CandidateContentAssetPort as AiCandidateContentAssetPort,
} from '../../../../ai/application/port/in/workspace/candidate-content-asset.port';
import type {
  CandidateContentAssetPort,
  CandidateRegistrationImages,
} from '../../../application/port/out/cross-domain/candidate-content-asset.port';

@Injectable()
export class CandidateContentAssetAdapter implements CandidateContentAssetPort {
  constructor(
    @Inject(AI_CANDIDATE_CONTENT_ASSET_PORT)
    private readonly assets: AiCandidateContentAssetPort,
  ) {}

  listRegistrationImages(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateRegistrationImages> {
    return this.assets.listRegistrationImages(input);
  }
}
