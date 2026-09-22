import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AiModule } from '../../../../ai.module';
import { DetailPageWorkspaceImageController } from '../detail-page-workspace-image.controller';
import { DetailPageEditorController } from '../detail-page-editor.controller';
import { DetailPageGenerationController } from '../detail-page-generation.controller';

describe('detail-page route-family controllers', () => {
  it('registers the split controllers in AiModule', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AiModule) as unknown[];

    expect(controllers).toContain(DetailPageGenerationController);
    expect(controllers).toContain(DetailPageEditorController);
    expect(controllers).toContain(DetailPageWorkspaceImageController);
  });

  it('preserves the existing route URLs by route family', () => {
    expect(controllerPath(DetailPageGenerationController)).toBe('ai/detail-page');
    expect(route(DetailPageGenerationController, 'uploadImage')).toEqual({
      method: RequestMethod.POST,
      path: 'images',
    });
    expect(route(DetailPageGenerationController, 'generate')).toEqual({
      method: RequestMethod.POST,
      path: 'generate',
    });
    expect(route(DetailPageGenerationController, 'prefill')).toEqual({
      method: RequestMethod.POST,
      path: 'prefill',
    });

    expect(controllerPath(DetailPageEditorController)).toBe('ai/detail-page');
    expect(route(DetailPageEditorController, 'list')).toEqual({
      method: RequestMethod.GET,
      path: '/',
    });
    expect(route(DetailPageEditorController, 'getOne')).toEqual({
      method: RequestMethod.GET,
      path: ':id',
    });
    expect(route(DetailPageEditorController, 'saveEditedHtml')).toEqual({
      method: RequestMethod.POST,
      path: ':id/edited-html',
    });
    expect(route(DetailPageEditorController, 'getEditedHtml')).toEqual({
      method: RequestMethod.GET,
      path: ':id/edited-html',
    });
    expect(route(DetailPageEditorController, 'cancel')).toEqual({
      method: RequestMethod.POST,
      path: ':id/cancel',
    });
    expect(route(DetailPageEditorController, 'remove')).toEqual({
      method: RequestMethod.DELETE,
      path: ':id',
    });

    expect(controllerPath(DetailPageWorkspaceImageController)).toBe(
      'ai/detail-page-image',
    );
    expect(route(DetailPageWorkspaceImageController, 'prepare')).toEqual({
      method: RequestMethod.POST,
      path: 'workspace/:contentWorkspaceId/server-render',
    });
    expect(route(DetailPageWorkspaceImageController, 'claim')).toEqual({
      method: RequestMethod.POST,
      path: 'render-intents/:intentId/claim',
    });
    expect(route(DetailPageWorkspaceImageController, 'document')).toEqual({
      method: RequestMethod.GET,
      path: 'render-intents/:intentId/document',
    });
    expect(route(DetailPageWorkspaceImageController, 'status')).toEqual({
      method: RequestMethod.GET,
      path: 'render-intents/:intentId',
    });
    expect(route(DetailPageWorkspaceImageController, 'finalize')).toEqual({
      method: RequestMethod.POST,
      path: 'render-intents/:intentId/finalize',
    });
    expect(route(DetailPageWorkspaceImageController, 'fail')).toEqual({
      method: RequestMethod.POST,
      path: 'render-intents/:intentId/fail',
    });

  });

});

type ControllerClass = { prototype: object };

function controllerPath(controller: ControllerClass) {
  return Reflect.getMetadata(PATH_METADATA, controller);
}

function route(controller: ControllerClass, methodName: string) {
  const handler = Reflect.get(controller.prototype, methodName) as object;
  return {
    method: Reflect.getMetadata(METHOD_METADATA, handler),
    path: Reflect.getMetadata(PATH_METADATA, handler),
  };
}
