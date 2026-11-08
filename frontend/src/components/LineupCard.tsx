import type { ReactNode } from 'react';
import type { LineupSummary } from '../api/types';
import { Link } from '../router';
import { itemColorStyle } from '../lib/colors';

export function LineupCard({ lineup, actions }: { lineup: LineupSummary; actions?: ReactNode }) {
  return (
    <article className="card lineup-card" style={itemColorStyle(lineup.color)}>
      <h3 className="card__title">
        <Link to={`/lineups/${lineup.id}`} className="card__link">
          {lineup.name}
        </Link>
      </h3>
      {actions && <div className="card__actions">{actions}</div>}
    </article>
  );
}
