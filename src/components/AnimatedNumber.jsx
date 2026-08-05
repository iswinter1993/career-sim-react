import React, { useEffect, useRef, useState } from 'react';

/**
 * AnimatedNumber — smoothly rolls a number from a starting value to `value`,
 * like an odometer / count-up timer. Uses requestAnimationFrame + easeOutCubic,
 * so it needs no external library.
 *
 * Props:
 *   value     — target number
 *   initial   — optional starting value. If provided and differs from `value`,
 *               the roll begins there (good for remounts where the parent
 *               passes a key). If omitted, the first render snaps straight to
 *               `value` and later changes roll from the previous landing point.
 *   duration  — animation duration in ms (default 700)
 *   formatter — optional (v) => string, e.g. v => Math.round(v)
 */
export default function AnimatedNumber({ value, duration = 700, formatter, initial }) {
  const startVal = initial != null && initial !== value ? initial : value;
  const [display, setDisplay] = useState(startVal);
  const fromRef = useRef(startVal);
  const rafRef = useRef(null);

  const fmt = formatter || ((v) => Math.round(v));

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic — fast start, gentle settle
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = to;
    };
  }, [value, duration]);

  return <>{fmt(display)}</>;
}
