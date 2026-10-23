import type { StoredCard } from '@/advisor/act';
import type { AdvisorMessage, LiveReply } from '@/advisor/thread';

export type ChatItem =
  | { kind: 'user'; message: AdvisorMessage }
  | {
      kind: 'reply';
      turnId: string;
      text: string;
      live: boolean;
      status: string | null;
      card: StoredCard | null;
      message: AdvisorMessage | null;
    };

/**
 * The thread as the screen draws it: stored messages in order, then the reply still streaming
 * (until its stored copy arrives under the same turn).
 */
export function chatItems(messages: AdvisorMessage[], live: LiveReply | null): ChatItem[] {
  const items: ChatItem[] = messages.map((m) =>
    m.role === 'user'
      ? { kind: 'user', message: m }
      : {
          kind: 'reply',
          turnId: m.turnId ?? m.id,
          text: m.content,
          live: false,
          status: null,
          card: m.cards?.[0] ?? null,
          message: m,
        },
  );
  if (live && !messages.some((m) => m.role === 'assistant' && m.turnId === live.turnId)) {
    items.push({
      kind: 'reply',
      turnId: live.turnId,
      text: live.sentences.join(' '),
      live: true,
      status: live.status,
      card: live.card,
      message: null,
    });
  }
  return items;
}
