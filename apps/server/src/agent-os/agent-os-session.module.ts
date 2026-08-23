import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";

/** Controller-free durable Agent work persistence boundary. */
@Module({ imports: [PrismaModule], exports: [PrismaModule] })
export class AgentOsSessionModule {}
