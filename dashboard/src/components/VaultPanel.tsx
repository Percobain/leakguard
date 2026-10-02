import { AnimatePresence, motion } from 'framer-motion';
import { Vault } from 'lucide-react';
import type { FullState } from '../types';
import { ago } from '../util';
import Panel from './Panel';

export default function VaultPanel({ vault, now, explain }: { vault: FullState['vault']; now: number; explain: boolean }) {
  const versions = [...vault.versions].sort((a, b) => b.version - a.version);
  const anyRevoked = versions.some((v) => v.status === 'revoked');

  return (
    <Panel
      area="vault"
      icon={<Vault size={20} />}
      title="HashiCorp Vault"
      subtitle={vault.path || 'secret/…'}
      tone={anyRevoked ? 'good' : 'neutral'}
      explain={
        explain &&
        'Vault is the single safe place where the real key lives. The app reads its key from here, never from code, so a new version takes effect immediately.'
      }
    >
      {versions.length === 0 && <div className="empty">no secret versions yet</div>}
      <table className="vault-table">
        <thead>
          <tr>
            <th>ver</th>
            <th>key</th>
            <th>status</th>
            <th>created</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {versions.map((v) => (
              <motion.tr
                key={v.version}
                className={`vrow v-${v.status}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                title={v.reason ?? ''}
              >
                <td className="vver">v{v.version}</td>
                <td className="vkey">
                  <span className="mono">{v.keyMasked}</span>
                  <span className="vkeyid">{v.keyId}</span>
                </td>
                <td>
                  <span className={`pill p-${v.status}`}>{v.status}</span>
                </td>
                <td className="vtime">{ago(v.createdAt, now)}</td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
      <div className="hint">⚡ Zero downtime: the new key is deployed <b>before</b> the old one is revoked.</div>
    </Panel>
  );
}
