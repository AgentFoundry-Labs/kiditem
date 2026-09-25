import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { OPERATION_LEASE_MS, OperationKindSchema } from '@kiditem/shared/operation';
import type { OperationOwnerPort } from '../port/out/owner/operation-owner.port';
import { OPERATION_OWNER_METADATA } from '../port/out/owner/operation-owner.decorator';

/**
 * kind → owner 포트. 부팅(onModuleInit) 때 `@OperationOwner()` provider를 모아 한 번 만든다.
 * 같은 kind가 두 번이면 부팅을 멈춘다.
 */
@Injectable()
export class OperationOwnerRegistry implements OnModuleInit {
  private readonly owners = new Map<string, OperationOwnerPort>();
  private readonly logger = new Logger(OperationOwnerRegistry.name);

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
    // 부팅 로그로 어떤 kind가 켜졌는지 확인한다(예: 로컬·QA의 `test.echo`).
    this.logger.log(`operation kinds: ${[...this.owners.keys()].sort().join(', ') || '(none)'}`);
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

  /** kind의 임대 길이. owner가 정하지 않았으면 계약 기본 30분(KID-358). */
  leaseMs(kind: string): number {
    return this.owners.get(kind)?.leaseMs ?? OPERATION_LEASE_MS;
  }
}
