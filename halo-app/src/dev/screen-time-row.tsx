import { useState } from 'react';
import { View } from 'react-native';

import {
  openUsageAccess,
  refreshScreenNights,
  usageAccess,
  useScreenNights,
} from '@/assistant/screen';
import { Btn, Row } from '@/dev/ui';
import { formatTime } from '@/lib/clock';
import { ScreenTimeCard } from '@/onboarding/screen-time-card';

/** Usage access and the nights read from the screen (chunk 17c). */
export function ScreenTimeRow() {
  const nights = useScreenNights();
  const [access, setAccess] = useState(usageAccess);
  const lines = nights
    .slice(0, 7)
    .map(
      (n) =>
        `${n.day}: ${formatTime(new Date(n.start))} → ${formatTime(new Date(n.end))} · ${n.hours.toFixed(1)} h`,
    );
  return (
    <Row title="Screen time (sleep)" status={[`access ${access}`, ...lines].join('\n')}>
      {/* The onboarding card (scr 3), previewed here since onboarding is locked once done. */}
      <View className="w-full">
        <ScreenTimeCard />
      </View>
      <Btn label="Open Usage access" onPress={openUsageAccess} />
      <Btn
        label="Read nights now"
        onPress={() => {
          setAccess(usageAccess());
          refreshScreenNights(true);
        }}
      />
    </Row>
  );
}
