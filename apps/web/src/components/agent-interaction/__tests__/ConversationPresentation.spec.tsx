import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentConversationMessage } from '../AgentConversationMessage';
import { ConversationFlow } from '../ConversationFlow';

const runtimeMock = vi.hoisted(() => vi.fn());

vi.mock('../ConversationRuntimeHost', () => ({
  useConversationRuntime: () => runtimeMock(),
}));

vi.mock('../AgentConversationComposer', () => ({
  AgentConversationComposer: () => <div data-testid="conversation-composer" />,
}));

function runtimeWithMessages(messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>) {
  return {
    activeConversation: null,
    draft: { conversationId: 'draft-1', agentKey: null, provider: null, model: null, reasoningEffort: null, message: '' },
    conversationId: 'draft-1',
    runtime: null,
    readiness: undefined,
    turnPreference: { model: null, reasoningEffort: null, needsReview: false },
    messages,
    isDraft: true,
    isRunning: false,
    turnEnded: null,
    start: vi.fn(),
    interrupt: vi.fn(),
    updateDraft: vi.fn(),
  } as never;
}

describe('conversation presentation', () => {
  it('shows empty guidance only while the draft message lane is empty', () => {
    runtimeMock.mockReturnValue(runtimeWithMessages([]));
    const { rerender } = render(
      <ConversationFlow emptyState={<p data-testid="idle-guidance">대화를 시작해 보세요.</p>} />,
    );

    expect(screen.getByTestId('idle-guidance')).toBeVisible();

    runtimeMock.mockReturnValue(runtimeWithMessages([
      { id: 'first-user-message', role: 'user', content: '첫 요청입니다.' },
    ]));
    rerender(<ConversationFlow emptyState={<p data-testid="idle-guidance">대화를 시작해 보세요.</p>} />);

    expect(screen.queryByTestId('idle-guidance')).not.toBeInTheDocument();
    expect(screen.getByText('첫 요청입니다.')).toBeVisible();
  });

  it('renders user messages as opaque deep-purple bubbles and structured assistant prose with one context identity', () => {
    const { rerender } = render(
      <AgentConversationMessage
        contextLabel="소싱 Agent"
        message={{ id: 'user-1', role: 'user', content: '상품 후보를 비교해 주세요.' }}
      />,
    );

    expect(screen.getByRole('article')).toHaveClass('justify-end');
    expect(screen.getByText('상품 후보를 비교해 주세요.').parentElement).toHaveClass(
      'bg-conversation-user',
      'text-conversation-user-foreground',
      'rounded-[22px]',
    );

    rerender(
      <AgentConversationMessage
        contextLabel="소싱 Agent"
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: '## 비교 결과\n\n[공급처 보기](https://example.com/supplier)와 `SKU-101`을 확인했습니다.\n\n- 가격\n- 재고\n\n1. 우선 검토\n2. 공급처 확인\n\n```ts\nconst approved = true;\n```',
        }}
      />,
    );

    expect(screen.getByText('소싱 Agent')).toBeVisible();
    expect(screen.getByRole('article').firstElementChild).toHaveClass('w-full', 'bg-card', 'text-foreground');
    expect(screen.getByRole('article').firstElementChild).not.toHaveClass('bg-transparent', 'backdrop-blur-sm', 'bg-white/60');
    expect(screen.getByTestId('assistant-identity-marker')).toHaveAttribute('data-context-mark', 'sourcing');
    expect(screen.getByTestId('assistant-identity-marker')).toHaveClass('bg-primary', 'text-primary-foreground');
    expect(screen.getByRole('heading', { name: '비교 결과' })).toBeVisible();
    expect(screen.getByRole('link', { name: '공급처 보기' })).toHaveAttribute('href', 'https://example.com/supplier');
    expect(screen.getByRole('link', { name: '공급처 보기' })).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByText('SKU-101').tagName).toBe('CODE');
    expect(screen.getByText('const approved = true;').tagName).toBe('CODE');
    expect(screen.getByRole('list', { name: '글머리 목록' })).toBeVisible();
    expect(screen.getByRole('list', { name: '번호 목록' })).toBeVisible();
    expect(screen.queryByText('tool')).not.toBeInTheDocument();
    expect(screen.queryByText('status')).not.toBeInTheDocument();
  });

  it('keeps raw HTML, unsafe links, malformed fences, Korean lists, and long plain text safe', () => {
    const longText = '긴문자열'.repeat(80);
    render(
      <AgentConversationMessage
        contextLabel="일반 AI 챗"
        message={{
          id: 'assistant-safe-1',
          role: 'assistant',
          content: '<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert(1))\n\n```ts\nconst unfinished = true;\n\n- 첫 번째\n- 두 번째\n\n' + longText,
        }}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'unsafe' })).not.toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(screen.getByText('[unsafe](javascript:alert(1))')).toBeVisible();
    expect(screen.queryByText('const unfinished = true;', { selector: 'code' })).not.toBeInTheDocument();
    expect(screen.getByText(/```ts/)).toBeVisible();
    expect(screen.getByRole('list', { name: '글머리 목록' })).toBeVisible();
    const longParagraph = screen.getByText(longText);
    expect(longParagraph).toHaveClass('break-words');
  });

  it('preserves requested technical prose and code while hiding exact internal-reference-only receipt lines', () => {
    const internalId = '123e4567-e89b-12d3-a456-426614174000';
    const canonicalHash = 'a'.repeat(64);

    render(
      <AgentConversationMessage
        contextLabel="일반 AI 챗"
        message={{
          id: 'assistant-redaction-1',
          role: 'assistant',
          content: `MCP와 provider transport, input hash의 차이를 설명하겠습니다. sourcing.duplicateCheck는 capability key의 예입니다.\n\n\`\`\`ts\nconst protocol = 'MCP';\nconst inputHash = calculateHash(input);\n\`\`\`\n\nInvocation ID: ${internalId}\nCanonical hash: ${canonicalHash}`,
        }}
      />,
    );

    const responseBody = screen.getByTestId('conversation-response-body');
    expect(responseBody).toHaveTextContent('MCP와 provider transport, input hash의 차이를 설명하겠습니다.');
    expect(responseBody).toHaveTextContent('sourcing.duplicateCheck는 capability key의 예입니다.');
    expect(responseBody.querySelector('code')).toHaveTextContent("const protocol = 'MCP';");
    expect(responseBody.querySelector('code')).toHaveTextContent('const inputHash = calculateHash(input);');
    expect(responseBody).not.toHaveTextContent(internalId);
    expect(responseBody).not.toHaveTextContent(canonicalHash);
    expect(responseBody).not.toHaveTextContent('Invocation ID:');
    expect(responseBody).not.toHaveTextContent('Canonical hash:');
  });

  it('removes assistant label lines that contain only internal references', () => {
    const internalId = '123e4567-e89b-12d3-a456-426614174000';
    const canonicalHash = 'a'.repeat(64);
    const supplierUrl = 'https://detail.1688.com/offer/900000000000.html';

    render(
      <AgentConversationMessage
        contextLabel="소싱 Agent"
        message={{
          id: 'assistant-label-redaction-1',
          role: 'assistant',
          content: `실제 공급처 데이터를 확인했습니다.\n소싱 후보: ${internalId}\n입력 해시: ${canonicalHash}\n공급처: ${supplierUrl}\n다음 검토를 진행할 수 있습니다.`,
        }}
      />,
    );

    const responseBody = screen.getByTestId('conversation-response-body');
    expect(responseBody).toHaveTextContent('실제 공급처 데이터를 확인했습니다.');
    expect(responseBody).toHaveTextContent(supplierUrl);
    expect(responseBody).toHaveTextContent('다음 검토를 진행할 수 있습니다.');
    expect(responseBody).not.toHaveTextContent('소싱 후보:');
    expect(responseBody).not.toHaveTextContent('입력 해시:');
  });

  it('does not redact user-authored text', () => {
    const internalId = '123e4567-e89b-12d3-a456-426614174000';
    const canonicalHash = 'a'.repeat(64);
    render(
      <AgentConversationMessage
        contextLabel="소싱 Agent"
        message={{
          id: 'user-raw-1',
          role: 'user',
          content: `sourcing.duplicateCheck ${internalId} ${canonicalHash}`,
        }}
      />,
    );

    expect(screen.getByText(`sourcing.duplicateCheck ${internalId} ${canonicalHash}`)).toBeVisible();
  });

  it('falls back to escaped plain assistant text without interpreting user-provided markup', () => {
    render(
      <AgentConversationMessage
        contextLabel="일반 AI 챗"
        message={{ id: 'user-plain-1', role: 'user', content: '<b>그대로 보이는 사용자 텍스트</b>' }}
      />,
    );

    expect(screen.getByText('<b>그대로 보이는 사용자 텍스트</b>')).toBeVisible();
    expect(screen.queryByRole('strong')).not.toBeInTheDocument();
  });
});
