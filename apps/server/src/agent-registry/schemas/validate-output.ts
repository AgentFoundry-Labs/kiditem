import { Logger } from '@nestjs/common';
import { AGENT_OUTPUT_SCHEMAS } from './agent-output-schemas';

const logger = new Logger('AgentOutputValidator');

interface ValidationResult {
  valid: boolean;
  errors?: string[];
  data?: unknown;
}

/**
 * 에이전트 결과 JSON을 해당 type의 Zod 스키마로 검증.
 * 스키마가 없는 type은 valid: true 반환 (기본 허용).
 */
export function validateAgentOutput(agentType: string, output: unknown): ValidationResult {
  const schema = AGENT_OUTPUT_SCHEMAS[agentType];
  if (!schema) {
    return { valid: true, data: output };
  }

  const result = schema.safeParse(output);
  if (result.success) {
    return { valid: true, data: result.data };
  }

  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`,
  );
  logger.warn(`Output validation failed for ${agentType}: ${errors.join('; ')}`);
  return { valid: false, errors };
}

/**
 * stdout 원본에서 결과 JSON을 추출.
 * Claude CLI --output-format json 출력에서 result 필드 내부의 JSON 블록을 파싱.
 * 콜백 API로 전달된 결과가 아닌, stdout에서 직접 추출하는 경우 사용.
 */
export function extractResultJsonFromStdout(stdout: string): Record<string, unknown> | null {
  if (!stdout || !stdout.trim()) return null;

  // 1) Claude CLI JSON 출력에서 result 필드 파싱
  const lines = stdout.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const candidate = JSON.parse(lines[i]);
      if (candidate && typeof candidate === 'object') {
        // Claude CLI result JSON 안의 "result" 필드에서 JSON 블록 추출
        const resultText = candidate.result || '';
        if (typeof resultText === 'string') {
          const jsonMatch = resultText.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[1]);
              if (parsed && typeof parsed === 'object') return parsed;
            } catch { /* not valid JSON in code block */ }
          }
          // result 자체가 JSON 문자열일 수 있음
          try {
            const parsed = JSON.parse(resultText);
            if (parsed && typeof parsed === 'object') return parsed;
          } catch { /* not raw JSON */ }
        }
        // candidate 자체가 에이전트 결과일 수 있음 (콜백 없이 직접 출력)
        if (candidate.actions || candidate.products || candidate.suggestions || candidate.answer) {
          return candidate;
        }
      }
    } catch { continue; }
  }

  // 2) Fallback: 전체 stdout에서 JSON 블록 추출
  const match = stdout.match(/```json\n([\s\S]*?)\n```/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* ignore */ }
  }

  return null;
}
