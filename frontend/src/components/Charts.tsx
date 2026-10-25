'use client';

import React, { useMemo, useRef, useState } from 'react';
import styles from './Charts.module.css';
import { CountUp } from './Motion';

/* -------------------------------------------------------------------------
   Gauge: one headline ratio (spent vs budget) as a half circle
   ------------------------------------------------------------------------- */

interface GaugeProps {
  value: number;
  max: number;
  caption: string;           // e.g. "of ฿50,000 budget"
}

export const Gauge: React.FC<GaugeProps> = ({ value, max, caption }) => {
  const ratio = max > 0 ? value / max : 0;
  const percent = Math.round(ratio * 100);
  const over = ratio > 1;
  const filled = Math.min(Math.max(ratio, 0), 1) * 100;

  return (
    <figure className={styles.gauge} aria-label={`${percent}% ${caption}${over ? ', over budget' : ''}`}>
      <svg viewBox="0 0 200 110" className={styles.gaugeSvg} aria-hidden="true">
        <path d="M 16 100 A 84 84 0 0 1 184 100" pathLength={100} className={styles.gaugeTrack} />
        {filled > 0 && (
          <path
            d="M 16 100 A 84 84 0 0 1 184 100"
            pathLength={100}
            className={`${styles.gaugeValue} ${over ? styles.gaugeOver : ''}`}
            style={{ strokeDasharray: `${filled} 100`, '--gauge-fill': filled } as React.CSSProperties}
          />
        )}
      </svg>
      <figcaption className={styles.gaugeText}>
        <CountUp value={percent} format={(v) => `${Math.round(v)}%`} className={styles.gaugePercent} />
        <span className={styles.gaugeCaption}>{caption}</span>
        {over && <span className={styles.gaugeAlert}>Over budget</span>}
      </figcaption>
    </figure>
  );
};

/* -------------------------------------------------------------------------
   DayChart: planned vs spent per trip day (two series, one axis)
   ------------------------------------------------------------------------- */

export interface DayPoint {
  label: string;     // "Day 1"
  sublabel?: string; // "19 Nov"
  planned: number;
  spent: number;
}

interface DayChartProps {
  data: DayPoint[];
  format: (value: number) => string;
}

const W = 600;
const H = 200;
const PAD_Y = 12;

