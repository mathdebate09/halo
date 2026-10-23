import { Keyboard, View } from 'react-native';

import { actOnCard, correctCard } from '@/advisor/act';
import { AdvisorCardView } from '@/advisor/card';
import type { ChatItem } from '@/advisor/chat-items';
import { Reply, Thinking, WORD_MS } from '@/advisor/reply';

/** One of the Advisor's replies: its words (or what it's reading), then its card. */
export function ReplyItem({
  item,
  units,
}: {
  item: Extract<ChatItem, { kind: 'reply' }>;
  units: { pounds: boolean; clock24: boolean };
}) {
  return (
    <View className="mb-6">
      {item.text ? <Reply text={item.text} live={item.live} /> : <Thinking label={item.status} />}
      {item.card && item.text ? (
        <AdvisorCardView
          card={item.card}
          units={units}
          // While streaming, the card waits for the reply's words to land.
          enterDelay={item.live ? item.text.split(/\s+/).length * WORD_MS + 260 : null}
          onAct={() => {
            Keyboard.dismiss();
            if (item.card && item.message) void actOnCard(item.card, item.message);
          }}
          onCorrect={() => {
            if (item.card && item.message) correctCard(item.card, item.message);
          }}
        />
      ) : null}
    </View>
  );
}
