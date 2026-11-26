export type Color = 'white' | 'black';
export type Result = 'win' | 'loss' | 'draw';
export type Speed = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily';
export type Termination = 'mate' | 'resign' | 'timeout' | 'draw' | 'abandon' | 'other';
export type Source = 'lichess' | 'chesscom';

export interface MoveJudgment {
  ply: number; // index du coup (0 = premier coup des blancs)
  kind: 'inaccuracy' | 'mistake' | 'blunder';
  bestUci?: string;
  fenBefore?: string;
  played: string;
}

/** Partie normalisée, quelle que soit la plateforme d'origine. */
export interface Game {
  id: string;
  source: Source;
  url: string;
  date: number; // timestamp ms
  speed: Speed;
  rated: boolean;
  color: Color;
  result: Result;
  termination: Termination;
  myRating?: number;
  oppRating?: number;
  opponent: string;
  eco?: string;
  opening: string; // nom complet
  openingFamily: string;
  moves: string[]; // SAN
  clocks?: number[]; // secondes restantes après chaque demi-coup
  initialTime?: number;
  increment?: number;
  accuracy?: number; // précision du joueur (0-100), si disponible
  acpl?: number;
  counts?: { inaccuracy: number; mistake: number; blunder: number };
  evals?: (number | null)[]; // éval en centipions, point de vue des blancs, après chaque demi-coup
  judgments?: MoveJudgment[]; // erreurs du joueur
}
