import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DAG } from './dag';
import { WorkflowContext } from './context';
import { getExecutor, recordActivity } from './executors/index';
import { getActionsForPrompt } from './actions/catalog';
import './executors/builtin';
import './executors/ai-analyze';

@Injectable()
export class WorkflowRunnerService {
  private readonly logger = new Logger(WorkflowRunnerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async runWorkflow(runId: string, templateId: string, opts?: { skipAnalysis?: boolean }): Promise<void> {
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

    if (!opts?.skipAnalysis) {
      await this.runAnalysisAndRecord(
        template.companyId,
        { [template.name]: context.getAllOutputs() },
        runContext,
      );
    }
  }

  async runBatch(
    items: { runId: string; templateId: string }[],
    batchContext?: Record<string, any>,
  ): Promise<void> {
    const allOutputs: Record<string, Record<string, any>> = {};
    let companyId = '';

    for (const item of items) {
      await this.runWorkflow(item.runId, item.templateId, { skipAnalysis: true });

      const run = await this.prisma.workflowRun.findUnique({
        where: { id: item.runId },
        include: { template: true, steps: { orderBy: { startedAt: 'asc' as const } } },
      });
      if (!run) continue;
      companyId = run.template.companyId;

      for (const step of run.steps) {
        if (step.outputData) {
          allOutputs[`${run.template.name}:${step.nodeLabel}`] = step.outputData as Record<string, any>;
        }
      }
    }

    if (!companyId) return;

    await this.runAnalysisAndRecord(companyId, allOutputs, batchContext ?? {});
  }

  private async runAnalysisAndRecord(
    companyId: string,
    allOutputs: Record<string, Record<string, any>>,
    runContext: Record<string, any>,
  ): Promise<void> {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
    const GEMINI_MODEL = process.env.AI_TEXT_MODEL ?? 'gemini-2.5-flash';
    if (!GEMINI_API_KEY) return;

    const workflows = await this.prisma.workflowTemplate.findMany({
      where: { isActive: true },
      select: { name: true, module: true },
    });

    const summarized: Record<string, any> = {};
    for (const [key, outputs] of Object.entries(allOutputs)) {
      if (typeof outputs !== 'object') continue;
      for (const [nodeId, output] of Object.entries(outputs)) {
        const s: Record<string, any> = {};
        if (typeof output.count === 'number') s.count = output.count;
        if (typeof output.filteredOut === 'number') s.filteredOut = output.filteredOut;
        const arrayKeys = ['rows', 'orders', 'products', 'items', 'reviews', 'ads'];
        for (const ak of arrayKeys) {
          if (Array.isArray(output[ak])) {
            s[`${ak}Total`] = output[ak].length;
            s[ak] = (output[ak] as any[]).slice(0, 5).map((item: any) => {
              const picked: Record<string, any> = {};
              for (const k of ['id', 'name', 'productName', 'profitRate', 'netProfit', 'currentStock', 'safetyStock', 'rating', 'sellPrice', 'abcGrade', 'status']) {
                if (item[k] !== undefined) picked[k] = item[k];
              }
              return picked;
            });
          }
        }
        if (Object.keys(s).length > 0) summarized[`${key}:${nodeId}`] = s;
      }
    }

    const actionList = getActionsForPrompt();
    const wfList = workflows.map((w: any) => `${w.name} (${w.module})`).join(', ');
    const contextInfo = runContext.productId
      ? `\n## 분석 대상: 상품 ID ${runContext.productId} (이 상품 중심으로 분석)`
      : '';

    const prompt = `당신은 이커머스 셀러 운영 전문가 AI입니다. 워크플로우 실행 결과를 분석하고 구체적 액션을 추천하세요.
${contextInfo}
## 실행 결과:
${JSON.stringify(summarized, null, 2)}

## 사용 가능한 워크플로우: ${wfList}

## 사용 가능한 액션:
${actionList}

## 규칙:
- 결과를 교차 분석 (적자+재고 부족 = 정리 추천 등)
- 구체적 상품명/수치 포함
- 액션 카탈로그의 type만 사용
- 이상 없으면 간결하게 "이상 없음" + 관련 워크플로우 추천`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              summary: { type: 'STRING' },
              actions: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    type: { type: 'STRING' },
                    label: { type: 'STRING' },
                    reason: { type: 'STRING' },
                    params: { type: 'OBJECT', properties: {} },
                  },
                  required: ['type', 'label', 'reason'],
                },
              },
            },
            required: ['summary', 'actions'],
          },
        },
      }),
    });

    if (!res.ok) {
      this.logger.error(`AI analysis API failed: ${res.status}`);
      return;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    let parsed: { summary?: string; actions?: any[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { summary: '분석 완료', actions: [] };
    }

    const objectType = runContext.productId ? 'product' : 'company';
    const objectId = runContext.productId ?? companyId;

    const stepsSummary: { workflow: string; label: string; count?: number; filteredOut?: number }[] = [];
    for (const [key, outputs] of Object.entries(allOutputs)) {
      for (const [nodeId, output] of Object.entries(outputs)) {
        if (typeof output.count === 'number') {
          stepsSummary.push({
            workflow: key,
            label: nodeId,
            count: output.count,
            filteredOut: output.filteredOut,
          });
        }
      }
    }

    await recordActivity(this.prisma, {
      companyId,
      objectType,
      objectId,
      eventType: 'workflow_analysis',
      source: 'workflow:AI분석',
      title: parsed.summary ?? '분석 완료',
      data: {
        actions: parsed.actions ?? [],
        steps: stepsSummary,
      },
    }).catch((err) => {
      this.logger.error(`Activity creation failed: ${err instanceof Error ? err.message : err}`);
    });
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
