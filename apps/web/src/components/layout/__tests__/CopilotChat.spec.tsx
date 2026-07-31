import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CopilotChat from '../CopilotChat';

const copilotKitProps = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));

vi.mock('@copilotkit/react-core', () => ({
  CopilotKit: (props: Record<string, unknown>) => {
    copilotKitProps.value = props;
    return (
      <div
        data-testid="copilot-runtime"
        data-runtime-url={String(props.runtimeUrl ?? '')}
        data-credentials={typeof props.credentials === 'string' ? props.credentials : ''}
      >
        {props.children as React.ReactNode}
      </div>
    );
  },
}));

vi.mock('@copilotkit/react-ui', () => ({
  CopilotSidebar: () => <div data-testid="copilot-sidebar" />,
}));

describe('CopilotChat', () => {
  it('routes the runtime through the same-origin /api/chat/copilot rewrite', () => {
    render(<CopilotChat />);

    expect(screen.getByTestId('copilot-runtime')).toHaveAttribute(
      'data-runtime-url',
      '/api/chat/copilot',
    );
  });

  it('keeps the KidItem session cookie attached via credentials="include"', () => {
    render(<CopilotChat />);
    expect(screen.getByTestId('copilot-runtime')).toHaveAttribute(
      'data-credentials',
      'include',
    );
  });

  it('does not forward an Authorization header — the KidItem cookie is the chat auth path', () => {
    render(<CopilotChat />);
    const props = copilotKitProps.value ?? {};
    // Browser must not synthesise a Bearer token; auth flows from the
    // HttpOnly kiditem_session cookie, which the same-origin rewrite forwards.
    expect(props).not.toHaveProperty('headers');
  });
});
