import { Injectable } from '@nestjs/common';
import { parseOperationRunName } from '@kiditem/shared/identifiers';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { OperationAlertSourceStatePort } from '../../../application/port/out/operations/operation-alert-source-state.port';

@Injectable()
export class OperationRunAlertSourceStateAdapter
  implements OperationAlertSourceStatePort
{
  constructor(private readonly prisma: PrismaService) {}

  async find(input: Parameters<OperationAlertSourceStatePort['find']>[0]) {
    if (input.sourceType !== 'operation_run') return null;
    let parsed: ReturnType<typeof parseOperationRunName>;
    try {
      parsed = parseOperationRunName(input.sourceId as never);
    } catch {
      return null;
    }
    if (parsed.organization !== input.organizationId) return null;
    const run = await this.prisma.operationRun.findFirst({
      where: {
        id: parsed.operation,
        organizationId: input.organizationId,
      },
      select: {
        status: true,
        errorCode: true,
        errorMessage: true,
      },
    });
    if (!run) return null;
    return {
      state: run.status,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
    };
  }
}
