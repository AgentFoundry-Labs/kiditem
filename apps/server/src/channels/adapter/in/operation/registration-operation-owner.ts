import { Inject, Injectable } from '@nestjs/common';
import { MALL_AVAILABILITY_READ_KIND, REGISTRATION_KIND } from '@kiditem/shared/channels-operations';
import type { OperationPlanResult, OperationStagedChunk } from '@kiditem/shared/operation';
import type {
  JsonObject,
  OperationFinalizeContext,
  OperationOwnerPort,
  OperationPlanContext,
} from '../../../../common/operation/application/port/out/owner/operation-owner.port';
import { OperationOwner } from '../../../../common/operation/application/port/out/owner/operation-owner.decorator';
import {
  MALL_AVAILABILITY_READ_OPERATION_PORT,
  REGISTRATION_OPERATION_PORT,
  type MallAvailabilityReadOperationPort,
  type RegistrationOperationPort,
} from '../../../application/port/in/registration-operation.port';

/**
 * 몰 등록 실행 kind `channels.registration` 의 owner 포트(ADR-0025, KID-364). producer 는 확장 몰 쓰기 모듈(KID-256)이고,
 * 확장이 몰에 제출했지만 결과를 못 읽으면 finish `reconciling` 으로 멈춰 운영자 확인(`registration-operations/:id/confirm`)을 기다린다.
 * `onFailed` 는 없다 — 실패는 원장에 아무것도 쓰지 않고, 등록 상태 reader 가 실행을 읽는다.
 */
@OperationOwner()
@Injectable()
export class RegistrationOperationOwner implements OperationOwnerPort {
  readonly kind = REGISTRATION_KIND;
  constructor(@Inject(REGISTRATION_OPERATION_PORT) private readonly registrations: RegistrationOperationPort) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.registrations.plan(scope, context);
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    return {
      result: await this.registrations.finalize(chunks, {
        tx: context.tx,
        organizationId: context.organizationId,
        operationId: context.operationId,
        plan: context.plan,
        result: context.result ?? null,
      }),
    };
  }
}

/** 몰 판매 상태 읽기 kind `channels.mall_availability_read` 의 owner 포트(KID-364). 원장 쓰기 없음. */
@OperationOwner()
@Injectable()
export class MallAvailabilityReadOperationOwner implements OperationOwnerPort {
  readonly kind = MALL_AVAILABILITY_READ_KIND;
  constructor(@Inject(MALL_AVAILABILITY_READ_OPERATION_PORT) private readonly reads: MallAvailabilityReadOperationPort) {}

  plan(scope: JsonObject, context: OperationPlanContext): Promise<OperationPlanResult> {
    return this.reads.plan(scope, context);
  }

  async finalize(chunks: OperationStagedChunk[], _window: unknown, context: OperationFinalizeContext) {
    return { result: await this.reads.finalize(chunks, { organizationId: context.organizationId, plan: context.plan }) };
  }
}
