import { useRef, useState } from 'react';
import type { WDL } from '../lib/analyze';

/** Barre victoires / nulles / défaites, avec étiquettes texte (jamais la couleur seule). */
export function WdlBar({ s, label }: { s: WDL; label?: string }) {
  const seg = (n: number, cls: string, name: string) =>
    n > 0 ? <div className={`wdl-seg ${cls}`} style={{ flexGrow: n }} title={`${name} : ${n}`} /> : null;
  return (
    <div className="wdl">
      {label && <div className="wdl-label">{label}</div>}
      <div className="wdl-bar" role="img" aria-label={`${s.w} victoires, ${s.d} nulles, ${s.l} défaites`}>
        {seg(s.w, 'win', 'Victoires')}{seg(s.d, 'draw', 'Nulles')}{seg(s.l, 'loss', 'Défaites')}
      </div>
      <div className="wdl-legend">
        <span><i className="dot win" />{s.w} V</span>
        <span><i className="dot draw" />{s.d} N</span>
        <span><i className="dot loss" />{s.l} D</span>
        <strong>{Math.round(s.score * 100)} %</strong>
      </div>
    </div>
  );
}

/** Jauge de score 0-100 pour une dimension. */
export function ScoreBar({ label, score, detail, reliable }: { label: string; score: number; detail: string; reliable: boolean }) {
  const tone = score >= 65 ? 'good' : score >= 45 ? 'mid' : 'bad';
  const icon = tone === 'good' ? '▲' : tone === 'bad' ? '▼' : '●';
  return (
    <div className="scorebar" title={detail}>
      <div className="scorebar-head">
        <span>{label}{!reliable && <span className="muted small" title="Peu de données"> (indicatif)</span>}</span>
        <span className={`score-val ${tone}`}><span aria-hidden>{icon}</span> {score}</span>
      </div>
      <div className="scorebar-track"><div className={`scorebar-fill ${tone}`} style={{ width: `${Math.max(2, score)}%` }} /></div>
      <p className="muted small">{detail}</p>
    </div>
  );
}

/** Anneau du score global. */
export function ScoreRing({ score }: { score: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="ring" role="img" aria-label={`Score global ${score} sur 100`}>
      <circle cx="60" cy="60" r={r} className="ring-track" />
      <circle cx="60" cy="60" r={r} className="ring-fill" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 60 60)" />
      <text x="60" y="58" textAnchor="middle" className="ring-num">{score}</text>
      <text x="60" y="78" textAnchor="middle" className="ring-sub">/ 100</text>
    </svg>
  );
}

/** Courbe d'évolution du classement (une seule série) avec réticule + infobulle. */
export function RatingChart({ points }: { points: { date: number; rating: number }[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="muted">Pas assez de parties classées pour tracer une courbe.</p>;
  const W = 640, H = 200, pl = 44, pr = 12, pt = 12, pb = 24;
  const min = Math.min(...points.map((p) => p.rating)), max = Math.max(...points.map((p) => p.rating));
  const lo = Math.floor((min - 10) / 50) * 50, hi = Math.ceil((max + 10) / 50) * 50;
  const x = (i: number) => pl + (i / (points.length - 1)) * (W - pl - pr);
  const y = (v: number) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ');
  const ticks = [lo, Math.round((lo + hi) / 2 / 10) * 10, hi];
  const fmt = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

  const onMove = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pl) / (W - pl - pr)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="chart-wrap">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart" onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        role="img" aria-label={`Classement de ${points[0].rating} à ${points[points.length - 1].rating}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pl - 6} y={y(t) + 4} textAnchor="end" className="axis">{t}</text>
          </g>
        ))}
        <text x={pl} y={H - 6} className="axis">{fmt(points[0].date)}</text>
        <text x={W - pr} y={H - 6} textAnchor="end" className="axis">{fmt(points[points.length - 1].date)}</text>
        <path d={d} className="line" />
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].rating)} r={4} className="dot-end" />
        {hp && (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={pt} y2={H - pb} className="crosshair" />
            <circle cx={x(hover!)} cy={y(hp.rating)} r={5} className="dot-end" />
          </g>
        )}
      </svg>
      {hp && (
        <div className="tooltip" style={{ left: `${(x(hover!) / W) * 100}%` }}>
          <strong>{hp.rating}</strong> · {new Date(hp.date).toLocaleDateString('fr-FR')}
        </div>
      )}
    </div>
  );
}
