import { spawn } from 'node:child_process';
import { Injectable, Logger } from '@nestjs/common';
import type {
  SourcingAssistantCliPort,
  SourcingAssistantCliRequest,
  SourcingAssistantCliResult,
} from '../../../application/port/out/runtime/sourcing-assistant-cli.port';

/**
 * 실행 파일 경로. 환경변수로만 바꿀 수 있다.
 *
 * 사용자 입력이 실행 파일 경로에 섞이지 않고, `spawn` 을 인자 배열로 호출해 셸을 거치지
 * 않는다. 셸 인젝션 경로는 원천 차단된다.
 */
const CLI_BIN = process.env.SOURCING_ASSISTANT_CLI_BIN ?? 'claude';

/**
 * 프롬프트에는 1688/쿠팡에서 긁어온 **외부 텍스트가 그대로 들어간다**. 상품명에
 * "이전 지시를 무시하고 …" 같은 문장을 심으면 그게 모델에게 지시로 읽힐 수 있다.
 * 그래서 이 CLI 는 **도구를 하나도 쓰지 못하게 묶어서** 띄운다 — 프롬프트 인젝션이
 * 성공하더라도 모델이 할 수 있는 일은 텍스트를 뱉는 것뿐이다.
 *
 * `--allowed-tools ""` 로 허용 목록을 비우고, 권한 승인을 요구하는 모드로 고정해
 * 자동 실행 경로를 남기지 않는다. 도구 실행이 필요해지면 이 상수부터 검토해야 한다.
 */
const TOOL_LOCKDOWN_ARGS = [
  '--allowed-tools',
  '',
  '--permission-mode',
  'default',
  '--strict-mcp-config',
  '--mcp-config',
  '{}',
];

/**
 * 자식에게 넘길 환경변수 **허용 목록**.
 *
 * 예전에는 `process.env` 를 통째로 넘겼는데, 그러면 `DATABASE_URL`, Supabase 서비스
 * 롤 키, 마켓플레이스 자격증명까지 CLI 프로세스로 새어 나간다. 외부 텍스트를 먹는
 * 프로세스에 서버 비밀을 들려 보낼 이유가 없으므로, 실행에 꼭 필요한 것만 고른다.
 *
 * `ANTHROPIC_API_KEY` 는 남긴다 — 키 기반 인증을 쓰는 배포가 있다.
 * `CLAUDE_*`/`ANTHROPIC_BASE_URL` 은 일부러 뺀다: 서버가 Claude Code 세션 안에서
 * 기동되면 그 값들이 상속돼 중첩 세션으로 인식하고 **응답 없이 멈춘다**(실측).
 */
const CHILD_ENV_ALLOWLIST = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TMPDIR', 'TZ', 'ANTHROPIC_API_KEY'];

function buildChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/** CLI 가 뱉는 JSON 결과의 최소 형태. 나머지 필드는 무시한다. */
interface ClaudeCliJsonResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  api_error_status?: number;
  result?: string;
}

@Injectable()
export class ClaudeCliAssistantAdapter implements SourcingAssistantCliPort {
  private readonly logger = new Logger(ClaudeCliAssistantAdapter.name);

  async run(request: SourcingAssistantCliRequest): Promise<SourcingAssistantCliResult> {
    const startedAt = Date.now();

    try {
      const stdout = await this.exec(request);
      const durationMs = Date.now() - startedAt;
      const parsed = parseJson(stdout);

      if (!parsed) {
        return {
          ok: false,
          reason: 'execution_failed',
          message: 'CLI 응답을 JSON 으로 해석하지 못했습니다.',
          durationMs,
        };
      }

      if (parsed.is_error) {
        const message = parsed.result ?? 'CLI 실행이 실패했습니다.';
        return {
          ok: false,
          reason: isAuthFailure(parsed) ? 'unauthenticated' : 'execution_failed',
          message,
          durationMs,
        };
      }

      const text = (parsed.result ?? '').trim();
      if (!text) {
        return { ok: false, reason: 'execution_failed', message: 'CLI 응답이 비어 있습니다.', durationMs };
      }

      return { ok: true, text, model: request.model, durationMs };
    } catch (error: unknown) {
      const durationMs = Date.now() - startedAt;
      const reason = classifyExecError(error);
      const message = describeError(error);
      this.logger.warn(`소싱 어시스턴트 CLI 실패(${reason}): ${message}`);
      return { ok: false, reason, message, durationMs };
    }
  }

