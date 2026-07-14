import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module';
import { SourcingExtensionAuthMiddleware } from '../middleware/sourcing-extension-auth.middleware';
import { SupabaseAuthMiddleware } from '../middleware/supabase-auth.middleware';

describe('sourcing extension route security wiring', () => {
  it('runs extension-token authentication on the exact 1688 trend ingest route', () => {
    const extensionForRoutes = vi.fn();
    const supabaseForRoutes = vi.fn();
    const apply = vi.fn()
      .mockReturnValueOnce({ forRoutes: extensionForRoutes })
      .mockReturnValueOnce({ forRoutes: supabaseForRoutes });

    new AppModule().configure({ apply } as never);

    expect(apply).toHaveBeenNthCalledWith(1, SourcingExtensionAuthMiddleware);
    expect(extensionForRoutes).toHaveBeenCalledWith(
      { path: 'sourcing/extension/product-data', method: RequestMethod.ALL },
      { path: 'sourcing/extension/session/renew', method: RequestMethod.ALL },
      { path: 'sourcing/extension/trend/1688-results', method: RequestMethod.ALL },
    );
    expect(apply).toHaveBeenNthCalledWith(2, SupabaseAuthMiddleware);
    expect(supabaseForRoutes).toHaveBeenCalledWith('*');
  });
});
