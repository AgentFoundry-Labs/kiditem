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
  isRunning,
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
  isRunning: boolean;
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
        <Dialog.Content aria-label="대화 설정" aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-[760px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border bg-background shadow-lg outline-none sm:grid-cols-[160px_minmax(0,1fr)]">
          <nav aria-label="대화 설정" className="border-b bg-muted/30 p-3 sm:border-b-0 sm:border-r">
            <div role="tablist" aria-label="대화 설정 탭" className="grid grid-cols-2 gap-1 sm:grid-cols-1">
              <button id="conversation-settings-defaults-tab" type="button" role="tab" aria-selected={tab === 'defaults'} onClick={() => setTab('defaults')} className={`min-h-10 rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${tab === 'defaults' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/70'}`}>대화 기본값</button>
              <button id="conversation-settings-history-tab" type="button" role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')} className={`min-h-10 rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${tab === 'history' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/70'}`}>채팅 기록</button>
            </div>
          </nav>
          <section role="tabpanel" aria-labelledby={`conversation-settings-${tab}-tab`} className="min-h-0 overflow-y-auto p-5 sm:p-6">
            <header className="mb-5 flex items-center justify-between gap-3">
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold"><Settings2 aria-hidden="true" size={18} /> 대화 설정</Dialog.Title>
              <button type="button" aria-label="닫기" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 max-lg:min-h-11 max-lg:min-w-11"><X aria-hidden="true" size={18} /></button>
            </header>
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
                isRunning={isRunning}
                onRename={onRenameConversation}
                onDelete={onDeleteConversation}
              />
            )}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
