import { AnimatePresence, motion } from 'framer-motion';
import { GitBranch, ExternalLink, ArrowRight } from 'lucide-react';
import type { Commit, RepoState } from '../types';
import { ago, short } from '../util';
import Panel from './Panel';

export default function GitPanel({ repo, now, explain }: { repo: RepoState; now: number; explain: boolean }) {
  const dirty = repo.commits.some((c) => c.dirty);
  const rewritten = !!repo.previousCommits?.length;

  return (
    <Panel
      area="git"
      icon={<GitBranch size={20} />}
      title="Git history"
      subtitle={repo.fullName || 'demo repository'}
      tone={dirty ? 'bad' : rewritten ? 'good' : 'neutral'}
      right={
        repo.url ? (
          <a className="link" href={repo.url} target="_blank" rel="noreferrer">
            GitHub <ExternalLink size={13} />
          </a>
        ) : undefined
      }
      explain={
        explain &&
        (rewritten
          ? 'History was rewritten: every commit that held the key got a new ID, and the key text is gone from all of them.'
          : 'Deleting the file in a new commit is not enough. The key stays in older commits, so LeakGuard rewrites the history itself.')
      }
    >
      {rewritten ? (
        <div className="git-compare">
          <div className="git-col">
            <div className="git-col-head bad">BEFORE</div>
            <CommitList commits={repo.previousCommits!} now={now} struck />
          </div>
          <div className="git-arrow"><ArrowRight size={22} /></div>
          <div className="git-col">
            <div className="git-col-head good">AFTER</div>
            <CommitList commits={repo.commits} now={now} />
          </div>
        </div>
      ) : (
        <CommitList commits={repo.commits} now={now} />
      )}
    </Panel>
  );
}

function CommitList({ commits, now, struck }: { commits: Commit[]; now: number; struck?: boolean }) {
  if (!commits.length) return <div className="empty">no commits yet</div>;
  return (
    <ul className="commits">
      <AnimatePresence initial={false}>
        {commits.slice(0, 8).map((c) => (
          <motion.li
            key={c.sha}
            className={`commit ${c.dirty ? 'dirty' : ''} ${struck ? 'struck' : ''}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span className="sha">{c.short || short(c.sha)}</span>
            <span className="msg" title={c.message}>{c.message}</span>
            {c.dirty ? <span className="tag-bad">⚠ contains secret</span> : <span className="tag-ok">clean</span>}
            <span className="meta">{c.author} · {ago(c.date, now)}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