  /**
   * CLI 를 띄우고 stdout 을 모은다.
   *
   * `execFile` 을 쓰지 않는다. `execFile` 의 콜백은 프로세스 종료가 아니라 **stdio
   * 파이프가 닫힐 때** 호출되는데, CLI 가 stdout 을 물고 있는 자식 프로세스를 남기면
   * 본체가 끝나도 콜백이 오지 않는다(실측: 단독 실행 3초, 서버 안에서는 무한 대기).
   * 그래서 `spawn` 후 프로세스의 `exit` 을 기준으로 끝낸다.
   */
  private exec(request: SourcingAssistantCliRequest): Promise<string> {
    return new Promise((resolve, reject) => {
      // 프롬프트는 stdin 이 아니라 인자로 넘긴다. stdin 파이프로 주면 서버 프로세스
      // 아래에서 CLI 가 읽기를 끝내지 못하고 잠들어 버린다(실측: 소켓조차 열지 않은 채
      // 무한 대기). 셸을 거치지 않는 인자 배열이라 주입 위험은 없다.
      const child = spawn(
        CLI_BIN,
        ['-p', request.prompt, '--output-format', 'json', '--model', request.model, ...TOOL_LOCKDOWN_ARGS],
        {
          // CLI 가 저장소 파일을 읽으러 갈 이유가 없다. 임시 디렉터리에서 실행한다.
          cwd: process.env.TMPDIR ?? '/tmp',
          env: buildChildEnv(),
          // stdin 은 즉시 EOF 를 주도록 닫아 둔다.
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        finish(() => {
          child.kill('SIGKILL');
          // 타임아웃 원인은 거의 항상 자식이 남긴 출력에 있다. 버리지 말고 실어 보낸다.
          const trace = [
            stdout.trim() && `stdout=${stdout.trim().slice(0, 400)}`,
            stderr.trim() && `stderr=${stderr.trim().slice(0, 400)}`,
          ]
            .filter(Boolean)
            .join(' | ');
          reject(
            Object.assign(new Error(trace ? `CLI timeout (${trace})` : 'CLI timeout (출력 없음)'), {
              code: 'ETIMEDOUT',
              killed: true,
            }),
          );
        });
      }, request.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (error) => finish(() => reject(error)));

      // 'close' 가 아니라 'exit' 을 듣는다 — 남은 자식이 파이프를 물고 있어도 진행한다.
      child.on('exit', () => {
        // stdout 은 exit 직후 한 틱 늦게 도착할 수 있어 마이크로태스크 한 번을 양보한다.
        setImmediate(() =>
          finish(() => {
            // CLI 는 인증 실패 같은 상황에서도 JSON 을 stdout 으로 내보내며 종료코드를
            // 0 이 아닌 값으로 준다. stdout 이 있으면 그것을 우선 해석한다.
            if (stdout.trim()) return resolve(stdout);
            reject(new Error(stderr.trim() || 'CLI 가 아무 출력도 내지 않았습니다.'));
          }),
        );
      });

    });
  }
}

function parseJson(stdout: string): ClaudeCliJsonResult | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ClaudeCliJsonResult) : null;
  } catch {
    return null;
  }
}

function isAuthFailure(parsed: ClaudeCliJsonResult): boolean {
  if (parsed.api_error_status === 401 || parsed.api_error_status === 403) return true;
  const result = parsed.result ?? '';
  return /authenticate|unauthorized|oauth|login|revoked/i.test(result);
}

function classifyExecError(error: unknown): 'cli_not_found' | 'timeout' | 'execution_failed' {
  const code = (error as { code?: string } | null)?.code;
  const killed = (error as { killed?: boolean } | null)?.killed;
  if (code === 'ENOENT') return 'cli_not_found';
  if (killed || code === 'ETIMEDOUT') return 'timeout';
  return 'execution_failed';
}

function describeError(error: unknown): string {
  if ((error as { code?: string } | null)?.code === 'ENOENT') {
    return `CLI 실행 파일을 찾을 수 없습니다 (${CLI_BIN}).`;
  }
  return error instanceof Error ? error.message : String(error);
}
