import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RegistrationSourcePort } from '../../../application/port/in/registration-source.port';

@Injectable()
export class RegistrationSourceAdapter implements RegistrationSourcePort {
  async lock(transaction: object, organizationId: string, candidateId: string): Promise<void> {
    const tx = transaction as Prisma.TransactionClient;
    await tx.$queryRaw(Prisma.sql`SELECT id FROM sourcing_candidates
      WHERE id = ${candidateId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`);
  }
  async requireActive(transaction: object, organizationId: string, candidateId: string): Promise<void> {
    const tx = transaction as Prisma.TransactionClient;
    const candidate = await tx.sourcingCandidate.findFirst({
      where: { id: candidateId, organizationId, status: 'sourced', isDeleted: false }, select: { id: true },
    });
    if (!candidate) throw new ConflictException('Source candidate is not active for registration.');
  }
}
