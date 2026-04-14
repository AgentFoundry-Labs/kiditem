/**
 * Claude CLI child process env whitelist.
 *
 * process.env 를 그대로 전달하면 DB_URL, OPENAI_API_KEY 등 전체 시크릿이
 * bypassPermissions 모드의 CLI 자식 프로세스에 노출된다. 실행에 실제로
 * 필요한 키만 화이트리스트로 전달한다.
 */
const ALLOW_LIST = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
];

export function buildClaudeCliEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOW_LIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  env.AGENT_DATABASE_URL =
    process.env.CHATBOT_DATABASE_URL ||
    process.env.AGENT_DATABASE_URL ||
    process.env.DATABASE_URL ||
    '';
  return env;
}
