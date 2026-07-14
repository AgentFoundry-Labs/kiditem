import { describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module';
import { SupabaseAuthMiddleware } from '../middleware/supabase-auth.middleware';

describe('sourcing extension route security wiring', () => {
  it('runs the global Supabase authentication middleware on extension routes', () => {
    const supabaseForRoutes = vi.fn();
    const apply = vi.fn().mockReturnValue({ forRoutes: supabaseForRoutes });

    new AppModule().configure({ apply } as never);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(SupabaseAuthMiddleware);
    expect(supabaseForRoutes).toHaveBeenCalledWith('*');
  });
});
