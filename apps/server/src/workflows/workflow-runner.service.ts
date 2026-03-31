import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DAG } from './dag';
import { WorkflowContext } from './context';
import { getExecutor } from './executors/index';
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
      const nodeId = stack.pop()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const nodeDef = dag.nodes.get(nodeId);
      if (!nodeDef) continue;

      const executor = getExecutor(nodeDef.type);
      if (!executor) {
        const error = `No executor for node type: ${nodeDef.type}`;
        this.logger.error(error);
        await this.recordStepError(runId, nodeDef, error);
        await this.recordRunError(runId, error);
        return;
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
        for (const next of nextNodes) {
          if (!visited.has(next)) {
            stack.push(next);
          }
        }
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

        await this.recordRunError(runId, `Step ${nodeId} failed: ${message}`);
        return;
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
