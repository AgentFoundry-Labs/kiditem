import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { OperationLifecycleGateService } from './operation-lifecycle-gate.service';
import { OperationRunWorkerService } from './operation-run-worker.service';
import { OperationSchedulerService } from './operation-scheduler.service';

@Injectable()
export class OperationWorkerLifecycleService implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(private readonly gate: OperationLifecycleGateService, private readonly scheduler: OperationSchedulerService, private readonly worker: OperationRunWorkerService) {}
  onApplicationBootstrap(): void { if (this.gate.state() === 'BOOTSTRAPPING') this.gate.open(); this.scheduler.start(); this.worker.start(); }
  onModuleDestroy(): void { const reason = new Error('operation_worker_stopped'); this.gate.beginStopping(); this.scheduler.stopIntake(reason); this.worker.stopIntake(reason); this.worker.abortActive(reason); }
}
