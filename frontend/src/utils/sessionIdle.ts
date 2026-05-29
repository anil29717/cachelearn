const DEFAULT_IDLE_MINUTES = 30;

export function getSessionIdleMs(): number {
  const fromEnv = Number(import.meta.env.VITE_SESSION_IDLE_MINUTES);
  const minutes =
    Number.isFinite(fromEnv) && fromEnv >= 5 && fromEnv <= 480 ? Math.floor(fromEnv) : DEFAULT_IDLE_MINUTES;
  return minutes * 60 * 1000;
}

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;

export function bindSessionIdleHandlers(onIdle: () => void, idleMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const reset = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onIdle, idleMs);
  };

  const onActivity = () => reset();

  for (const ev of ACTIVITY_EVENTS) {
    window.addEventListener(ev, onActivity, { passive: true });
  }
  reset();

  return () => {
    if (timer) clearTimeout(timer);
    for (const ev of ACTIVITY_EVENTS) {
      window.removeEventListener(ev, onActivity);
    }
  };
}
