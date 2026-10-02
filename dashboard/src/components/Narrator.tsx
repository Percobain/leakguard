import { AnimatePresence, motion } from 'framer-motion';
import { Megaphone } from 'lucide-react';
import type { FullState } from '../types';

export default function Narrator({ narration, phase }: { narration: FullState['narration']; phase: string }) {
  return (
    <div className={`narrator nar-${phase}`}>
      <div className="nar-icon"><Megaphone size={26} /></div>
      <div className="nar-text">
        <AnimatePresence mode="wait">
          <motion.div
            key={narration.title + '|' + narration.body}
            initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -14, filter: 'blur(4px)' }}
            transition={{ duration: 0.35 }}
          >
            <div className="nar-title">{narration.title}</div>
            <div className="nar-body">{narration.body}</div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
