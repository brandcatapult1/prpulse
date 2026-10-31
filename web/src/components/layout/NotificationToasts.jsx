import { useEffect, useRef, useState } from 'react';
import { notificationsApi } from '../../lib/api.js';

const POLL_MS = 30_000;
const VISIBLE_MS = 10_000;

/** Toasts for events from other people (campaign completed, new signup…); each disappears after 10 seconds. */
export function NotificationToasts() {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = (id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.filter((n) => n.id !== id));
  };

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const fresh = await notificationsApi.unseen();
        if (stopped || !Array.isArray(fresh) || fresh.length === 0) return;
        setItems((list) => [...list, ...fresh.filter((n) => !list.some((x) => x.id === n.id))]);
        for (const n of fresh) {
          timers.current.set(n.id, setTimeout(() => dismiss(n.id), VISIBLE_MS));
        }
      } catch {
        // Next poll will try again.
      }
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    const pending = timers.current;
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0">
      {items.map((n) => (
        <div
          key={n.id}
          role="status"
          className="pointer-events-auto rounded-lg border border-zinc-700 bg-ink px-4 py-3 text-sm text-white shadow-lg shadow-ink/30"
        >
          <div className="flex items-start justify-between gap-3">
            <span>{n.message}</span>
            <button
              type="button"
              onClick={() => dismiss(n.id)}
              className="text-white/70 hover:text-white"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
