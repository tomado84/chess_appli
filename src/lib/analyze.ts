import { Chess } from 'chess.js';
import type { Color, Game, MoveJudgment, Speed } from './types';

/* ---------------------------------------------------------------------- */
/*  Extraction de caractéristiques par partie (rejeu avec chess.js)        */
/* ---------------------------------------------------------------------- */

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export interface GameFeatures {
  game: Game;
  plies: number;
  /** différence matérielle (moi - adversaire) après chaque demi-coup */
  material: number[];
  endgamePly: number | null; // premier demi-coup en finale
  endgameDiff: number | null; // matériel à l'entrée en finale
  firstDownPly: number | null; // premier moment où je suis durablement en retard (≥3)
  firstUpPly: number | null; // premier moment où je suis durablement en avance (≥3)
  diffAt24: number; // matériel après 12 coups
  evalAt20?: number; // éval (point de vue joueur) après 10 coups
  minMyClockRatio?: number; // plus petite fraction de temps restante
  timeTrouble: boolean;
}

function materialOf(chess: Chess, me: Color): { diff: number; nonPawn: number } {
  let mine = 0, theirs = 0, nonPawn = 0;
  const myC = me === 'white' ? 'w' : 'b';
  for (const row of chess.board()) for (const sq of row) {
    if (!sq) continue;
    const v = VAL[sq.type];
    if (sq.color === myC) mine += v; else theirs += v;
    if (sq.type !== 'p' && sq.type !== 'k') nonPawn += v;
  }
  return { diff: mine - theirs, nonPawn };
}

function myPov(evalCp: number | null | undefined, color: Color): number | undefined {
  if (evalCp === null || evalCp === undefined) return undefined;
  return color === 'white' ? evalCp : -evalCp;
}

export function extractFeatures(g: Game): GameFeatures {
  const chess = new Chess();
  const material: number[] = [];
  let endgamePly: number | null = null;
  let endgameDiff: number | null = null;
  for (let i = 0; i < g.moves.length; i++) {
    try { chess.move(g.moves[i]); } catch { break; }
    const { diff, nonPawn } = materialOf(chess, g.color);
    material.push(diff);
    // Finale : matériel hors pions ≤ 26 au total (ex. T+F contre T+F) après la phase d'ouverture
    if (endgamePly === null && i >= 20 && nonPawn <= 26) {
      endgamePly = i;
      endgameDiff = diff;
    }
  }
  // Déséquilibre « stable » : même valeur sur 2 demi-coups consécutifs (pas de reprise en cours)
  let firstDownPly: number | null = null, firstUpPly: number | null = null;
  for (let i = 0; i < material.length - 1; i++) {
    const stable = material[i] === material[i + 1];
    if (!stable) continue;
    if (firstDownPly === null && material[i] <= -3) firstDownPly = i;
    if (firstUpPly === null && material[i] >= 3) firstUpPly = i;
  }
  const lastIdx = material.length - 1;
  // fin de partie : le dernier coup compte même sans confirmation
  if (lastIdx >= 0) {
    if (firstDownPly === null && material[lastIdx] <= -3) firstDownPly = lastIdx;
    if (firstUpPly === null && material[lastIdx] >= 3) firstUpPly = lastIdx;
  }

  let minMyClockRatio: number | undefined;
  if (g.clocks && g.initialTime && g.speed !== 'daily') {
    const start = g.color === 'white' ? 0 : 1;
    let min = Infinity;
    for (let i = start; i < g.clocks.length; i += 2) min = Math.min(min, g.clocks[i]);
    if (min !== Infinity) minMyClockRatio = min / g.initialTime;
  }

  const ev20 = g.evals ? myPov(g.evals[Math.min(19, g.evals.length - 1)], g.color) : undefined;

  return {
    game: g,
    plies: g.moves.length,
    material,
    endgamePly,
    endgameDiff,
    firstDownPly,
    firstUpPly,
    diffAt24: material[Math.min(23, lastIdx)] ?? 0,
    evalAt20: ev20 === undefined ? undefined : Math.max(-1000, Math.min(1000, ev20)),
    minMyClockRatio,
    timeTrouble: minMyClockRatio !== undefined && (minMyClockRatio < 0.1 || (g.clocks !== undefined && minClock(g) < 15)),
  };
}

