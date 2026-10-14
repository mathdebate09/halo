// Tells the sync worker that the outbox has new work. The worker subscribes in the sync chunk;
// writes never wait on it.

type Listener = () => void;
const listeners = new Set<Listener>();

export function onOutboxChanged(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyOutboxChanged() {
  listeners.forEach((listener) => listener());
}
