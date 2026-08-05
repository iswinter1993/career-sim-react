import React from 'react';

export function PitchIcon() {
  return (
    <svg className="mi" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" fill="#1c3a28" stroke="#4ade80" strokeWidth="1.6" />
      <path d="M12 4.5v15" stroke="#4ade80" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="#4ade80" strokeWidth="1.4" />
      <path d="M2.5 9h3v6h-3M21.5 9h-3v6h3" fill="none" stroke="#4ade80" strokeWidth="1.4" />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg className="mi" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#f4f6f2" />
      <path d="M12 6.6l3.4 2.5-1.3 4h-4.2l-1.3-4z" fill="#20241d" />
      <path d="M12 3v3.6M4.2 9.6l3.7 1.5M19.8 9.6l-3.7 1.5M7.4 20l2.5-3M16.6 20l-2.5-3" stroke="#20241d" strokeWidth="1.3" />
    </svg>
  );
}

export function TrophyIcon() {
  return (
    <svg className="mi" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 16.2h5.6c.7 2 2.6 2.9 5 3.3 2 .4 3.4.7 3.9 1.4H2.5z" fill="#f4f6f2" />
      <path d="M2.5 12.4h4.2c.4 1.6.9 2.8 1.4 3.8H2.5z" fill="#c9d2c4" />
    </svg>
  );
}

/** Map an OVR value to a CSS tier class name (''/bronze/silver/gold/plat).
 *  <60 → no tier class (falls back to the dark base gradient, ~40 OVR),
 *  60-69 → bronze/copper, 70-79 → silver, 80-87 → gold, ≥88 → platinum. */
export function getOVRTier(ovr) {
  if (ovr < 60) return '';
  if (ovr < 70) return 'bronze';
  if (ovr < 80) return 'silver';
  if (ovr < 88) return 'gold';
  return 'plat';
}
