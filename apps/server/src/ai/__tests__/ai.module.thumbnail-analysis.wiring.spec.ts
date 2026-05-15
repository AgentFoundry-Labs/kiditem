import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AiModule } from '../ai.module';
import { ThumbnailAnalysisController } from '../adapter/in/http/thumbnail-analysis.controller';
import { ThumbnailAnalysisEditJobsController } from '../adapter/in/http/thumbnail-analysis-edit-jobs.controller';
import { ThumbnailAnalysisGenerationReviewController } from '../adapter/in/http/thumbnail-analysis-generation-review.controller';
import { ThumbnailAnalysisWingController } from '../adapter/in/http/thumbnail-analysis-wing.controller';

const CONTROLLERS_KEY = 'controllers';
const PATH_KEY = 'path';
const METHOD_KEY = 'method';

function routeFor(controller: object, methodName: string) {
  const handler = Reflect.get(controller, methodName) as object;
  return {
    method: Reflect.getMetadata(METHOD_KEY, handler),
    path: Reflect.getMetadata(PATH_KEY, handler),
  };
}

describe('AiModule thumbnail-analysis route-family wiring', () => {
  it('mounts thumbnail-analysis route families as separate controllers', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, AiModule) ?? [];

    for (const controller of [
      ThumbnailAnalysisController,
      ThumbnailAnalysisEditJobsController,
      ThumbnailAnalysisGenerationReviewController,
      ThumbnailAnalysisWingController,
    ]) {
      expect(controllers).toContain(controller);
      expect(Reflect.getMetadata(PATH_KEY, controller)).toBe('thumbnail-analysis');
    }
  });

  it('preserves moved generation, edit-job, and Wing route URLs', () => {
    expect(routeFor(ThumbnailAnalysisGenerationReviewController.prototype, 'listGenerations')).toEqual({
      method: RequestMethod.GET,
      path: 'generations',
    });
    expect(routeFor(ThumbnailAnalysisGenerationReviewController.prototype, 'getGeneration')).toEqual({
      method: RequestMethod.GET,
      path: 'generations/:id',
    });
    expect(routeFor(ThumbnailAnalysisGenerationReviewController.prototype, 'selectCandidate')).toEqual({
      method: RequestMethod.PUT,
      path: 'generations/:id/select',
    });
    expect(routeFor(ThumbnailAnalysisGenerationReviewController.prototype, 'clearReadySelections')).toEqual({
      method: RequestMethod.PUT,
      path: 'generations/clear-ready-selections',
    });
    expect(routeFor(ThumbnailAnalysisGenerationReviewController.prototype, 'applyGeneration')).toEqual({
      method: RequestMethod.PUT,
      path: 'generations/:id/apply',
    });
    expect(routeFor(ThumbnailAnalysisGenerationReviewController.prototype, 'skipGeneration')).toEqual({
      method: RequestMethod.PUT,
      path: 'generations/:id/skip',
    });
    expect(routeFor(ThumbnailAnalysisGenerationReviewController.prototype, 'deleteGeneration')).toEqual({
      method: RequestMethod.DELETE,
      path: 'generations/:id',
    });
    expect(routeFor(ThumbnailAnalysisGenerationReviewController.prototype, 'deleteCandidate')).toEqual({
      method: RequestMethod.DELETE,
      path: 'generations/:id/candidates',
    });

    expect(routeFor(ThumbnailAnalysisEditJobsController.prototype, 'createEditJobs')).toEqual({
      method: RequestMethod.POST,
      path: 'edit-jobs',
    });
    expect(routeFor(ThumbnailAnalysisEditJobsController.prototype, 'reEditGeneration')).toEqual({
      method: RequestMethod.POST,
      path: 'generations/:id/re-edit',
    });

    expect(routeFor(ThumbnailAnalysisWingController.prototype, 'checkPlaywriterStatus')).toEqual({
      method: RequestMethod.GET,
      path: 'playwriter-status',
    });
    expect(routeFor(ThumbnailAnalysisWingController.prototype, 'wingRegisterPrepare')).toEqual({
      method: RequestMethod.POST,
      path: 'generations/:id/wing-register/prepare',
    });
    expect(routeFor(ThumbnailAnalysisWingController.prototype, 'wingRegisterComplete')).toEqual({
      method: RequestMethod.POST,
      path: 'generations/:id/wing-register/complete',
    });
    expect(routeFor(ThumbnailAnalysisWingController.prototype, 'wingRegister')).toEqual({
      method: RequestMethod.POST,
      path: 'generations/:id/wing-register',
    });
    expect(routeFor(ThumbnailAnalysisWingController.prototype, 'wingRegisterBatch')).toEqual({
      method: RequestMethod.POST,
      path: 'generations/wing-register/batch',
    });
    expect(routeFor(ThumbnailAnalysisWingController.prototype, 'clearRegistrationError')).toEqual({
      method: RequestMethod.DELETE,
      path: 'generations/:id/registration-error',
    });
    expect(routeFor(ThumbnailAnalysisWingController.prototype, 'verifyRegistration')).toEqual({
      method: RequestMethod.POST,
      path: 'generations/:id/verify-registration',
    });
  });
});
