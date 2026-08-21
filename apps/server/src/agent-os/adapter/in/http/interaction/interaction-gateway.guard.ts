import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  INTERACTION_GATEWAY_SHARED_SECRET,
  readRequiredInteractionSecret,
} from '../../../../application/port/in/interaction/interaction-gateway-config.port';
import type { Request } from 'express';

export { readRequiredInteractionSecret };

const GATEWAY_HEADER = 'x-kiditem-interaction-gateway';

@Injectable()
export class InteractionGatewayGuard implements CanActivate {
  constructor(
    @Inject(INTERACTION_GATEWAY_SHARED_SECRET)
    private readonly expectedSecret: Buffer,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const suppliedHeader = request.headers[GATEWAY_HEADER];
    if (typeof suppliedHeader !== 'string') throw gatewayUnauthorized();
    const supplied = Buffer.from(suppliedHeader, 'utf8');
    if (
      supplied.byteLength !== this.expectedSecret.byteLength ||
      !timingSafeEqual(supplied, this.expectedSecret)
    ) {
      throw gatewayUnauthorized();
    }
    return true;
  }
}

function gatewayUnauthorized(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INTERACTION_GATEWAY_UNAUTHORIZED',
    message: 'The interaction gateway credential is invalid.',
  });
}
