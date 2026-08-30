import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  OPERATION_POST_ACCEPTING_HOOK_REGISTRY_PORT,
  type OperationPostAcceptingHookRegistryPort,
} from '../../../operations/application/port/in/operation-post-accepting-hook-registry.port';
import {
  OPERATION_ALERT_REPOSITORY_PORT,
  type OperationAlertRepositoryPort,
} from '../port/out/repository/operation-alert.repository.port';
import { OperationAlertService } from './operation-alert.service';

const BATCH_SIZE = 100;

@Injectable()
export class OperationRunAlertRecoveryService implements OnModuleInit {
  constructor(
    @Inject(OPERATION_ALERT_REPOSITORY_PORT)
    private readonly repository: OperationAlertRepositoryPort,
    private readonly alerts: OperationAlertService,
    @Inject(OPERATION_POST_ACCEPTING_HOOK_REGISTRY_PORT)
    private readonly hooks: OperationPostAcceptingHookRegistryPort,
  ) {}

  onModuleInit(): void {
    this.hooks.register({
      key: 'operation-run-alerts',
      priority: 40,
      run: (signal) => this.run(signal),
    });
  }

  async run(signal: AbortSignal): Promise<void> {
    let afterId: string | null = null;
    while (true) {
      signal.throwIfAborted();
      const rows = await this.repository.listOpenBySourceType({
        sourceType: 'operation_run',
        afterId,
        limit: BATCH_SIZE,
      });
      signal.throwIfAborted();
      if (rows.length === 0) return;
      for (const row of rows) {
        signal.throwIfAborted();
        await this.alerts.reconcileSource(row);
        afterId = row.id;
      }
      if (rows.length < BATCH_SIZE) return;
    }
  }
}
