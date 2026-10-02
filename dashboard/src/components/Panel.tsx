import type { ReactNode } from 'react';

interface Props {
  area: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  tone?: 'bad' | 'good' | 'warn' | 'neutral';
  right?: ReactNode;
  explain?: string | false;
  children: ReactNode;
  className?: string;
}

export default function Panel({ area, icon, title, subtitle, tone = 'neutral', right, explain, children, className }: Props) {
  return (
    <section className={`panel tone-${tone} ${className ?? ''}`} style={{ gridArea: area }}>
      <header className="panel-head">
        <div className="panel-title">
          <span className="panel-icon">{icon}</span>
          <div>
            <h2>{title}</h2>
            {subtitle && <div className="panel-sub">{subtitle}</div>}
          </div>
        </div>
        {right}
      </header>
      {explain && <p className="explain">{explain}</p>}
      <div className="panel-body">{children}</div>
    </section>
  );
}
