import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import { ownerTransactionClient } from '../../../../prisma/owner-transaction';
import type { RegistrationSourcePort } from '../../../application/port/in/registration-source.port';

@Injectable()
export class RegistrationSourceAdapter implements RegistrationSourcePort {
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
