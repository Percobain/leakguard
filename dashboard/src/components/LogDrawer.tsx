import { useEffect, useRef } from 'react';
import { TerminalIcon } from '@phosphor-icons/react';
import type { FullState } from '../types';
import { clockTime } from '../util';

/** Collapsed by default: the technical log for those who want the detail. */
export function LogDrawer({ state, open, onToggle }: { state: FullState; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = state.logs.at(-1);
  useEffect(() => {
    if (open && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [open, state.logs.length]);

  return (
    <footer className={`drawer ${open ? 'open' : ''}`}>
      <button className="drawer-bar" onClick={onToggle}>
        <TerminalIcon size={15} weight="light" />
        <span>Technical log</span>
        {!open && last && <span className="muted ellipsis grow">· [{last.source}] {last.msg}</span>}
        <span className="right muted">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <div className="drawer-body" ref={ref}>
          {state.logs.map((l, i) => (
            <div key={i} className={`logline lv-${l.level}`}>
              <span className="muted">{clockTime(l.t)}</span>
              <span className="src">{l.source}</span>
              <span>{l.msg}</span>
            </div>
          ))}
        </div>
      )}
    </footer>
  );
}
