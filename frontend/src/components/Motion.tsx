'use client';

import React, { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animates from the previous value to `target` (ease-out). Jumps straight there if motion is reduced. */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    if (prefersReducedMotion()) {
      fromRef.current = target;
      setValue(target);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(next);
      fromRef.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

interface CountUpProps {
  value: number;
  format?: (value: number) => string;
  duration?: number;
  className?: string;
}

/** A number that counts up to its value, like the video's stat cards. */
export const CountUp: React.FC<CountUpProps> = ({ value, format, duration, className }) => {
  const current = useCountUp(value, duration);
  // Whole-number display while moving, exact value once settled
  const shown = Math.abs(current - value) < 0.005 ? value : Math.round(current);
  return <span className={className}>{format ? format(shown) : Math.round(shown).toLocaleString()}</span>;
};
