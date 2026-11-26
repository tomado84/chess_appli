import { Chess } from 'chess.js';
import type { Color } from './types';

/* ---------------------------------------------------------------------- */
/*  Parseur PGN avec variantes : extrait toutes les lignes (feuilles)       */
/* ---------------------------------------------------------------------- */

function tokenize(pgn: string): string[] {
  const body = pgn
    .replace(/\[[^\]]*\]/g, ' ') // en-têtes
    .replace(/\{[^}]*\}/g, ' ') // commentaires
    .replace(/;[^\n]*/g, ' ')
    .replace(/\$\d+/g, ' ');
  const tokens: string[] = [];
  const re = /\(|\)|[^\s()]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    let t = m[0];
    if (t === '(' || t === ')') { tokens.push(t); continue; }
    t = t.replace(/^\d+\.+/, '').replace(/[!?]+$/, '');
    if (!t || /^\d+\.*$/.test(t) || ['1-0', '0-1', '1/2-1/2', '*'].includes(t)) continue;
    tokens.push(t);
  }
  return tokens;
}

/** Retourne toutes les lignes (suites de coups SAN) contenues dans un PGN annoté de variantes. */
export function pgnToLines(pgn: string): string[][] {
  const tokens = tokenize(pgn);
  const lines: string[][] = [];
  let pos = 0;

  // Analyse récursive : `prefix` = coups joués avant ce segment.
  function parseSeq(prefix: string[]): void {
    const cur = [...prefix];
    let hasChild = false;
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t === ')') { pos++; break; }
      if (t === '(') {
        pos++;
        // une variante remplace le dernier coup joué
        parseSeq(cur.slice(0, -1));
        hasChild = true;
        continue;
      }
      cur.push(t);
      pos++;
    }
    void hasChild;
    if (cur.length > prefix.length || prefix.length === 0) lines.push(cur);
  }
  parseSeq([]);

  // Validation + normalisation SAN
  const valid: string[][] = [];
  for (const l of lines) {
    const c = new Chess();
    const out: string[] = [];
    for (const mv of l) {
      try { out.push(c.move(mv).san); } catch { throw new Error(`Coup illégal « ${mv} » après ${out.join(' ') || 'la position initiale'}.`); }
    }
    if (out.length) valid.push(out);
  }
  // supprime les lignes qui sont préfixes d'autres lignes
  const keyed = valid.map((l) => l.join(' '));
  return valid.filter((l, i) => !keyed.some((k, j) => j !== i && k.startsWith(keyed[i] + ' ')))
    .filter((l, i, arr) => arr.findIndex((x) => x.join(' ') === l.join(' ')) === i);
}

/* ---------------------------------------------------------------------- */
/*  Répertoire + répétition espacée (Leitner)                               */
/* ---------------------------------------------------------------------- */

export interface RepLine {
  id: string;
  chapter: string;
  color: Color;
  moves: string[];
  box: number; // 0 = nouvelle, 1..6
  due: number; // timestamp
  reviews: number;
  lapses: number;
  lastReview?: number;
}

const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35, 80];
const KEY = 'chesscoach.repertoire.v1';

export function loadRepertoire(): RepLine[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
export function saveRepertoire(lines: RepLine[]) {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* stockage indisponible */ }
}

export function addLines(existing: RepLine[], chapter: string, color: Color, lines: string[][]): { all: RepLine[]; added: number } {
  const keys = new Set(existing.map((l) => `${l.color}|${l.moves.join(' ')}`));
  const added: RepLine[] = [];
  for (const moves of lines) {
    const k = `${color}|${moves.join(' ')}`;
    if (keys.has(k)) continue;
    keys.add(k);
    added.push({ id: Math.random().toString(36).slice(2, 10), chapter, color, moves, box: 0, due: Date.now(), reviews: 0, lapses: 0 });
  }
  return { all: [...existing, ...added], added: added.length };
}

/** Met à jour une ligne après révision. errors = nombre de coups ratés. */
export function gradeLine(line: RepLine, errors: number): RepLine {
  const now = Date.now();
  const box = errors === 0 ? Math.min(6, line.box + 1) : errors === 1 ? Math.max(1, line.box - 1) : 1;
  const days = INTERVAL_DAYS[box];
  return {
    ...line, box, reviews: line.reviews + 1, lapses: line.lapses + (errors ? 1 : 0), lastReview: now,
    due: now + days * 86400000 - 3600000, // tolérance d'une heure
  };
}

export const isDue = (l: RepLine) => l.due <= Date.now();

export function masteryLabel(box: number) {
  return ['Nouvelle', 'Apprentissage', 'Fragile', 'En progrès', 'Solide', 'Maîtrisée', 'Ancrée'][box];
}

/* Répertoire de départ, pour essayer l'outil immédiatement */
export const STARTER: { chapter: string; color: Color; pgn: string }[] = [
  {
    chapter: 'Italienne (Blancs)',
    color: 'white',
    pgn: `1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 (3... Nf6 4. d3 Be7 (4... Bc5 5. c3 d6 6. O-O) 5. O-O O-O 6. Re1) 4. c3 Nf6 (4... d6 5. d4 exd4 6. cxd4 Bb6 7. Nc3) 5. d3 d6 6. O-O O-O 7. Re1 a6 8. a4`,
  },
  {
    chapter: 'Gambit Dame (Blancs)',
    color: 'white',
    pgn: `1. d4 d5 2. c4 e6 (2... dxc4 3. e4 e5 4. Nf3 exd4 5. Bxc4) (2... c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4) 3. Nc3 Nf6 4. cxd5 exd5 5. Bg5 Be7 6. e3 O-O 7. Bd3`,
  },
  {
    chapter: 'Caro-Kann (Noirs)',
    color: 'black',
    pgn: `1. e4 c6 2. d4 d5 3. Nc3 (3. e5 Bf5 4. Nf3 e6 5. Be2 c5) (3. exd5 cxd5 4. Bd3 Nc6 5. c3 Nf6) 3... dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7`,
  },
  {
    chapter: 'Défense indienne du roi (Noirs)',
    color: 'black',
    pgn: `1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7`,
  },
];
