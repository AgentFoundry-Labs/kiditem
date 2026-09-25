import { Injectable, type OnModuleInit, SetMetadata } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { OperationKindSchema } from '@kiditem/shared/operation';
import type { OperationOwnerPort } from '../port/out/owner/operation-owner.port';

const OPERATION_OWNER_METADATA = 'kiditem:operation-owner';

/** owner 모듈의 provider 클래스에 붙이면 부팅 때 그 kind가 실행 계약에 등록된다. */
export const OperationOwner = (): ClassDecorator => SetMetadata(OPERATION_OWNER_METADATA, true);

/**
 * kind → owner 포트. 부팅(onModuleInit) 때 `@OperationOwner()` provider를 모아 한 번 만든다.
 * 같은 kind가 두 번이면 부팅을 멈춘다.
 */
@Injectable()
export class OperationOwnerRegistry implements OnModuleInit {
  private readonly owners = new Map<string, OperationOwnerPort>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance: unknown = wrapper.instance;
      if (!instance || typeof instance !== 'object') continue;
      if (!this.reflector.get<boolean>(OPERATION_OWNER_METADATA, instance.constructor)) continue;
      this.register(instance as OperationOwnerPort);
    }
  }

  register(owner: OperationOwnerPort): void {
    const kind = OperationKindSchema.parse(owner.kind);
    const existing = this.owners.get(kind);
    if (existing === owner) return;
    if (existing) throw new Error(`Operation kind ${kind} is registered twice`);
    this.owners.set(kind, owner);
  }

  find(kind: string): OperationOwnerPort | undefined {
    return this.owners.get(kind);
  }
}
