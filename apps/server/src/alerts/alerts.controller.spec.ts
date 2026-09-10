import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AlertsController } from './alerts.controller';

const ORGANIZATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ALERT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeService() {
  return {
    list: vi.fn().mockResolvedValue([]),
    dismiss: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AlertsController', () => {
  it('lists using the organization supplied by @CurrentOrganization', async () => {
    const service = makeService();
    const controller = new AlertsController(service as any);

    await controller.findAll(ORGANIZATION_ID);

    expect(service.list).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('dismisses using both the route id and authenticated organization', async () => {
    const service = makeService();
    const controller = new AlertsController(service as any);

    await expect(controller.dismiss(ALERT_ID, ORGANIZATION_ID)).resolves.toEqual({ ok: true });
    expect(service.dismiss).toHaveBeenCalledWith(ALERT_ID, ORGANIZATION_ID);
  });

  it('exposes only the list and dismiss web commands', () => {
    const controllerMethods = Object.getOwnPropertyNames(AlertsController.prototype)
      .filter((name) => name !== 'constructor');

    expect(controllerMethods).toEqual(['findAll', 'dismiss']);
    expect(Reflect.getMetadata(PATH_METADATA, AlertsController)).toBe('alerts');
    expect(Reflect.getMetadata(METHOD_METADATA, AlertsController.prototype.findAll)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AlertsController.prototype.findAll)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, AlertsController.prototype.dismiss)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AlertsController.prototype.dismiss)).toBe(':id/dismiss');
  });
});
