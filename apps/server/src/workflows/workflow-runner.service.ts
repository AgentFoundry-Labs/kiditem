import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DAG } from './dag';
import { WorkflowContext } from './context';
import { getExecutor, isConcurrencySafe } from './executors/index';
import './executors/builtin';

@Injectable()
export class WorkflowRunnerService {
  private readonly logger = new Logger(WorkflowRunnerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runWorkflow(runId: string, templateId: string): Promise<void> {
    const template = await this.prisma.workflowTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      await this.prisma.workflowRun.update({
        where: { id: runId },
        data: { status: 'failed', error: 'Template not found' },
      });
      return;
    }

    const run = await this.prisma.workflowRun.findUnique({ where: { id: runId } });
    const runContext = (run?.contextData as Record<string, any>) ?? {};

    const dag = new DAG(
      template.nodesJson as any[],
      template.edgesJson as any[],
    );
    const context = new WorkflowContext();

    await this.prisma.workflowRun.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date() },
    });

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
            this.executeNode(runId, nodeId, dag, context, template, runContext),
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
            await this.recordRunError(runId, `Step ${nodeId} failed: ${message}`);
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
          ).catch(async (err) => {
            const message = err instanceof Error ? err.message : String(err);
            await this.recordRunError(runId, `Step ${nodeId} failed: ${message}`);
            return null;
          });

          if (result === null) return;

          for (const next of result.nextNodes) {
            if (!visited.has(next)) stack.push(next);
          }
        }
      }
    }

    await this.prisma.workflowRun.update({
      where: { id: runId },
      data: { status: 'completed', completedAt: new Date() },
    });
  }

  async runBatch(
    items: { runId: string; templateId: string }[],
  ): Promise<void> {
    for (const item of items) {
      await this.runWorkflow(item.runId, item.templateId);
    }
  }

  private async executeNode(
    runId: string,
    nodeId: string,
    dag: DAG,
    context: WorkflowContext,
    template: { companyId: string },
    runContext: Record<string, any>,
  ): Promise<{ nextNodes: string[] }> {
    const nodeDef = dag.nodes.get(nodeId);
    if (!nodeDef) return { nextNodes: [] };

    const executor = getExecutor(nodeDef.type);
    if (!executor) {
      const error = `No executor for node type: ${nodeDef.type}`;
      this.logger.error(error);
      await this.recordStepError(runId, nodeDef, error);
      throw new Error(error);
    }

    const stepRun = await this.prisma.workflowStepRun.create({
      data: {
        runId,
        nodeId,
        nodeType: nodeDef.type,
        nodeLabel: nodeDef.label,
        status: 'running',
        startedAt: new Date(),
      },
    });

    try {
      const resolvedConfig = context.resolveConfig({
        ...nodeDef.config,
        company_id: template.companyId,
        _context: runContext,
      });
      const output = await executor(this.prisma, resolvedConfig, context);
      context.setOutput(nodeId, output);

      await this.prisma.workflowStepRun.update({
        where: { id: stepRun.id },
        data: {
          status: 'completed',
          outputData: output as any,
          completedAt: new Date(),
        },
      });

      const branch = nodeDef.type.startsWith('condition.')
        ? (output.branch as string) ?? null
        : null;
      const nextNodes = dag.getNextNodes(nodeId, branch);
      return { nextNodes };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Step ${nodeId} failed: ${message}`);

      await this.prisma.workflowStepRun.update({
        where: { id: stepRun.id },
        data: {
          status: 'failed',
          error: message,
          completedAt: new Date(),
        },
      });

      throw err;
    }
  }

  private async recordStepError(
    runId: string,
    nodeDef: { id: string; type: string; label: string },
    error: string,
  ) {
    await this.prisma.workflowStepRun.create({
      data: {
        runId,
        nodeId: nodeDef.id,
        nodeType: nodeDef.type,
        nodeLabel: nodeDef.label,
        status: 'failed',
        error,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
  }

  private async recordRunError(runId: string, error: string) {
    await this.prisma.workflowRun.update({
      where: { id: runId },
      data: { status: 'failed', error, completedAt: new Date() },
    });
  }

}
