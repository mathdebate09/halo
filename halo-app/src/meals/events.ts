// "A meal was just logged": the confirm sheet emits it, Today plays the celebration.

const listeners = new Set<() => void>();

export function emitMealLogged() {
  listeners.forEach((l) => l());
}

export function onMealLogged(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
