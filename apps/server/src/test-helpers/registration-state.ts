import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { RegistrationStateService } from '../channels/application/service/registration/registration-state.service';
import { RegistrationStateRepositoryAdapter } from '../channels/adapter/out/persistence/registration-state.repository.adapter';
import { RegistrableContentFactsAdapter } from '../channels/adapter/out/content/registrable-content-facts.adapter';
import { RegistrationContentFactsRepositoryAdapter } from '../content/adapter/out/repository/registration-content-facts.repository.adapter';
import type { RegistrationStatePort } from '../channels/application/port/in/registration-state.port';

/** 하나뿐인 등록 상태 reader(KID-320)를 실제 Channels · Content 어댑터로 엮는다. */
export function realRegistrationStates(prisma: PrismaClient | PrismaService): RegistrationStatePort {
  const db = prisma as unknown as PrismaService;
  return new RegistrationStateService(
    new RegistrationStateRepositoryAdapter(db),
    new RegistrableContentFactsAdapter(new RegistrationContentFactsRepositoryAdapter(db)),
  );
}
