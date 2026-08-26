'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Settings2, X } from 'lucide-react';
import { useState } from 'react';
import { ConversationDefaultsSettings } from './ConversationDefaultsSettings';
import { ConversationHistorySettings } from './ConversationHistorySettings';
import type {
  ConversationPreferences,
  ConversationSummary,
  GatewayReadiness,
  SetConversationPreferenceCommand,
} from './conversation-api';

type SettingsTab = 'defaults' | 'history';

/** The only app-shell settings dialog for both chat presentations. */
export function ConversationSettingsDialog({
  open,
  onClose,
  conversations,
  activeConversationId,
  activeTurnId,
  preferences,
  preferencesLoading,
  preferencesError,
  readiness,
  onSavePreference,
  onRenameConversation,
  onDeleteConversation,
}: {
  open: boolean;
  onClose(): void;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  activeTurnId: string | null;
  preferences: ConversationPreferences | null | undefined;
  preferencesLoading: boolean;
  preferencesError: boolean;
  readiness: GatewayReadiness[] | null | undefined;
  onSavePreference(input: SetConversationPreferenceCommand): Promise<ConversationPreferences>;
  onRenameConversation(conversationId: string, title: string): Promise<ConversationSummary>;
  onDeleteConversation(conversationId: string): Promise<void>;
}) {
  const [tab, setTab] = useState<SettingsTab>('defaults');

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/25" />
        <Dialog.Content aria-label="대화 설정" aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-lg outline-none">
          <header className="flex items-center justify-between border-b px-5 py-4">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold"><Settings2 aria-hidden="true" size={18} /> 대화 설정</Dialog.Title>
            <button type="button" aria-label="닫기" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-lg:min-w-11"><X aria-hidden="true" size={18} /></button>
          </header>
          <div role="tablist" aria-label="대화 설정 탭" className="flex gap-1 border-b px-5 pt-3">
            <button type="button" role="tab" aria-selected={tab === 'defaults'} onClick={() => setTab('defaults')} className={`min-h-10 rounded-t-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${tab === 'defaults' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:bg-muted'}`}>대화 기본값</button>
            <button type="button" role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')} className={`min-h-10 rounded-t-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${tab === 'history' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:bg-muted'}`}>채팅 기록</button>
          </div>
          <div className="min-h-0 overflow-y-auto p-5">
            {tab === 'defaults' ? (
              <ConversationDefaultsSettings
                preferences={preferences}
                preferencesLoading={preferencesLoading}
                preferencesError={preferencesError}
                readiness={readiness}
                onSave={onSavePreference}
              />
            ) : (
              <ConversationHistorySettings
                conversations={conversations}
                activeConversationId={activeConversationId}
                activeTurnId={activeTurnId}
                onRename={onRenameConversation}
                onDelete={onDeleteConversation}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
