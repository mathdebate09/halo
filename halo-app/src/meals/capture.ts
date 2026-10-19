// Meal capture without the network: the photo is compressed and kept on the device, the meal is
// written locally as "analysing", and the AI job (chunk 13) fills it in later.

import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { windowsOn } from '@/assistant/learned';
import { upsertRecord } from '@/db/mutate';
import { dayKey, hourOfDay, type MealType, mealTypeAt } from '@/shared';

import { requestAnalysis } from './analysis';

const MAX_EDGE = 1024;

/** ~1024 px JPEG in the cache; EXIF rotation is applied by the manipulator. */
export async function compressPhoto(uri: string, width: number, height: number): Promise<string> {
  const resize =
    width >= height ? { width: Math.min(width, MAX_EDGE) } : { height: Math.min(height, MAX_EDGE) };
  const context = ImageManipulator.manipulate(uri).resize(resize);
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return result.uri;
}

function mealsDirectory() {
  const dir = new Directory(Paths.document, 'meals');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export type SavedMeal = { id: string; photoUri: string | null };

/**
 * Writes the meal now (photo, note or both); it shows as pending until analysed. `id` and `at`
 * come from a meal logged elsewhere (the overlay), so writing it twice can't log it twice.
 */
export function saveMeal({
  photoUri,
  note,
  id: givenId,
  at,
  mealType,
}: {
  photoUri?: string | null;
  note?: string;
  id?: string;
  at?: number;
  /** As said ("for lunch"); else from the time and the learned windows. */
  mealType?: MealType | null;
}): SavedMeal {
  const now = at != null ? new Date(at) : new Date();
  let kept: string | null = null;
  if (photoUri) {
    const source = new File(photoUri);
    const target = new File(mealsDirectory(), `${Date.now()}.jpg`);
    source.move(target);
    kept = target.uri;
  }
  const id = upsertRecord('meal', {
    ...(givenId ? { id: givenId } : {}),
    day: dayKey(now),
    eatenAt: now.getTime(),
    mealType: mealType ?? mealTypeAt(hourOfDay(now), windowsOn(dayKey(now))),
    source: kept ? 'photo' : 'text',
    note: note?.trim() || null,
    photoUri: kept,
    status: 'analysing',
  });
  requestAnalysis();
  return { id, photoUri: kept };
}
