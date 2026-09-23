import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AiModule } from '../ai.module';
import { ListingThumbnailEvaluationController } from '../adapter/in/http/listing-thumbnail-evaluation.controller';
import { ThumbnailJobsController } from '../adapter/in/http/thumbnail-jobs.controller';
import { ThumbnailJobReviewController } from '../adapter/in/http/thumbnail-job-review.controller';

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

describe('AiModule thumbnail job route wiring', () => {
  it('mounts the thumbnail job controllers under /api/ai/thumbnail-jobs and nothing under thumbnail-analysis', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, AiModule) ?? [];

    for (const controller of [ThumbnailJobsController, ThumbnailJobReviewController]) {
      expect(controllers).toContain(controller);
      expect(Reflect.getMetadata(PATH_KEY, controller)).toBe('ai/thumbnail-jobs');
    }
    const paths = controllers.map((controller) => Reflect.getMetadata(PATH_KEY, controller as object) as string);
    expect(paths.filter((path) => path.startsWith('thumbnail-analysis'))).toEqual([]);
  });

  it('evaluates the mall listing image instead of analysing a workspace (KID-313 W3a)', () => {
    const controllers: unknown[] = Reflect.getMetadata(CONTROLLERS_KEY, AiModule) ?? [];
    expect(controllers).toContain(ListingThumbnailEvaluationController);
    expect(Reflect.getMetadata(PATH_KEY, ListingThumbnailEvaluationController)).toBe('ai/listing-thumbnails');
    expect(routeFor(ListingThumbnailEvaluationController.prototype, 'evaluate')).toEqual({
      method: RequestMethod.POST,
      path: ':channelListingId/evaluate',
    });
    expect(routeFor(ListingThumbnailEvaluationController.prototype, 'current')).toEqual({
      method: RequestMethod.POST,
      path: 'current',
    });
    // 적용 후 CTR 추적(Wing 판매 스크랩)은 없다 — 리스팅 평가가 대신한다.
    const paths = controllers.map((controller) => Reflect.getMetadata(PATH_KEY, controller as object) as string);
    expect(paths.filter((path) => path === 'thumbnail-tracking')).toEqual([]);
  });

  it('serves the thumbnail jobs as one resource', () => {
    expect(routeFor(ThumbnailJobReviewController.prototype, 'listGenerations')).toEqual({ method: RequestMethod.GET, path: '/' });
    expect(routeFor(ThumbnailJobReviewController.prototype, 'getGeneration')).toEqual({ method: RequestMethod.GET, path: ':id' });
    expect(routeFor(ThumbnailJobReviewController.prototype, 'cancelGeneration')).toEqual({ method: RequestMethod.POST, path: ':id/cancel' });
    // 후보 채택은 작업공간 대표이미지 route 하나다 — job 에 select · apply 단계가 없다(KID-313 W3a).
    for (const retired of ['selectCandidate', 'clearReadySelections', 'applyGeneration']) {
      expect(Reflect.get(ThumbnailJobReviewController.prototype, retired)).toBeUndefined();
    }
    expect(routeFor(ThumbnailJobReviewController.prototype, 'skipGeneration')).toEqual({ method: RequestMethod.PUT, path: ':id/skip' });
    expect(routeFor(ThumbnailJobReviewController.prototype, 'deleteGeneration')).toEqual({ method: RequestMethod.DELETE, path: ':id' });
    expect(routeFor(ThumbnailJobReviewController.prototype, 'deleteCandidate')).toEqual({ method: RequestMethod.DELETE, path: ':id/candidates' });
    expect(routeFor(ThumbnailJobsController.prototype, 'createEditJobs')).toEqual({ method: RequestMethod.POST, path: 'edit' });
    expect(routeFor(ThumbnailJobsController.prototype, 'reEditGeneration')).toEqual({ method: RequestMethod.POST, path: ':id/re-edit' });
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
