import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { RegistrationSourcePort } from '../../../application/port/in/registration-source.port';

@Injectable()
export class RegistrationSourceAdapter implements RegistrationSourcePort {
  async readRegistrationBasics(transaction: OwnerTransaction, input: { organizationId: string; candidateIds: readonly string[] }) {
    if (input.candidateIds.length === 0) return [];
    const rows = await ownerTransactionClient(transaction).sourcingCandidate.findMany({
      where: { organizationId: input.organizationId, id: { in: [...input.candidateIds] }, isDeleted: false },
      select: { id: true, rawData: true },
    });
    return rows.map(row => {
      const raw = record(row.rawData);
      const manual = record(raw?.manualBasics);
      const shared = record(manual?.mallRegisterShared);
      return {
        candidateId: row.id,
        kcStatus: text(manual?.kcCertificationStatus) ?? text(raw?.kcCertificationStatus),
        kcNumber: text(manual?.kcCertificationNumber) ?? text(raw?.kcCertificationNumber) ?? text(shared?.certNumber),
      };
    });
  }
  async lock(transaction: OwnerTransaction, organizationId: string, candidateId: string): Promise<void> {
    const tx = ownerTransactionClient(transaction);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM sourcing_candidates
      WHERE id = ${candidateId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`);
  }
  async requireActive(transaction: OwnerTransaction, organizationId: string, candidateId: string): Promise<void> {
    const tx = ownerTransactionClient(transaction);
    const candidate = await tx.sourcingCandidate.findFirst({
      where: { id: candidateId, organizationId, status: 'sourced', isDeleted: false }, select: { id: true },
    });
    if (!candidate) throw new ConflictException('Source candidate is not active for registration.');
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