function minClock(g: Game): number {
  const start = g.color === 'white' ? 0 : 1;
  let min = Infinity;
  for (let i = start; i < (g.clocks?.length ?? 0); i += 2) min = Math.min(min, g.clocks![i]);
  return min;
}

/* ---------------------------------------------------------------------- */
/*  Statistiques agrégées                                                   */
/* ---------------------------------------------------------------------- */

export interface WDL { n: number; w: number; d: number; l: number; score: number }

function wdl(games: Game[]): WDL {
  const w = games.filter((g) => g.result === 'win').length;
  const d = games.filter((g) => g.result === 'draw').length;
  const l = games.length - w - d;
  return { n: games.length, w, d, l, score: games.length ? (w + d / 2) / games.length : 0 };
}

/** Lissage bayésien d'un taux vers un a priori (évite les conclusions sur 2 parties). */
function smooth(success: number, total: number, prior = 0.5, weight = 4): number {
  return (success + prior * weight) / (total + weight);
}
const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, x));
const expected = (my: number, opp: number) => 1 / (1 + Math.pow(10, (opp - my) / 400));

export interface OpeningStat extends WDL { name: string; color: Color; avgPlies: number }

export interface Dimension {
  key: 'opening' | 'tactics' | 'conversion' | 'defense' | 'endgame' | 'time' | 'mental';
  label: string;
  score: number; // 0-100
  detail: string;
  reliable: boolean; // assez de données ?
}

export interface Insight { text: string; tone: 'good' | 'bad' | 'neutral'; lesson?: string }

export interface Report {
  username: string;
  source: Game['source'];
  games: Game[];
  overall: WDL;
  byColor: Record<Color, WDL>;
  bySpeed: { speed: Speed; stats: WDL; rating?: number }[];
  openings: OpeningStat[];
  dimensions: Dimension[];
  globalScore: number;
  level: string;
  strengths: Insight[];
  weaknesses: Insight[];
  terminations: { label: string; win: number; loss: number }[];
  phaseOfLoss: { opening: number; middlegame: number; endgame: number };
  performance?: number;
  hasEngineData: boolean;
  avgAccuracy?: number;
  mistakes: (MoveJudgment & { game: Game })[];
  ratingHistory: { date: number; rating: number; speed: Speed }[];
  worstGames: Game[];
}

const SPEED_FR: Record<Speed, string> = {
  bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapide', classical: 'Classique', daily: 'Par correspondance',
};
export const speedLabel = (s: Speed) => SPEED_FR[s];

