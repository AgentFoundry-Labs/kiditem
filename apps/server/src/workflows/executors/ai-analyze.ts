import { registerNode } from './index';
import { getActionsForPrompt } from '../actions/catalog';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.AI_TEXT_MODEL ?? 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

interface AnalysisAction {
  type: string;
  label: string;
  reason: string;
  params: Record<string, any>;
}

interface AnalysisResult {
  summary: string;
  actions: AnalysisAction[];
  analysis: string;
  model: string;
}

registerNode('ai.analyze', async (prisma, config, context): Promise<AnalysisResult> => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  const sourceNodes = (config.source_nodes as string[]) ?? [];
  const analysisContext: Record<string, any> = {};
  for (const nodeId of sourceNodes) {
    const output = context.getOutput(nodeId);
    if (output) {
      analysisContext[nodeId] = summarizeOutput(output);
    }
  }

  const workflows = await prisma.workflowTemplate.findMany({
    where: { isActive: true },
    select: { id: true, name: true, module: true },
  });

  const workflowName = (config.workflow_name as string) ?? '워크플로우';
  const prompt = buildPrompt(workflowName, analysisContext, workflows);

  const responseSchema = {
    type: 'OBJECT' as const,
    properties: {
      summary: { type: 'STRING' as const, description: '1-2문장 핵심 요약' },
      actions: {
        type: 'ARRAY' as const,
        items: {
          type: 'OBJECT' as const,
          properties: {
            type: { type: 'STRING' as const, description: '액션 카탈로그의 type' },
            label: { type: 'STRING' as const, description: '버튼 표시 텍스트' },
            reason: { type: 'STRING' as const, description: '추천 이유 1문장' },
            params: { type: 'OBJECT' as const, description: '액션 실행에 필요한 파라미터', properties: {} },
          },
          required: ['type', 'label', 'reason'],
        },
      },
    },
    required: ['summary', 'actions'],
  };

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API 호출 실패: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  let parsed: { summary?: string; actions?: any[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      summary: '분석 완료 (응답 파싱 실패)',
      actions: [],
      analysis: text,
      model: GEMINI_MODEL,
    };
  }

  const actions: AnalysisAction[] = (parsed.actions ?? []).map((a: any) => ({
    type: a.type ?? 'alert.create',
    label: a.label ?? '',
    reason: a.reason ?? '',
    params: a.params ?? {},
  }));

  return {
    summary: parsed.summary ?? '',
    actions,
    analysis: text,
    model: GEMINI_MODEL,
  };
});

function summarizeOutput(output: Record<string, any>): Record<string, any> {
  const summary: Record<string, any> = {};

  if (typeof output.count === 'number') summary.count = output.count;
  if (typeof output.filteredOut === 'number') summary.filteredOut = output.filteredOut;
  if (typeof output.result === 'boolean') summary.conditionResult = output.result;

  const arrayKeys = ['rows', 'orders', 'products', 'items', 'reviews', 'ads'];
  for (const key of arrayKeys) {
    if (!Array.isArray(output[key])) continue;
    const arr = output[key] as any[];
    summary[key] = arr.slice(0, 10).map((item) => {
      const picked: Record<string, any> = {};
      const keepKeys = [
        'id', 'name', 'productName', 'rating', 'content',
        'profitRate', 'netProfit', 'revenue', 'adCost', 'adCostRate',
        'currentStock', 'safetyStock', 'dailySalesAvg', 'reorderPoint',
        'sellPrice', 'costCny', 'abcGrade', 'status',
      ];
      for (const k of keepKeys) {
        if (item[k] !== undefined) picked[k] = item[k];
      }
      return picked;
    });
    summary[`${key}Total`] = arr.length;
  }
  return summary;
}

function buildPrompt(
  workflowName: string,
  analysisContext: Record<string, any>,
  workflows: { id: string; name: string; module: string }[],
): string {
  const workflowList = workflows
    .map((w) => `  - module: "${w.module}", name: "${w.name}"`)
    .join('\n');

  const actionList = getActionsForPrompt();

  return `당신은 이커머스 셀러 운영 전문가 AI입니다. 워크플로우 실행 결과를 분석하고 구체적인 다음 액션을 추천하세요.

## 워크플로우: ${workflowName}

## 실행 결과:
${JSON.stringify(analysisContext, null, 2)}

## 사용 가능한 워크플로우:
${workflowList}

## 사용 가능한 액션 (이 중에서만 추천할 것):
${actionList}

## 규칙:
- 데이터에 문제가 있으면 구체적 상품명/수치를 포함한 액션 2-3개 추천
- 이상 없으면 summary에 "이상 없음"이라 적고 관련 워크플로우 실행을 추천
- actions의 type은 반드시 위 액션 목록의 type 중 하나를 사용
- params에 해당 액션의 필수 파라미터를 포함
- 데이터에 있는 실제 상품 ID와 이름을 사용

## 응답 (JSON만, 다른 텍스트 없이):
{
  "summary": "1-2문장 핵심 요약",
  "actions": [
    {
      "type": "액션 카탈로그의 type (예: product.stop_ads)",
      "label": "버튼에 표시할 텍스트",
      "reason": "왜 이 액션을 추천하는지 1문장",
      "params": { "productId": "xxx", "기타 파라미터": "값" }
    }
  ]
}`;
}
