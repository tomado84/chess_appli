import { Chess } from 'chess.js';
import type { Color, Game, MoveJudgment, Result, Speed, Termination } from './types';

export type Progress = (msg: string) => void;

/* ----------------------------- Utilitaires ----------------------------- */

const FAMILY_WORDS = ['Defense', 'Opening', 'Game', 'Gambit', 'Attack', 'System', 'Countergambit', 'Variation'];

export function openingFamily(name: string): string {
  if (!name) return 'Inconnue';
  const base = name.split(':')[0].split(',')[0].trim();
  // Noms Chess.com issus de l'URL : on coupe après le premier mot « famille »
  const words = base.split(' ');
  const idx = words.findIndex((w) => FAMILY_WORDS.includes(w));
  if (idx >= 0 && idx < words.length - 1) return words.slice(0, idx + 1).join(' ');
  return base;
}

function speedFromSeconds(initial: number, inc: number): Speed {
  const est = initial + 40 * inc;
  if (est < 180) return 'bullet';
  if (est < 480) return 'blitz';
  if (est < 1500) return 'rapid';
  return 'classical';
}

/** Rejoue les coups pour obtenir le FEN avant chaque demi-coup. */
export function fensBefore(moves: string[]): string[] {
  const c = new Chess();
  const out: string[] = [];
  for (const m of moves) {
    out.push(c.fen());
    try {
      c.move(m);
    } catch {
      break;
    }
  }
  return out;
}

/* ------------------------------- Lichess ------------------------------- */

interface LichessPlayer {
  user?: { name: string };
  aiLevel?: number;
  rating?: number;
  analysis?: { inaccuracy: number; mistake: number; blunder: number; acpl: number; accuracy?: number };
}
interface LichessGame {
  id: string;
  rated: boolean;
  variant: string;
  speed: string;
  createdAt: number;
  status: string;
  players: { white: LichessPlayer; black: LichessPlayer };
  winner?: Color;
  opening?: { eco: string; name: string; ply: number };
  moves: string;
  clocks?: number[];
  clock?: { initial: number; increment: number };
  analysis?: { eval?: number; mate?: number; best?: string; judgment?: { name: string } }[];
}

function lichessTermination(status: string): Termination {
  switch (status) {
    case 'mate': return 'mate';
    case 'resign': return 'resign';
    case 'outoftime': case 'timeout': return 'timeout';
    case 'draw': case 'stalemate': return 'draw';
    case 'noStart': case 'aborted': return 'abandon';
    default: return 'other';
  }
}

export async function fetchLichess(username: string, max: number, onProgress: Progress): Promise<Game[]> {
  const params = new URLSearchParams({
    max: String(max), opening: 'true', clocks: 'true', evals: 'true', accuracy: 'true', moves: 'true',
  });
  onProgress('Connexion à Lichess…');
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}?${params}`, {
    headers: { Accept: 'application/x-ndjson' },
  });
  if (res.status === 404) throw new Error(`Utilisateur Lichess « ${username} » introuvable.`);
  if (res.status === 429) throw new Error('Lichess limite les requêtes : réessayez dans une minute.');
  if (!res.ok || !res.body) throw new Error(`Erreur Lichess (${res.status}).`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const raw: LichessGame[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const l of lines) if (l.trim()) raw.push(JSON.parse(l));
    onProgress(`Lichess : ${raw.length} parties téléchargées…`);
  }
  if (buffer.trim()) raw.push(JSON.parse(buffer));

  const lower = username.toLowerCase();
  const games: Game[] = [];
  for (const g of raw) {
    if (g.variant !== 'standard' && g.variant !== 'fromPosition') continue;
    if (g.variant === 'fromPosition') continue;
    const color: Color = g.players.white.user?.name.toLowerCase() === lower ? 'white' : 'black';
    const me = g.players[color];
    const opp = g.players[color === 'white' ? 'black' : 'white'];
    const term = lichessTermination(g.status);
    if (term === 'abandon') continue;
    const result: Result = !g.winner ? 'draw' : g.winner === color ? 'win' : 'loss';
    const moves = g.moves ? g.moves.split(' ') : [];
    if (moves.length < 2) continue;

    const speed = (['bullet', 'blitz', 'rapid', 'classical'].includes(g.speed)
      ? g.speed : g.speed === 'correspondence' ? 'daily' : 'blitz') as Speed;

    let evals: (number | null)[] | undefined;
    let judgments: MoveJudgment[] | undefined;
    if (g.analysis && g.analysis.length) {
      evals = g.analysis.map((a) =>
        a.eval !== undefined ? a.eval : a.mate !== undefined ? (a.mate > 0 ? 10000 : -10000) : null);
      const fens = fensBefore(moves);
      judgments = [];
      g.analysis.forEach((a, ply) => {
        const mine = (ply % 2 === 0) === (color === 'white');
        if (!mine || !a.judgment) return;
        const n = a.judgment.name.toLowerCase();
        const kind = n.startsWith('blunder') ? 'blunder' : n.startsWith('mistake') ? 'mistake' : 'inaccuracy';
        judgments!.push({ ply, kind, bestUci: a.best, fenBefore: fens[ply], played: moves[ply] });
      });
    }

    games.push({
      id: g.id,
      source: 'lichess',
      url: `https://lichess.org/${g.id}${color === 'black' ? '/black' : ''}`,
      date: g.createdAt,
      speed,
      rated: g.rated,
      color,
      result,
      termination: result === 'draw' ? 'draw' : term,
      myRating: me.rating,
      oppRating: opp.rating,
      opponent: opp.user?.name ?? (opp.aiLevel ? `Stockfish niv. ${opp.aiLevel}` : 'Anonyme'),
      eco: g.opening?.eco,
      opening: g.opening?.name ?? 'Inconnue',
      openingFamily: openingFamily(g.opening?.name ?? ''),
      moves,
      clocks: g.clocks?.map((c) => c / 100),
      initialTime: g.clock?.initial,
      increment: g.clock?.increment,
      accuracy: me.analysis?.accuracy,
      acpl: me.analysis?.acpl,
      counts: me.analysis
        ? { inaccuracy: me.analysis.inaccuracy, mistake: me.analysis.mistake, blunder: me.analysis.blunder }
        : undefined,
      evals,
      judgments,
    });
  }
  return games;
}