// Round the axis maximum up to a friendly number (1, 2, 2.5, 5 × 10^n)
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const f = value / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export const DayChart: React.FC<DayChartProps> = ({ data, format }) => {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);

  const max = useMemo(() => niceMax(Math.max(...data.map((d) => Math.max(d.planned, d.spent)), 0)), [data]);
  const x = (i: number) => (data.length === 1 ? W / 2 : (i / (data.length - 1)) * W);
  const y = (v: number) => H - PAD_Y - (v / max) * (H - PAD_Y * 2);

  // "Spent" stops at the last day with any spending: later days haven't happened yet,
  // and drawing them as 0 would look like spending fell
  const lastSpentIdx = data.reduce((last, d, i) => (d.spent > 0 ? i : last), -1);
  const linePath = (key: 'planned' | 'spent', count = data.length) =>
    data.slice(0, count).map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(' ');
  const spentPath = lastSpentIdx >= 0 ? linePath('spent', lastSpentIdx + 1) : '';
  const areaPath = lastSpentIdx > 0
    ? `${spentPath} L ${x(lastSpentIdx).toFixed(1)} ${H - PAD_Y} L ${x(0).toFixed(1)} ${H - PAD_Y} Z`
    : '';
  const hasSpentAt = (i: number) => i <= lastSpentIdx;

  // Crosshair snaps to the nearest day
  const pickIndex = (clientX: number) => {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box || data.length === 0) return;
    const rel = (clientX - box.left) / box.width;
    setActive(Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1)))));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(data.length - 1, (a ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? data.length) - 1));
    else if (e.key === 'Escape') setActive(null);
  };

  const ticks = [0, max / 2, max];
  const point = active !== null ? data[active] : null;

  return (
    <div className={styles.chart}>
      <div className={styles.chartHead}>
        <div className={styles.legend}>
          <span className={styles.legendItem}><span className={`${styles.key} ${styles.keySpent}`} />Spent</span>
          <span className={styles.legendItem}><span className={`${styles.key} ${styles.keyPlanned}`} />Planned</span>
        </div>
        <button type="button" className={styles.tableToggle} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {showTable ? (
        <table className={styles.table}>
          <thead>
            <tr><th>Day</th><th>Planned</th><th>Spent</th></tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{d.label}{d.sublabel ? ` · ${d.sublabel}` : ''}</td>
                <td>{format(d.planned)}</td>
                <td>{format(d.spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className={styles.plotWrap}>
          <div className={styles.yAxis} aria-hidden="true">
            {[...ticks].reverse().map((t) => <span key={t}>{format(t)}</span>)}
          </div>

          <div
            ref={plotRef}
            className={styles.plot}
            tabIndex={0}
            role="img"
            aria-label={`Planned and spent per day. Use left and right arrow keys to read each day.`}
            onPointerMove={(e) => pickIndex(e.clientX)}
            onPointerDown={(e) => pickIndex(e.clientX)}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
          >
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`${styles.svg} ${styles.draw}`} aria-hidden="true">
              <defs>
                <linearGradient id="spentFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {ticks.map((t) => (
                <line key={t} x1="0" x2={W} y1={y(t)} y2={y(t)} className={styles.grid} vectorEffect="non-scaling-stroke" />
              ))}
              {/* The whole svg is revealed left-to-right by the .draw animation */}
              <g>
                {areaPath && <path d={areaPath} fill="url(#spentFill)" />}
                <path d={linePath('planned')} className={styles.linePlanned} vectorEffect="non-scaling-stroke" />
                {spentPath && <path d={spentPath} className={styles.lineSpent} vectorEffect="non-scaling-stroke" />}
              </g>
              {active !== null && (
                <line x1={x(active)} x2={x(active)} y1="0" y2={H} className={styles.crosshair} vectorEffect="non-scaling-stroke" />
              )}
            </svg>

            {/* Markers in HTML so they stay round when the SVG stretches */}
            {point && (
              <>
                <span className={`${styles.marker} ${styles.markerPlanned}`} style={{ left: `${(x(active!) / W) * 100}%`, top: `${(y(point.planned) / H) * 100}%` }} />
                {hasSpentAt(active!) && (
                  <span className={`${styles.marker} ${styles.markerSpent}`} style={{ left: `${(x(active!) / W) * 100}%`, top: `${(y(point.spent) / H) * 100}%` }} />
                )}
                <div
                  className={styles.tooltip}
                  style={{
                    left: `${(x(active!) / W) * 100}%`,
                    transform: `translateX(${active! > data.length / 2 ? 'calc(-100% - 12px)' : '12px'})`,
                  }}
                >
                  <span className={styles.tooltipTitle}>{point.label}{point.sublabel ? ` · ${point.sublabel}` : ''}</span>
                  <span className={styles.tooltipRow}>
                    <span className={`${styles.key} ${styles.keySpent}`} />
                    {hasSpentAt(active!) ? <><strong>{format(point.spent)}</strong> spent</> : 'not spent yet'}
                  </span>
                  <span className={styles.tooltipRow}><span className={`${styles.key} ${styles.keyPlanned}`} /><strong>{format(point.planned)}</strong> planned</span>
                </div>
              </>
            )}
          </div>

          <div className={styles.xAxis} aria-hidden="true">
            {data.map((d, i) => (
              // Thin out labels on long trips
              <span key={d.label} className={i % Math.ceil(data.length / 8) === 0 || i === data.length - 1 ? '' : styles.hiddenTick}>
                {d.label.replace('Day ', 'D')}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
