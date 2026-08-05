import React, { useState } from 'react';
import SIM from '../simEngine';

// Shared crest component used by CareerView and SummaryView
export default function Crest({ team, size }) {
  if (!team) return <div className="crest" style={{ background: '#333' }} />;

  const color = team.color || '#333';
  const crests = window.CRESTS || {};
  const crestId = team.id;
  const [imgFailed, setImgFailed] = useState(false);

  if (crests[crestId]) {
    return (
      <span className="crest-pic">
        {imgFailed ? (
          <svg className="crest" viewBox="0 0 24 24" width="1.7rem" height="1.7rem">
            <defs>
              <linearGradient id={`cg-fb-${team.id}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={color} />
                <stop offset="100%" stopColor={`${color}dd`} />
              </linearGradient>
            </defs>
            <path
              d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7L12 2z"
              fill={`url(#cg-fb-${team.id})`}
              stroke={color}
              strokeWidth="0.5"
            />
          </svg>
        ) : (
          <img
            className={`crest ${crests.DARK_CRESTS?.[crestId] ? 'plate' : ''}`}
            src={`https://career-sim.pages.dev/assets/crests/${crests[crestId]}`}
            alt={team.name}
            onError={() => setImgFailed(true)}
          />
        )}
      </span>
    );
  }

  return (
    <svg className="crest" viewBox="0 0 24 24" width="1.7rem" height="1.7rem">
      <defs>
        <linearGradient id={`cg-${team.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={`${color}dd`} />
        </linearGradient>
      </defs>
      <path
        d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7L12 2z"
        fill={`url(#cg-${team.id})`}
        stroke={color}
        strokeWidth="0.5"
      />
    </svg>
  );
}
