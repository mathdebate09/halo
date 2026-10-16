import { getDevice } from '@/lib/device';
import { APP_KEY_HEADER, DEVICE_ID_HEADER } from '@/shared';

/** Local dev reaches the backend through `adb reverse tcp:3000 tcp:3000`. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
/**
 * The 16-char key shared with the backend (APP_KEY there). Inlined at bundle time from
 * halo-app/.env, so it's a gate, not a secret. Changing it needs a Metro restart.
 */
const APP_KEY = process.env.EXPO_PUBLIC_APP_KEY ?? '';
const TIMEOUT_MS = 15_000;

if (__DEV__ && APP_KEY.length !== 16) {
  console.warn(
    'EXPO_PUBLIC_APP_KEY is missing or not 16 chars: set it in halo-app/.env and restart Metro',
  );
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The server's own message, when it sent one ("Daily limit reached"). */
    readonly detail?: string,
  ) {
    super(message);
  }
}

/** JSON request with device headers and a timeout. Throws ApiError (HTTP) or a network error. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const device = getDevice();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        [APP_KEY_HEADER]: APP_KEY,
        ...(device ? { [DEVICE_ID_HEADER]: device.id } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
      const detail = typeof body?.message === 'string' ? body.message : undefined;
      throw new ApiError(res.status, `${init.method ?? 'GET'} ${path} → ${res.status}`, detail);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
