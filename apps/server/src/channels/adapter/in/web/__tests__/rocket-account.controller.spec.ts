import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RocketAccountController } from '../account/rocket-account.controller';

describe('RocketAccountController', () => {
  it('exposes one organization-scoped bootstrap command with no client identity input', async () => {
    expect(Reflect.getMetadata('path', RocketAccountController)).toBe(
      'channels/accounts/rocket',
    );
    expect(Reflect.getMetadata(
      'path',
      RocketAccountController.prototype.bootstrap,
    )).toBe('bootstrap');
    expect(Reflect.getMetadata(
      'method',
      RocketAccountController.prototype.bootstrap,
    )).toBe(RequestMethod.POST);

    const accounts = { ensureRocketAccount: vi.fn().mockResolvedValue({ id: 'account-1' }) };
    const controller = new RocketAccountController(accounts as never);

    await expect(controller.bootstrap('org-1')).resolves.toEqual({ id: 'account-1' });
    expect(accounts.ensureRocketAccount).toHaveBeenCalledWith('org-1');
  });
});
