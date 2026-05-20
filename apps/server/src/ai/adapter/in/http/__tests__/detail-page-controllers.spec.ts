import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AiModule } from '../../../../ai.module';
import { DetailPageEditorController } from '../detail-page-editor.controller';
import { DetailPageGenerationController } from '../detail-page-generation.controller';

describe('detail-page route-family controllers', () => {
  it('registers the split controllers in AiModule', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AiModule) as unknown[];

    expect(controllers).toContain(DetailPageGenerationController);
    expect(controllers).toContain(DetailPageEditorController);
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
