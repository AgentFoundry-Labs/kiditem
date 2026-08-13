import { SetMetadata } from '@nestjs/common';

export const SERVICE_AUTH_KEY = 'serviceAuth';

/**
 * Defers browser-session authentication to a dedicated service credential
 * guard. A route using this marker must also install that guard.
 */
export const ServiceAuth = () => SetMetadata(SERVICE_AUTH_KEY, true);
