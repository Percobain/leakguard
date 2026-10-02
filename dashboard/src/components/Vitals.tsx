import { CubeIcon, DetectiveIcon, GitBranchIcon } from '@phosphor-icons/react';
import type { FullState } from '../types';
import { ago } from '../util';

const ICON = { size: 16, weight: 'light' as const };

/** Three always-visible vital signs: who is abusing the key, is production fine, is the repo clean. */
export function Vitals({ state, now }: { state: FullState; now: number }) {
  const atk = state.attacker;
  const app = state.app;
  const dirty = state.repo.commits.some((c) => c.dirty);
  const atkTone = atk.status === 'has-key' ? 'bad' : atk.status === 'blocked' ? 'safe' : '';

  return (
    <div className="vitals">
      <div className="vital">
        <div className="vital-head"><DetectiveIcon {...ICON} /> Attacker</div>
        <div className={`vital-v ${atkTone}`}>
          {atk.status === 'scanning' ? 'Watching GitHub' : atk.status === 'has-key' ? 'Using the stolen key' : 'Blocked'}
        </div>
        <div className="bars">
          {atk.attempts.slice(-40).map((a) => <span key={a.t} className={a.status === 200 ? 'b-bad' : 'b-safe'} />)}
        </div>
        <div className="small muted">{atk.successCount} stolen calls · {atk.deniedCount} blocked</div>
      </div>
      <div className="vital">
        <div className="vital-head"><CubeIcon {...ICON} /> Production app</div>
        <div className={`vital-v ${app.status === 'healthy' ? 'safe' : app.status === 'restarting' ? 'warn' : 'bad'}`}>
          {app.status === 'healthy' ? 'Serving users' : app.status}
        </div>
        <div className="small muted">key v{app.keyVersion ?? '-'} · {app.keyMasked ?? '-'}</div>
        <div className="small muted">container up since {ago(app.startedAt, now)}</div>
      </div>
      <div className="vital">
        <div className="vital-head"><GitBranchIcon {...ICON} /> Repository</div>
        <div className={`vital-v ${dirty ? 'bad' : 'safe'}`}>{dirty ? 'Secret in history' : 'Clean'}</div>
        <div className="small muted">{state.repo.fullName}</div>
        <div className="small muted">{state.repo.commits.length} commits on main</div>
      </div>
    </div>
  );
}
