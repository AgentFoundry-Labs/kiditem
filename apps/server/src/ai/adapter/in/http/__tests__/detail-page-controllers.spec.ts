import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AiModule } from '../../../../ai.module';
import { DetailPageEditorController } from '../detail-page-editor.controller';
import { DetailPageGenerationController } from '../detail-page-generation.controller';
import { DetailPageReconcileController } from '../detail-page-reconcile.controller';

describe('detail-page route-family controllers', () => {
  it('registers the split controllers in AiModule', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AiModule) as unknown[];

    expect(controllers).toContain(DetailPageGenerationController);
    expect(controllers).toContain(DetailPageEditorController);
    expect(controllers).toContain(DetailPageReconcileController);
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

    expect(controllerPath(DetailPageReconcileController)).toBe('ai/detail-page');
    expect(route(DetailPageReconcileController, 'reconcileStuck')).toEqual({
      method: RequestMethod.POST,
      path: 'reconcile-stuck',
    });
  });

  it('keeps organization-scoped service delegation after the split', async () => {
    const service = {
      uploadInputImage: vi.fn(),
      generate: vi.fn(),
      prefill: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
      saveEditedHtml: vi.fn(),
      getEditedHtml: vi.fn(),
      cancel: vi.fn(),
      remove: vi.fn(),
    };
    const reconcile = {
      reconcile: vi.fn(),
    };
    const generation = new DetailPageGenerationController(service as never);
    const editor = new DetailPageEditorController(service as never);
    const reconcileController = new DetailPageReconcileController(reconcile as never);

    await generation.generate({ rawTitle: '상품' } as never, 'org-1', { id: 'user-1' } as never);
    await generation.prefill({ rawTitle: '상품' } as never, 'org-1');
    await editor.list('org-1', 'product-1', 'kids-playful');
    await editor.getOne('generation-1', 'org-1');
    await editor.saveEditedHtml('generation-1', 'org-1', { html: '<main />' });
    await editor.getEditedHtml('generation-1', 'org-1');
    await editor.cancel('generation-1', 'org-1');
    await editor.remove('generation-1', 'org-1');
    await reconcileController.reconcileStuck({ sinceMinutes: 30, limit: 10 }, 'org-1');

    expect(service.generate).toHaveBeenCalledWith({ rawTitle: '상품' }, 'org-1', 'user-1');
    expect(service.prefill).toHaveBeenCalledWith({ rawTitle: '상품' }, 'org-1');
    expect(service.list).toHaveBeenCalledWith('org-1', 'product-1', 'kids-playful');
    expect(service.getById).toHaveBeenCalledWith('generation-1', 'org-1');
    expect(service.saveEditedHtml).toHaveBeenCalledWith('generation-1', 'org-1', '<main />');
    expect(service.getEditedHtml).toHaveBeenCalledWith('generation-1', 'org-1');
    expect(service.cancel).toHaveBeenCalledWith('generation-1', 'org-1');
    expect(service.remove).toHaveBeenCalledWith('generation-1', 'org-1');
    expect(reconcile.reconcile).toHaveBeenCalledWith('org-1', {
      sinceMinutes: 30,
      limit: 10,
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
