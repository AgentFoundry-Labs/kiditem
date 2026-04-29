import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import { DAG } from './dag';
import { WorkflowContext } from './context';
import { getExecutor, isConcurrencySafe, type ExecutorServices } from '../executors/index';
import '../executors/builtin';
import { PANEL_EVENTS } from '../../automation/adapter/out/panel-event/panel-events';
import { buildWorkflowPanelItem } from '../../automation/mapper/panel-event/workflow-run.mapper';

/** Subset of WorkflowTemplate fields needed for node execution */
interface WorkflowTemplateRef {
  companyId: string;
}

/** User-provided context data passed when triggering a workflow run */
type WorkflowRunContext = Record<string, unknown>;

/**
 * Internal workflow execution engine. Trusted-internal boundary:
 * methods on this service must NOT be exposed through any controller.
 *
 * `WorkflowsService` is the sole caller and is responsible for verifying
 * tenant ownership (companyId scope on both WorkflowTemplate and WorkflowRun)
 * before invoking `runWorkflow` / `runBatch`. As a defense-in-depth measure
 * the runner re-binds `companyId` on every Prisma read and write, so a
 * mismatched (runId, templateId, companyId) triple does not cross tenants
 * even if a buggy caller invokes the runner directly.
 *
 * Do NOT call the runner from a controller, MQ consumer, or cron handler
 * without first re-verifying tenant scope of the run + template.
 */
