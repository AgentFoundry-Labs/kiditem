import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { ProductsModule } from '../products.module';
import { MastersController } from '../adapter/in/http/masters.controller';

describe('master product route-family controllers', () => {
  it('registers master image routes on a split controller while preserving URLs', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ProductsModule) as ControllerClass[];
    const masterImagesController = controllers.find((controller) => controller.name === 'MasterImagesController');

    expect(masterImagesController).toBeDefined();
    expect(controllerPath(masterImagesController!)).toBe('products/masters');
    expect(route(masterImagesController!, 'getImages')).toEqual({
      method: RequestMethod.GET,
      path: ':id/images',
    });
    expect(route(masterImagesController!, 'updateImages')).toEqual({
      method: RequestMethod.PATCH,
      path: ':id/images',
    });
    expect(route(masterImagesController!, 'uploadImage')).toEqual({
      method: RequestMethod.POST,
      path: ':id/images',
    });
  });

  it('keeps master CRUD/search routes on MastersController', () => {
    expect(controllerPath(MastersController)).toBe('products/masters');
    expect(route(MastersController, 'create')).toEqual({
      method: RequestMethod.POST,
      path: '/',
    });
    expect(route(MastersController, 'list')).toEqual({
      method: RequestMethod.GET,
      path: '/',
    });
    expect(route(MastersController, 'findById')).toEqual({
      method: RequestMethod.GET,
      path: ':id',
    });
    expect(methodNames(MastersController)).not.toEqual(
      expect.arrayContaining(['getImages', 'updateImages', 'uploadImage']),
    );
  });
});

type ControllerClass = { name: string; prototype: object };

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

function methodNames(controller: ControllerClass) {
  return Object.getOwnPropertyNames(controller.prototype);
}
