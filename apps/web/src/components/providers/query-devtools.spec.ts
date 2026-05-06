import { afterEach, describe, expect, it } from 'vitest';
import { shouldRenderQueryDevtools } from './query-devtools';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ENABLE_QUERY_DEVTOOLS = process.env.NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS;

describe('shouldRenderQueryDevtools', () => {
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_ENABLE_QUERY_DEVTOOLS === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS = ORIGINAL_ENABLE_QUERY_DEVTOOLS;
    }
  });

  it('keeps query devtools disabled by default in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS;

    expect(shouldRenderQueryDevtools()).toBe(false);
  });

  it('renders query devtools only when explicitly enabled in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS = 'true';

    expect(shouldRenderQueryDevtools()).toBe(true);
  });

  it('does not render query devtools in production even when enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_ENABLE_QUERY_DEVTOOLS = 'true';

    expect(shouldRenderQueryDevtools()).toBe(false);
  });
});