function phaseOf(ply: number, f: GameFeatures): 'opening' | 'middlegame' | 'endgame' {
  if (ply < 24) return 'opening';
  if (f.endgamePly !== null && ply >= f.endgamePly) return 'endgame';
  return 'middlegame';
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

export function buildReport(username: string, games: Game[]): Report {
  const feats = games.map(extractFeatures);
  const overall = wdl(games);
  const byColor = {
    white: wdl(games.filter((g) => g.color === 'white')),
    black: wdl(games.filter((g) => g.color === 'black')),
  };

  const speeds: Speed[] = ['bullet', 'blitz', 'rapid', 'classical', 'daily'];
  const bySpeed = speeds
    .map((speed) => {
      const gs = games.filter((g) => g.speed === speed);
      const latest = gs.slice().sort((a, b) => b.date - a.date)[0];
      return { speed, stats: wdl(gs), rating: latest?.myRating };
    })
    .filter((s) => s.stats.n > 0);

  // Ouvertures
  const map = new Map<string, Game[]>();
  for (const g of games) {
    const k = `${g.color}|${g.openingFamily}`;
    map.set(k, [...(map.get(k) ?? []), g]);
  }
  const openings: OpeningStat[] = [...map.entries()]
    .map(([k, gs]) => {
      const [color, name] = k.split('|') as [Color, string];
      return { ...wdl(gs), name, color, avgPlies: gs.reduce((s, g) => s + g.moves.length, 0) / gs.length };
    })
    .sort((a, b) => b.n - a.n);

  const hasEngineData = games.some((g) => g.evals && g.evals.length);
  const withAcc = games.filter((g) => g.accuracy !== undefined);
  const avgAccuracy = withAcc.length ? withAcc.reduce((s, g) => s + g.accuracy!, 0) / withAcc.length : undefined;

  /* -------- Dimensions -------- */
  const dims: Dimension[] = [];

  // 1. Ouvertures : sortie d'ouverture (éval après 10 coups ou matériel après 12 coups)
  {
    const withEval = feats.filter((f) => f.evalAt20 !== undefined);
    let s: number, detail: string;
    if (withEval.length >= 8) {
      const avg = withEval.reduce((a, f) => a + f.evalAt20!, 0) / withEval.length;
      const good = withEval.reduce((a, f) => a + 1 / (1 + Math.exp(-f.evalAt20! / 150)), 0);
      s = smooth(good, withEval.length) * 100;
      detail = `Évaluation moyenne après 10 coups : ${avg >= 0 ? '+' : ''}${(avg / 100).toFixed(2)} (${withEval.length} parties analysées).`;
    } else {
      const ok = feats.reduce((a, f) => a + (f.diffAt24 >= 1 ? 1 : f.diffAt24 <= -1 ? 0 : 0.5), 0);
      const lostEarly = feats.filter((f) => f.firstDownPly !== null && f.firstDownPly < 24).length;
      s = smooth(ok, feats.length) * 100;
      detail = `Matériel perdu dès l'ouverture dans ${pct(lostEarly / Math.max(1, feats.length))} des parties.`;
    }
    dims.push({ key: 'opening', label: 'Ouvertures', score: s, detail, reliable: feats.length >= 10 });
  }

  // 2. Tactique : qui gagne du matériel en premier / gaffes par partie / précision
  {
    const decided = feats.filter((f) => f.firstUpPly !== null || f.firstDownPly !== null);
    const meFirst = decided.filter((f) =>
      f.firstUpPly !== null && (f.firstDownPly === null || f.firstUpPly < f.firstDownPly)).length;
    let s = smooth(meFirst, decided.length) * 100;
    let detail = `Vous gagnez du matériel en premier dans ${pct(meFirst / Math.max(1, decided.length))} des parties déséquilibrées.`;
    const analysed = games.filter((g) => g.counts);
    if (analysed.length >= 5) {
      const bpg = analysed.reduce((a, g) => a + g.counts!.blunder, 0) / analysed.length;
      const mpg = analysed.reduce((a, g) => a + g.counts!.mistake, 0) / analysed.length;
      const engine = 100 * Math.exp(-(bpg + 0.4 * mpg) / 1.3);
      s = 0.4 * s + 0.6 * engine;
      detail += ` ${bpg.toFixed(2)} gaffe(s) et ${mpg.toFixed(2)} erreur(s) par partie analysée.`;
    }
    if (avgAccuracy !== undefined && withAcc.length >= 5) {
      s = 0.6 * s + 0.4 * clamp((avgAccuracy - 55) * 2.5);
      detail += ` Précision moyenne : ${avgAccuracy.toFixed(1)} %.`;
    }
    dims.push({ key: 'tactics', label: 'Tactique', score: s, detail, reliable: decided.length >= 8 });
  }

  // 3. Conversion : gagner les parties où l'on mène
  {
    const ahead = feats.filter((f) => f.firstUpPly !== null);
    const won = ahead.filter((f) => f.game.result === 'win').length;
    const drawn = ahead.filter((f) => f.game.result === 'draw').length;
    const rate = smooth(won + drawn * 0.3, ahead.length, 0.75);
    // 75 % = moyenne, 95 % = excellent
    const s = clamp(50 + (rate - 0.75) * 180);
    dims.push({
      key: 'conversion', label: 'Conversion de l\'avantage', score: s, reliable: ahead.length >= 6,
      detail: `Avec au moins 3 points d'avance matérielle, vous gagnez ${pct(won / Math.max(1, ahead.length))} des parties (${ahead.length} cas).`,
    });
  }

  // 4. Défense / résilience
  {
    const behind = feats.filter((f) => f.firstDownPly !== null);
    const saved = behind.filter((f) => f.game.result !== 'loss');
    const savedPts = behind.reduce((a, f) => a + (f.game.result === 'win' ? 1 : f.game.result === 'draw' ? 0.5 : 0), 0);
    const rate = smooth(savedPts, behind.length, 0.2);
    const s = clamp(50 + (rate - 0.2) * 200);
    dims.push({
      key: 'defense', label: 'Défense & ressources', score: s, reliable: behind.length >= 6,
      detail: `Après avoir perdu du matériel, vous sauvez ${pct(saved.length / Math.max(1, behind.length))} des parties (${behind.length} cas).`,
    });
  }

  // 5. Finales : score dans les finales abordées à égalité (±1)
  {
    const eq = feats.filter((f) => f.endgamePly !== null && Math.abs(f.endgameDiff ?? 0) <= 1);
    const pts = eq.reduce((a, f) => a + (f.game.result === 'win' ? 1 : f.game.result === 'draw' ? 0.5 : 0), 0);
    // performance vs attendu Elo
    const exp = eq.reduce((a, f) => a + (f.game.myRating && f.game.oppRating ? expected(f.game.myRating, f.game.oppRating) : 0.5), 0);
    const s = clamp(50 + ((pts - exp) / Math.max(4, eq.length)) * 250);
    dims.push({
      key: 'endgame', label: 'Finales', score: s, reliable: eq.length >= 6,
      detail: `Score de ${pct(pts / Math.max(1, eq.length))} dans les finales abordées à égalité matérielle (${eq.length} parties, attendu ${pct(exp / Math.max(1, eq.length))}).`,
    });
  }

  // 6. Gestion du temps
  {
    const timed = feats.filter((f) => f.minMyClockRatio !== undefined);
    const losses = games.filter((g) => g.result === 'loss');
    const timeoutLosses = losses.filter((g) => g.termination === 'timeout').length;
    const timeoutWins = games.filter((g) => g.result === 'win' && g.termination === 'timeout').length;
    const ttRate = timed.length ? timed.filter((f) => f.timeTrouble).length / timed.length : 0;
    const toShare = timeoutLosses / Math.max(1, losses.length);
    const s = clamp(100 - ttRate * 90 - toShare * 120 + Math.min(10, timeoutWins));
    let detail = `${pct(toShare)} de vos défaites sont au temps.`;
    if (timed.length) detail += ` Zeitnot (moins de 10 % du temps) dans ${pct(ttRate)} des parties.`;
    dims.push({ key: 'time', label: 'Gestion du temps', score: s, detail, reliable: games.length >= 10 });
  }

  // 7. Mental : réaction après une défaite + parties contre plus fort
  {
    const sorted = games.slice().sort((a, b) => a.date - b.date);
    const afterLoss: Game[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].date - sorted[i - 1].date;
      if (sorted[i - 1].result === 'loss' && gap < 1000 * 60 * 60) afterLoss.push(sorted[i]);
    }
    const al = wdl(afterLoss);
    const diff = afterLoss.length ? al.score - overall.score : 0;
    const vsStronger = games.filter((g) => g.myRating && g.oppRating && g.oppRating - g.myRating >= 100);
    const vsS = wdl(vsStronger);
    const expS = vsStronger.reduce((a, g) => a + expected(g.myRating!, g.oppRating!), 0) / Math.max(1, vsStronger.length);
    const s = clamp(55 + diff * 150 + (vsStronger.length >= 5 ? (vsS.score - expS) * 120 : 0));
    let detail = afterLoss.length
      ? `Score juste après une défaite : ${pct(al.score)} (contre ${pct(overall.score)} en moyenne, ${afterLoss.length} parties).`
      : 'Pas assez d\'enchaînements de parties pour mesurer le tilt.';
    if (vsStronger.length >= 5) detail += ` Contre des joueurs mieux classés (+100) : ${pct(vsS.score)} (attendu ${pct(expS)}).`;
    dims.push({ key: 'mental', label: 'Mental & régularité', score: s, detail, reliable: afterLoss.length >= 8 });
  }

  dims.forEach((d) => (d.score = Math.round(clamp(d.score))));

  const weights: Record<Dimension['key'], number> = {
    opening: 1, tactics: 1.6, conversion: 1, defense: 0.8, endgame: 1, time: 0.8, mental: 0.6,
  };
  const wSum = dims.reduce((a, d) => a + weights[d.key], 0);
  const globalScore = Math.round(dims.reduce((a, d) => a + d.score * weights[d.key], 0) / wSum);

  // Performance Elo approximative
  const rated = games.filter((g) => g.oppRating);
  let performance: number | undefined;
  if (rated.length >= 5) {
    const avgOpp = rated.reduce((a, g) => a + g.oppRating!, 0) / rated.length;
    const sc = clamp(wdl(rated).score, 0.01, 0.99);
    performance = Math.round(avgOpp + 400 * Math.log10(sc / (1 - sc)));
  }
  const mainRating = bySpeed.slice().sort((a, b) => b.stats.n - a.stats.n)[0]?.rating ?? performance ?? 1200;
  const level = mainRating < 1000 ? 'Débutant' : mainRating < 1400 ? 'Intermédiaire'
    : mainRating < 1800 ? 'Club confirmé' : mainRating < 2100 ? 'Avancé' : mainRating < 2400 ? 'Expert' : 'Maître';

  // Terminaisons
  const terms: [string, string][] = [['mate', 'Mat'], ['resign', 'Abandon'], ['timeout', 'Temps'], ['other', 'Autre']];
  const terminations = terms.map(([k, label]) => ({
    label,
    win: games.filter((g) => g.result === 'win' && g.termination === k).length,
    loss: games.filter((g) => g.result === 'loss' && g.termination === k).length,
  }));

  // Phase où le matériel est perdu (parties perdues)
  const phaseOfLoss = { opening: 0, middlegame: 0, endgame: 0 };
  for (const f of feats) {
    if (f.game.result !== 'loss') continue;
    const ply = f.firstDownPly ?? f.plies - 1;
    phaseOfLoss[phaseOf(ply, f)]++;
  }

  /* -------- Forces & faiblesses -------- */
  const LESSON: Record<Dimension['key'], string> = {
    opening: 'openings', tactics: 'tactics', conversion: 'tactics', defense: 'tactics',
    endgame: 'endgames', time: 'openings', mental: 'openings',
  };
  const strengths: Insight[] = [];
  const weaknesses: Insight[] = [];
  const ranked = dims.filter((d) => d.reliable || games.length >= 30).sort((a, b) => b.score - a.score);
  for (const d of ranked) {
    if (d.score >= 60 && strengths.length < 3) strengths.push({ text: `${d.label} (${d.score}/100) — ${d.detail}`, tone: 'good' });
  }
  for (const d of ranked.slice().reverse()) {
    if (d.score < 50 && weaknesses.length < 3) weaknesses.push({ text: `${d.label} (${d.score}/100) — ${d.detail}`, tone: 'bad', lesson: LESSON[d.key] });
  }

  const solid = openings.filter((o) => o.n >= 5);
  const best = solid.slice().sort((a, b) => b.score - a.score)[0];
  const worst = solid.slice().sort((a, b) => a.score - b.score)[0];
  if (best && best.score >= 0.58)
    strengths.push({ text: `Arme favorite : ${best.name} avec les ${best.color === 'white' ? 'Blancs' : 'Noirs'} — ${pct(best.score)} sur ${best.n} parties.`, tone: 'good' });
  if (worst && worst.score <= 0.42 && worst !== best)
    weaknesses.push({ text: `Ouverture à retravailler : ${worst.name} avec les ${worst.color === 'white' ? 'Blancs' : 'Noirs'} — ${pct(worst.score)} sur ${worst.n} parties.`, tone: 'bad', lesson: 'repertoire' });

  if (byColor.white.n >= 8 && byColor.black.n >= 8) {
    const gap = byColor.white.score - byColor.black.score;
    if (gap > 0.12) weaknesses.push({ text: `Nette différence entre couleurs : ${pct(byColor.white.score)} avec les Blancs contre ${pct(byColor.black.score)} avec les Noirs. Votre répertoire noir mérite de l'attention.`, tone: 'bad', lesson: 'repertoire' });
    else if (gap < -0.12) weaknesses.push({ text: `Vous scorez mieux avec les Noirs (${pct(byColor.black.score)}) qu'avec les Blancs (${pct(byColor.white.score)}) : vos premiers coups blancs manquent peut-être d'ambition.`, tone: 'bad', lesson: 'repertoire' });
    else strengths.push({ text: `Jeu équilibré avec les deux couleurs (${pct(byColor.white.score)} / ${pct(byColor.black.score)}).`, tone: 'good' });
  }

  const lossCount = Math.max(1, overall.l);
  if (phaseOfLoss.opening / lossCount > 0.35 && overall.l >= 6)
    weaknesses.push({ text: `${pct(phaseOfLoss.opening / lossCount)} de vos défaites se jouent avant le 12e coup : attention aux pièges d'ouverture.`, tone: 'bad', lesson: 'openings' });
  const mateLosses = games.filter((g) => g.result === 'loss' && g.termination === 'mate').length;
  if (mateLosses / lossCount > 0.3 && overall.l >= 6)
    weaknesses.push({ text: `${pct(mateLosses / lossCount)} de vos défaites se terminent par un mat : surveillez la sécurité de votre roi.`, tone: 'bad', lesson: 'mates' });
  const mateWins = games.filter((g) => g.result === 'win' && g.termination === 'mate').length;
  if (overall.w >= 6 && mateWins / overall.w > 0.3)
    strengths.push({ text: `Attaquant redoutable : ${pct(mateWins / overall.w)} de vos victoires se terminent par un mat.`, tone: 'good' });

  if (bySpeed.length >= 2) {
    const s = bySpeed.filter((x) => x.stats.n >= 8).sort((a, b) => b.stats.score - a.stats.score);
    if (s.length >= 2 && s[0].stats.score - s[s.length - 1].stats.score > 0.1)
      strengths.push({ text: `Cadence de prédilection : ${speedLabel(s[0].speed)} (${pct(s[0].stats.score)}), moins à l'aise en ${speedLabel(s[s.length - 1].speed)} (${pct(s[s.length - 1].stats.score)}).`, tone: 'neutral' });
  }

  // Erreurs relevées par le moteur (Lichess)
  const mistakes = games
    .flatMap((g) => (g.judgments ?? []).filter((j) => j.kind !== 'inaccuracy' && j.bestUci && j.fenBefore).map((j) => ({ ...j, game: g })))
    .sort((a, b) => (a.kind === b.kind ? b.game.date - a.game.date : a.kind === 'blunder' ? -1 : 1));

  const ratingHistory = games
    .filter((g) => g.myRating && g.rated)
    .map((g) => ({ date: g.date, rating: g.myRating!, speed: g.speed }))
    .sort((a, b) => a.date - b.date);

  // Défaites les plus « coûteuses » : contre plus faible, ou courtes
  const worstGames = games
    .filter((g) => g.result === 'loss')
    .sort((a, b) => ((a.oppRating ?? 0) - (a.myRating ?? 0) + a.moves.length * 3) - ((b.oppRating ?? 0) - (b.myRating ?? 0) + b.moves.length * 3))
    .slice(0, 8);

  return {
    username, source: games[0]?.source ?? 'lichess', games, overall, byColor, bySpeed, openings,
    dimensions: dims, globalScore, level, strengths, weaknesses, terminations, phaseOfLoss,
    performance, hasEngineData, avgAccuracy, mistakes, ratingHistory, worstGames,
  };
}
