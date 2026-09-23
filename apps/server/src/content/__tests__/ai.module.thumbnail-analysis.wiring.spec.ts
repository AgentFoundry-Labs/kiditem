import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AiModule } from '../ai.module';
import { ThumbnailAnalysisController } from '../adapter/in/http/thumbnail-analysis.controller';
import { ThumbnailAnalysisEditJobsController } from '../adapter/in/http/thumbnail-analysis-edit-jobs.controller';
import { ThumbnailAnalysisGenerationReviewController } from '../adapter/in/http/thumbnail-analysis-generation-review.controller';

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
    ]) {
      expect(controllers).toContain(controller);
      expect(Reflect.getMetadata(PATH_KEY, controller)).toBe('thumbnail-analysis');
    }
  });

  it('preserves moved generation and edit-job route URLs', () => {
    expect(routeFor(ThumbnailAnalysisGenerationReviewController.prototype, 'listGenerations')).toEqual({
      method: RequestMethod.GET,
      path: 'generations',
    });
    expect(routeFor(ThumbnailAnalysisGenerationReviewController.prototype, 'getGeneration')).toEqual({
      method: RequestMethod.GET,
      path: 'generations/:id',
    });
    expect(routeFor(ThumbnailAnalysisGenerationReviewController.prototype, 'cancelGeneration')).toEqual({
      method: RequestMethod.POST,
      path: 'generations/:id/cancel',
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
  });

  it('leaves mall submission to Channels: no Content route registers, verifies or clears a Wing upload', () => {
    const controllers: Array<{ prototype: object }> = Reflect.getMetadata(CONTROLLERS_KEY, AiModule) ?? [];
    const paths = controllers.flatMap((controller) =>
      Object.getOwnPropertyNames(controller.prototype)
        .map((name) => Reflect.getMetadata(PATH_KEY, Reflect.get(controller.prototype, name) as object) as string | undefined)
        .filter((path): path is string => typeof path === 'string'));
    expect(paths.filter((path) => /wing-register|registration-error|verify-registration|playwriter-status/.test(path))).toEqual([]);
  });
});
