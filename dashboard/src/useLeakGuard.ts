import { useEffect, useRef, useState } from 'react';
import type { FullState } from './types';

export type ConnState = 'connecting' | 'open' | 'closed';

/** Subscribes to the orchestrator's full-state WebSocket stream, reconnecting with backoff. */
export function useLeakGuard() {
  const [state, setState] = useState<FullState | null>(null);
  const [conn, setConn] = useState<ConnState>('connecting');
  const offsetRef = useRef(0); // serverNow - clientNow

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: number | undefined;
    let stopped = false;
    let retry = 0;

    const accept = (s: FullState) => {
      if (s.now) offsetRef.current = s.now - Date.now();
      setState(s);
    };

    fetch('/api/state')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && accept(s))
      .catch(() => {});

    const connect = () => {
      setConn('connecting');
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        retry = 0;
        setConn('open');
      };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m?.type === 'state' && m.state) accept(m.state as FullState);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setConn('closed');
        if (!stopped) timer = window.setTimeout(connect, Math.min(5000, 400 * 2 ** retry++));
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return { state, conn, offsetRef };
}

/** Re-renders every `ms` and returns the server-aligned current time. */
export function useNow(offsetRef: { current: number }, ms = 250): number {
  const [now, setNow] = useState(() => Date.now() + offsetRef.current);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offsetRef.current), ms);
    return () => window.clearInterval(id);
  }, [ms, offsetRef]);
  return now;
}

export async function post(path: string): Promise<string | null> {
  try {
    const r = await fetch(path, { method: 'POST' });
    if (!r.ok) {
      const text = await r.text();
      try {
        const j = JSON.parse(text);
        return j.error ?? j.message ?? `${r.status} ${r.statusText}`;
      } catch {
        return text || `${r.status} ${r.statusText}`;
      }
    }
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
