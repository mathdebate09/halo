// What the composer's + adds to the chat: a meal photo (camera or library), read like any logged
// photo, or a lab report through the same flow as Vitals' +. Both land as a message with the
// attachment; problems are said in the chat, never in a toast.

import * as ImagePicker from 'expo-image-picker';

import { upsertRecord } from '@/db/mutate';
import { compressPhoto, saveMeal } from '@/meals/capture';
import { addReport } from '@/reports/add';

export type PhotoSource = 'camera' | 'library';

function say(threadId: string, text: string) {
  upsertRecord('advisorMessage', {
    threadId,
    role: 'assistant',
    content: text,
    status: 'done',
    cards: [],
  });
}

/** A meal photo, with whatever was typed as its note. Returns false when nothing was picked. */
export async function attachMealPhoto(
  threadId: string,
  from: PhotoSource,
  note: string,
): Promise<boolean> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  let result: ImagePicker.ImagePickerResult;
  if (from === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      say(threadId, 'The camera is off for Halo. Choose a photo instead, or allow it in Settings.');
      return false;
    }
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return false;
  const photo = await compressPhoto(asset.uri, asset.width, asset.height);
  const meal = saveMeal({ photoUri: photo, note });
  upsertRecord('advisorMessage', {
    threadId,
    role: 'user',
    content: note.trim(),
    status: 'done',
    attachment: { kind: 'meal', mealId: meal.id, photoUri: meal.photoUri },
  });
  return true;
}

/** A lab report: a PDF or photos of its pages. A locked PDF joins the chat once it's opened. */
export async function attachReport(threadId: string): Promise<void> {
  const added = (reportId: string) =>
    upsertRecord('advisorMessage', {
      threadId,
      role: 'user',
      content: '',
      status: 'done',
      attachment: { kind: 'report', reportId },
    });
  const outcome = await addReport({ quiet: true, onStarted: added });
  if (outcome.kind === 'started') added(outcome.id);
  else if (outcome.kind === 'problem') say(threadId, outcome.message);
}
