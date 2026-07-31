import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BrowserCollectionRunIdController } from '../browser-collection-run-id.controller';

describe('BrowserCollectionRunIdController', () => {
  it('publishes one authenticated server-issued run ID endpoint', () => {
    expect(Reflect.getMetadata('path', BrowserCollectionRunIdController)).toBe(
      'browser-collection-runs',
    );
    const handler = BrowserCollectionRunIdController.prototype.issue;
    expect(Reflect.getMetadata('path', handler)).toBe('/');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.POST);

    const runIds = { issue: vi.fn().mockReturnValue({ runId: 'server-run-id' }) };
    const controller = new BrowserCollectionRunIdController(runIds as never);
    expect(controller.issue('organization-a')).toEqual({ runId: 'server-run-id' });
    expect(runIds.issue).toHaveBeenCalledTimes(1);
  });
});