@Injectable()
export class WorkflowRunnerService {
  private readonly logger = new Logger(WorkflowRunnerService.name);
  private readonly executorServices: ExecutorServices;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly agentRegistry?: AgentRegistryService,
  ) {
    this.executorServices = { agentRegistry: this.agentRegistry };
  }

  private async emitPanelUpsert(runId: string, companyId: string): Promise<void> {
    try {
      const result = await buildWorkflowPanelItem(this.prisma, runId, companyId);
      if (!result) return;
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, result);
    } catch (err) {
      this.logger.warn(`[workflow-runner] Panel emit failed for run ${runId}: ${err}`);
    }
  }

  async runWorkflow(runId: string, templateId: string, companyId: string): Promise<void> {
    const template = await this.prisma.workflowTemplate.findFirst({
      where: { id: templateId, companyId },
    });
    if (!template) {
      await this.prisma.workflowRun.updateMany({
        where: { id: runId, companyId },
        data: { status: 'failed', error: 'Template not found' },
      });
      await this.emitPanelUpsert(runId, companyId);
      return;
    }

    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, companyId },
    });
    if (!run) {
      this.logger.warn(`Workflow run ${runId} not found for company ${companyId}`);
      return;
    }
    const runContext: WorkflowRunContext = (run?.contextData as WorkflowRunContext) ?? {};

    const dag = new DAG(
      template.nodesJson as any[],
      template.edgesJson as any[],
    );
    const context = new WorkflowContext();

    await this.prisma.workflowRun.updateMany({
      where: { id: runId, companyId },
      data: { status: 'running', startedAt: new Date() },
    });
    await this.emitPanelUpsert(runId, companyId);

    const stack = dag.getStartNodes();
    const visited = new Set<string>();

    while (stack.length > 0) {
      // Drain the entire stack — all nodes currently in the stack are ready
      // (their dependencies have already been executed and visited).
      const readyNodeIds = [...new Set(stack.splice(0))].filter(
        (id) => !visited.has(id),
      );

      if (readyNodeIds.length === 0) continue;

      const allSafe = readyNodeIds.every((id) => {
        const def = dag.nodes.get(id);
        return def ? isConcurrencySafe(def.type) : false;
      });

      if (allSafe && readyNodeIds.length > 1) {
        // Run all ready nodes concurrently
        const results = await Promise.allSettled(
          readyNodeIds.map((nodeId) =>
            this.executeNode(runId, nodeId, dag, context, template, runContext, companyId),
          ),
        );

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const nodeId = readyNodeIds[i];
          if (result.status === 'rejected') {
            const message =
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason);
            await this.recordRunError(runId, `Step ${nodeId} failed: ${message}`, companyId);
            return;
          }
          visited.add(nodeId);
          for (const next of result.value.nextNodes) {
            if (!visited.has(next)) stack.push(next);
          }
        }
      } else {
        // Sequential execution (default — backward compatible)
        for (const nodeId of readyNodeIds) {
          visited.add(nodeId);

          const result = await this.executeNode(
            runId,
            nodeId,
            dag,
            context,
            template,
            runContext,
            companyId,
          ).catch(async (err) => {
            const message = err instanceof Error ? err.message : String(err);
            await this.recordRunError(runId, `Step ${nodeId} failed: ${message}`, companyId);
            return null;
          });

          if (result === null) return;

          for (const next of result.nextNodes) {
            if (!visited.has(next)) stack.push(next);
          }
        }
      }
    }

    await this.prisma.workflowRun.updateMany({
      where: { id: runId, companyId },
      data: { status: 'succeeded', completedAt: new Date() },
    });
    await this.emitPanelUpsert(runId, companyId);
  }

  async runBatch(
    items: { runId: string; templateId: string; companyId: string }[],
  ): Promise<void> {
    for (const item of items) {
      await this.runWorkflow(item.runId, item.templateId, item.companyId);
    }
  }

  private async executeNode(
    runId: string,
    nodeId: string,
    dag: DAG,
    context: WorkflowContext,
    template: WorkflowTemplateRef,
    runContext: WorkflowRunContext,
    companyId: string,
  ): Promise<{ nextNodes: string[] }> {
    const nodeDef = dag.nodes.get(nodeId);
    if (!nodeDef) return { nextNodes: [] };

    const executor = getExecutor(nodeDef.type);
    if (!executor) {
      const error = `No executor for node type: ${nodeDef.type}`;
      this.logger.error(error);
      await this.recordStepError(runId, nodeDef, error, companyId);
      throw new Error(error);
    }

    const stepEntry = {
      nodeId,
      nodeType: nodeDef.type,
      nodeLabel: nodeDef.label,
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null as string | null,
      outputData: null as unknown,
      error: null as string | null,
    };

    // Append step to WorkflowRun.steps Json array
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, companyId },
    });
    const steps = (run?.steps as unknown[] ?? []);
    const stepIndex = steps.length;
    steps.push(stepEntry);
    await this.prisma.workflowRun.updateMany({
      where: { id: runId, companyId },
      data: { steps: steps as any },
    });
    await this.emitPanelUpsert(runId, companyId);

    try {
      // Tenant scope is owned by the runner, not the template author.
      // Strip any caller- or template-supplied scope/runtime metadata from
      // the node config before injecting the runner-trusted values, so
      // side-effect executors and agent delegation cannot be coerced into a
      // foreign tenant or forged workflow trace by editing template JSON.
      const {
        company_id: _ignoredCompanyId,
        _context: _ignoredCtx,
        _workflow_run_id: _ignoredWorkflowRunId,
        _workflow_node_id: _ignoredWorkflowNodeId,
        ...safeNodeConfig
      } =
        nodeDef.config ?? {};
      const resolvedConfig = context.resolveConfig({
        ...safeNodeConfig,
        company_id: template.companyId,
        _context: runContext,
        _workflow_run_id: runId,
        _workflow_node_id: nodeId,
      });
      const output = await executor(this.prisma, resolvedConfig, context, this.executorServices);
      context.setOutput(nodeId, output);

      stepEntry.status = 'succeeded';
      stepEntry.outputData = output;
      stepEntry.completedAt = new Date().toISOString();
      steps[stepIndex] = stepEntry;
      await this.prisma.workflowRun.updateMany({
        where: { id: runId, companyId },
        data: { steps: steps as any },
      });
      await this.emitPanelUpsert(runId, companyId);

      const branch = nodeDef.type.startsWith('condition.')
        ? (output.branch as string) ?? null
        : null;
      const nextNodes = dag.getNextNodes(nodeId, branch);
      return { nextNodes };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Step ${nodeId} failed: ${message}`);

      stepEntry.status = 'failed';
      stepEntry.error = message;
      stepEntry.completedAt = new Date().toISOString();
      steps[stepIndex] = stepEntry;
      await this.prisma.workflowRun.updateMany({
        where: { id: runId, companyId },
        data: { steps: steps as any },
      });
      await this.emitPanelUpsert(runId, companyId);

      throw err;
    }
  }

  private async recordStepError(
    runId: string,
    nodeDef: { id: string; type: string; label: string },
    error: string,
    companyId: string,
  ) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, companyId },
    });
    const steps = (run?.steps as unknown[] ?? []);
    steps.push({
      nodeId: nodeDef.id,
      nodeType: nodeDef.type,
      nodeLabel: nodeDef.label,
      status: 'failed',
      error,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outputData: null,
    });
    await this.prisma.workflowRun.updateMany({
      where: { id: runId, companyId },
      data: { steps: steps as any },
    });
    await this.emitPanelUpsert(runId, companyId);
  }

  private async recordRunError(runId: string, error: string, companyId: string) {
    await this.prisma.workflowRun.updateMany({
      where: { id: runId, companyId },
      data: { status: 'failed', error, completedAt: new Date() },
    });
    await this.emitPanelUpsert(runId, companyId);
  }

}
