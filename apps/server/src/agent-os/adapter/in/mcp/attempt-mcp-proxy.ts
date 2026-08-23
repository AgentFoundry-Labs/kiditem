import { connect } from 'node:net';

/** The child process knows only its one private Unix socket coordinate. */
export async function callAttemptMcpProxy(socketPath: string, request: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let response = '';
    socket.setEncoding('utf8');
    socket.once('error', reject);
    socket.on('data', (chunk) => { response += chunk; });
    socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`));
    socket.once('close', () => {
      try { resolve(JSON.parse(response)); } catch { reject(new Error('attempt_mcp_proxy_response_invalid')); }
    });
  });
}
