import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import type { Color } from '../lib/types';

export interface TrainerProps {
  startFen?: string;
  /** Suite SAN attendue (coups du joueur ET de l'adversaire). */
  moves: string[];
  playerColor: Color;
  alternativesFirst?: string[];
  acceptAnyMate?: boolean;
  onComplete?: (errors: number) => void;
  /** Texte affiché à la fin. */
  successText?: string;
}

type Status = { kind: 'idle' | 'ok' | 'bad' | 'done' | 'hint'; text: string };

export function useBoardWidth() {
  const [w, setW] = useState(() => Math.min(480, window.innerWidth - 48));
  useEffect(() => {
    const on = () => setW(Math.min(480, window.innerWidth - 48));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export function Trainer({ startFen, moves, playerColor, alternativesFirst = [], acceptAnyMate, onComplete, successText }: TrainerProps) {
  const chessRef = useRef(new Chess(startFen));
  const [fen, setFen] = useState(chessRef.current.fen());
  const [idx, setIdx] = useState(0);
  const [errors, setErrors] = useState(0);
  const [wrongHere, setWrongHere] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: 'À vous de jouer.' });
  const [highlight, setHighlight] = useState<Record<string, React.CSSProperties>>({});
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const width = useBoardWidth();
  const key = useMemo(() => `${startFen}|${moves.join(' ')}`, [startFen, moves]);
  const doneRef = useRef(false);

  // Réinitialisation quand l'exercice change
  useEffect(() => {
    chessRef.current = new Chess(startFen);
    setFen(chessRef.current.fen());
    setIdx(0); setErrors(0); setWrongHere(0); setHighlight({}); setLastMove(null);
    doneRef.current = false;
    setStatus({ kind: 'idle', text: 'À vous de jouer.' });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const myTurn = () => (chessRef.current.turn() === 'w') === (playerColor === 'white');

  const finish = (errs: number) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setStatus({ kind: 'done', text: successText ?? (errs === 0 ? 'Parfait, sans faute !' : `Terminé avec ${errs} erreur(s).`) });
    onComplete?.(errs);
  };

  // Coups adverses joués automatiquement
  useEffect(() => {
    if (doneRef.current) return;
    if (idx >= moves.length) { finish(errors); return; }
    if (myTurn()) return;
    const t = setTimeout(() => {
      const m = chessRef.current.move(moves[idx]);
      setLastMove([m.from, m.to]);
      setFen(chessRef.current.fen());
      setIdx(idx + 1);
    }, 450);
    return () => clearTimeout(t);
  }, [idx, key]); // eslint-disable-line react-hooks/exhaustive-deps

  function tryMove(from: Square, to: Square, promo?: string): boolean {
    if (doneRef.current || idx >= moves.length || !myTurn()) return false;
    const probe = new Chess(chessRef.current.fen());
    let played;
    try {
      played = probe.move({ from, to, promotion: promo ?? 'q' });
    } catch {
      return false;
    }
    const expected = moves[idx];
    const norm = (s: string) => s.replace(/[+#]/g, '');
    const accepted =
      norm(played.san) === norm(expected) ||
      (idx === 0 && alternativesFirst.some((a) => norm(a) === norm(played.san))) ||
      (acceptAnyMate && probe.isCheckmate());

    if (!accepted) {
      const n = wrongHere + 1;
      setWrongHere(n);
      if (n === 1) setErrors((e) => e + 1);
      setHighlight({ [to]: { background: 'rgba(220,60,61,.55)' } });
      setStatus({ kind: 'bad', text: `${played.san} n'est pas le coup attendu. ${n >= 2 ? 'Indice : la pièce à jouer est surlignée.' : 'Réessayez.'}` });
      if (n >= 2) {
        const c = new Chess(chessRef.current.fen());
        const m = c.move(expected);
        setTimeout(() => setHighlight({ [m.from]: { background: 'rgba(251,179,21,.6)' } }), 600);
      } else setTimeout(() => setHighlight({}), 700);
      return false;
    }
    chessRef.current.move(played.san);
    setLastMove([played.from, played.to]);
    setFen(chessRef.current.fen());
    setHighlight({});
    setWrongHere(0);
    const nextIdx = idx + 1;
    // Coup de mat alternatif : l'exercice est terminé
    if (chessRef.current.isCheckmate() || nextIdx >= moves.length) {
      setIdx(moves.length);
      finish(errors);
      return true;
    }
    setStatus({ kind: 'ok', text: `${played.san} — bien joué !` });
    setIdx(nextIdx);
    return true;
  }

  function showSolution() {
    if (doneRef.current || !myTurn() || idx >= moves.length) return;
    if (wrongHere === 0) setErrors((e) => e + 1);
    const m = chessRef.current.move(moves[idx]);
    setLastMove([m.from, m.to]);
    setFen(chessRef.current.fen());
    setWrongHere(0);
    setHighlight({});
    setStatus({ kind: 'hint', text: `La solution était ${m.san}.` });
    const next = idx + 1;
    setIdx(next);
    if (next >= moves.length) finish(errors + (wrongHere === 0 ? 1 : 0));
  }

  const squareStyles = {
    ...(lastMove ? { [lastMove[0]]: { background: 'rgba(37,125,224,.28)' }, [lastMove[1]]: { background: 'rgba(37,125,224,.4)' } } : {}),
    ...highlight,
  };

  return (
    <div className="trainer">
      <Chessboard
        id={key}
        position={fen}
        boardWidth={width}
        boardOrientation={playerColor}
        onPieceDrop={(from, to, piece) => {
          const promo = piece[1]?.toLowerCase();
          const isPromo = piece[1] !== 'P' && chessRef.current.get(from as Square)?.type === 'p';
          return tryMove(from as Square, to as Square, isPromo ? promo : undefined);
        }}
        isDraggablePiece={({ piece }) => piece[0] === (playerColor === 'white' ? 'w' : 'b')}
        customSquareStyles={squareStyles}
        customDarkSquareStyle={{ backgroundColor: '#b58863' }}
        customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
        animationDuration={200}
      />
      <div className={`status status-${status.kind}`} role="status">
        <span className="status-icon" aria-hidden>{status.kind === 'bad' ? '✗' : status.kind === 'done' || status.kind === 'ok' ? '✓' : '•'}</span>
        {status.text}
      </div>
      {status.kind !== 'done' && (
        <button className="btn ghost" onClick={showSolution}>Voir le coup</button>
      )}
    </div>
  );
}
