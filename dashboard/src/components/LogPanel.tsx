import { useEffect, useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
import type { LogLine } from '../types';
import { clockTime } from '../util';
import Panel from './Panel';

export default function LogPanel({ logs }: { logs: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const lines = logs.slice(-150);

  useEffect(() => {
    const el = ref.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [logs, follow]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  return (
    <Panel
      area="logs"
      icon={<ScrollText size={20} />}
      title="Live event log"
      subtitle={`${logs.length} events`}
      right={!follow ? <button className="chip" onClick={() => setFollow(true)}>↓ follow</button> : undefined}
    >
      <div className="logs" ref={ref} onScroll={onScroll}>
        {lines.length === 0 && <div className="empty">quiet… waiting for events</div>}
        {lines.map((l, i) => (
          <div key={`${l.t}-${i}-${l.msg.length}`} className={`log lv-${l.level}`}>
            <span className="log-time">{clockTime(l.t)}</span>
            <span className={`log-src src-${l.source}`}>{l.source}</span>
            <span className="log-msg">{l.msg}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