/* ------------------------------ Chess.com ------------------------------ */

interface CcPlayer { username: string; rating: number; result: string }
interface CcGame {
  url: string;
  pgn?: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  time_class: string;
  rules: string;
  accuracies?: { white: number; black: number };
  white: CcPlayer;
  black: CcPlayer;
  eco?: string;
}

const CC_DRAWS = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];

function ccOpeningName(ecoUrl?: string, pgnHeader?: string): string {
  const url = ecoUrl ?? pgnHeader;
  if (!url) return 'Inconnue';
  const slug = url.split('/openings/')[1] ?? '';
  const words = slug.split('-');
  const cut = words.findIndex((w) => /^\d/.test(w)); // coupe les coups « 6.Be3 »
  return (cut >= 0 ? words.slice(0, cut) : words).join(' ').replace(/\.\.\./g, '') || 'Inconnue';
}

export function parseClockComments(pgn: string): number[] {
  const out: number[] = [];
  const re = /\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn))) out.push(+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]));
  return out;
}

export async function fetchChessCom(username: string, max: number, onProgress: Progress): Promise<Game[]> {
  const u = username.toLowerCase();
  onProgress('Connexion à Chess.com…');
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`);
  if (res.status === 404) throw new Error(`Utilisateur Chess.com « ${username} » introuvable.`);
  if (!res.ok) throw new Error(`Erreur Chess.com (${res.status}).`);
  const { archives } = (await res.json()) as { archives: string[] };
  const raw: CcGame[] = [];
  for (const url of [...archives].reverse()) {
    if (raw.length >= max) break;
    onProgress(`Chess.com : archive ${url.split('/').slice(-2).join('/')} (${raw.length} parties)…`);
    const r = await fetch(url);
    if (!r.ok) continue;
    const { games } = (await r.json()) as { games: CcGame[] };
    raw.push(...games.filter((g) => g.rules === 'chess').reverse());
  }

  const games: Game[] = [];
  for (const g of raw.slice(0, max)) {
    if (!g.pgn) continue;
    const color: Color = g.white.username.toLowerCase() === u ? 'white' : 'black';
    const me = g[color];
    const opp = g[color === 'white' ? 'black' : 'white'];
    const result: Result = me.result === 'win' ? 'win' : CC_DRAWS.includes(me.result) ? 'draw' : 'loss';
    const decisive = result === 'win' ? opp.result : me.result;
    const termination: Termination = result === 'draw' ? 'draw'
      : decisive === 'checkmated' ? 'mate'
      : decisive === 'resigned' ? 'resign'
      : decisive === 'timeout' ? 'timeout'
      : decisive === 'abandoned' ? 'abandon' : 'other';

    const chess = new Chess();
    try {
      chess.loadPgn(g.pgn);
    } catch {
      continue;
    }
    const moves = chess.history();
    if (moves.length < 2) continue;
    const headers = chess.header();

    let initialTime: number | undefined;
    let increment: number | undefined;
    let speed: Speed;
    if (g.time_control.includes('/')) {
      speed = 'daily';
    } else {
      const [base, inc] = g.time_control.split('+');
      initialTime = +base;
      increment = inc ? +inc : 0;
      speed = (['bullet', 'blitz', 'rapid'].includes(g.time_class) ? g.time_class : speedFromSeconds(initialTime, increment)) as Speed;
    }
    const name = ccOpeningName(g.eco, headers['ECOUrl']);
    const clocks = parseClockComments(g.pgn);

    games.push({
      id: g.url.split('/').pop() ?? g.url,
      source: 'chesscom',
      url: g.url,
      date: g.end_time * 1000,
      speed,
      rated: g.rated,
      color,
      result,
      termination,
      myRating: me.rating,
      oppRating: opp.rating,
      opponent: opp.username,
      eco: headers['ECO'],
      opening: name,
      openingFamily: openingFamily(name),
      moves,
      clocks: clocks.length === moves.length ? clocks : undefined,
      initialTime,
      increment,
      accuracy: g.accuracies?.[color],
    });
  }
  return games.sort((a, b) => b.date - a.date);
}
