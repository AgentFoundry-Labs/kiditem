import type { ConversationSummary } from './conversation-api';

export type ConversationBulkDeleteFailure = {
  conversationId: string;
  message: string;
};

export type ConversationBulkDeleteResult = {
  succeededIds: string[];
  failed: ConversationBulkDeleteFailure[];
};

/** Bounded client orchestration; each supplied removal remains provider-first. */
export async function bulkDeleteConversations(
  conversations: readonly ConversationSummary[],
  removeConversation: (conversationId: string) => Promise<void>,
): Promise<ConversationBulkDeleteResult> {
  const outcomes: Array<{ conversationId: string; success: boolean }> = new Array(conversations.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < conversations.length) {
      const index = nextIndex;
      nextIndex += 1;
      const conversation = conversations[index];
      try {
        await removeConversation(conversation.id);
        outcomes[index] = { conversationId: conversation.id, success: true };
      } catch {
        outcomes[index] = { conversationId: conversation.id, success: false };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, conversations.length) }, worker));
  return {
    succeededIds: outcomes.filter((outcome) => outcome.success).map((outcome) => outcome.conversationId),
    failed: outcomes
      .filter((outcome) => !outcome.success)
      .map((outcome) => ({ conversationId: outcome.conversationId, message: '대화를 삭제할 수 없습니다.' })),
  };
}
