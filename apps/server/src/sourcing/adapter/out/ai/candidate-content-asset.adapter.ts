import { Inject, Injectable } from '@nestjs/common';
import {
  CANDIDATE_CONTENT_ASSET_PORT as AI_CANDIDATE_CONTENT_ASSET_PORT,
  type CandidateContentAssetPort as AiCandidateContentAssetPort,
} from '../../../../ai/application/port/in/workspace/candidate-content-asset.port';
import type {
  CandidateContentAssetPort,
  CandidateCurrentThumbnail,
  CandidateRegistrationImages,
} from '../../../application/port/out/cross-domain/candidate-content-asset.port';

@Injectable()
export class CandidateContentAssetAdapter implements CandidateContentAssetPort {
  constructor(
    @Inject(AI_CANDIDATE_CONTENT_ASSET_PORT)
    private readonly assets: AiCandidateContentAssetPort,
  ) {}

  loadRegistrationMedia(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<{
    registrationImages: CandidateRegistrationImages;
    currentThumbnail: CandidateCurrentThumbnail | null;
  }> {
    return this.assets.loadRegistrationMedia(input);
  }

  listRegistrationImages(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateRegistrationImages> {
    return this.assets.listRegistrationImages(input);
  }

  findCurrentThumbnail(input: {
    organizationId: string;
    sourceCandidateId: string;
  }): Promise<CandidateCurrentThumbnail | null> {
    return this.assets.findCurrentThumbnail(input);
  }

  findCurrentThumbnails(input: {
    organizationId: string;
    sourceCandidateIds: string[];
  }): Promise<Map<string, CandidateCurrentThumbnail>> {
    return this.assets.findCurrentThumbnails(input);
  }
}
