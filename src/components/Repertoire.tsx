import { useMemo, useState } from 'react';
import {
  STARTER, addLines, gradeLine, isDue, loadRepertoire, masteryLabel, pgnToLines, saveRepertoire, type RepLine,
} from '../lib/repertoire';
import type { Color } from '../lib/types';
import { Trainer } from './Trainer';

export function formatLine(moves: string[], upto = moves.length) {
  return moves.slice(0, upto).map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m)).join(' ');
}

export function useRepertoire() {
  const [lines, setLinesState] = useState<RepLine[]>(loadRepertoire);
  const setLines = (l: RepLine[]) => { setLinesState(l); saveRepertoire(l); };
  return { lines, setLines };
}

export function Repertoire({ rep }: { rep: ReturnType<typeof useRepertoire> }) {
  const { lines, setLines } = rep;
  const [session, setSession] = useState<RepLine[] | null>(null);
  const [pos, setPos] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [stats, setStats] = useState({ ok: 0, ko: 0 });
  const [showImport, setShowImport] = useState(false);
  const [pgn, setPgn] = useState('');
  const [chapter, setChapter] = useState('');
  const [color, setColor] = useState<Color>('white');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const chapters = useMemo(() => {
    const m = new Map<string, RepLine[]>();
    for (const l of lines) m.set(l.chapter, [...(m.get(l.chapter) ?? []), l]);
    return [...m.entries()];
  }, [lines]);
  const due = lines.filter(isDue);

  const start = (list: RepLine[]) => {
    const shuffled = [...list].sort(() => Math.random() - 0.5);
    setSession(shuffled); setPos(0); setResult(null); setStats({ ok: 0, ko: 0 });
  };

  const doImport = (ch: string, col: Color, text: string) => {
    try {
      const parsed = pgnToLines(text);
      if (!parsed.length) throw new Error('Aucun coup trouvé.');
      const { all, added } = addLines(lines, ch || 'Sans titre', col, parsed);
      setLines(all);
      setMsg({ ok: true, text: `${added} ligne(s) ajoutée(s) à « ${ch || 'Sans titre'} ».` });
      setPgn(''); setChapter('');
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  if (session) {
    const line = session[pos];
    if (!line) {
      return (
        <section>
          <h2>Session terminée</h2>
          <p>{stats.ok} ligne(s) sans faute, {stats.ko} à revoir. Les lignes ratées reviendront demain, les autres plus tard.</p>
          <button className="btn" onClick={() => setSession(null)}>Retour au répertoire</button>
        </section>
      );
    }
    return (
      <section>
        <button className="btn ghost" onClick={() => setSession(null)}>← Quitter la session</button>
        <h2>Révision — {pos + 1} / {session.length}</h2>
        <div className="lesson">
          <div className="lesson-text">
            <h3>{line.chapter}</h3>
            <p className="muted">Vous jouez les {line.color === 'white' ? 'Blancs' : 'Noirs'}. Jouez les coups de votre répertoire ; l'adversaire répond automatiquement.</p>
            <p><span className="pill">{masteryLabel(line.box)}</span> {line.reviews} révision(s)</p>
            {result !== null && (
              <>
                <p className="mono">{formatLine(line.moves)}</p>
                <p>{result === 0 ? '✓ Ligne maîtrisée : prochain rappel plus tard.' : `✗ ${result} erreur(s) : la ligne reviendra bientôt.`}</p>
                <button className="btn" onClick={() => { setPos(pos + 1); setResult(null); }}>Ligne suivante →</button>
              </>
            )}
          </div>
          <Trainer
            moves={line.moves}
            playerColor={line.color}
            onComplete={(errs) => {
              setResult(errs);
              setStats((s) => (errs ? { ...s, ko: s.ko + 1 } : { ...s, ok: s.ok + 1 }));
              setLines(lines.map((l) => (l.id === line.id ? gradeLine(l, errs) : l)));
            }}
          />
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2>Réviser mes variantes</h2>
      <p className="muted">Répétition espacée : chaque ligne réussie revient de plus en plus tard (1, 3, 7, 16, 35, 80 jours) ; une ligne ratée revient le lendemain.</p>

      <div className="row">
        <button className="btn" disabled={!due.length} onClick={() => start(due)}>
          Réviser maintenant ({due.length} ligne{due.length > 1 ? 's' : ''} due{due.length > 1 ? 's' : ''})
        </button>
        <button className="btn ghost" onClick={() => setShowImport(!showImport)}>+ Ajouter des variantes (PGN)</button>
      </div>

      {showImport && (
        <div className="card">
          <h3>Importer un PGN</h3>
          <p className="muted">Collez un PGN, avec ou sans variantes entre parenthèses. Chaque variante devient une ligne à réviser.</p>
          <div className="row">
            <input placeholder="Nom du chapitre (ex. Sicilienne Najdorf)" value={chapter} onChange={(e) => setChapter(e.target.value)} />
            <select value={color} onChange={(e) => setColor(e.target.value as Color)} aria-label="Couleur jouée">
              <option value="white">Je joue les Blancs</option>
              <option value="black">Je joue les Noirs</option>
            </select>
          </div>
          <textarea rows={5} placeholder="1. e4 c5 2. Nf3 d6 (2... Nc6 3. d4) 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6" value={pgn} onChange={(e) => setPgn(e.target.value)} />
          <div className="row">
            <button className="btn" onClick={() => doImport(chapter, color, pgn)} disabled={!pgn.trim()}>Importer</button>
          </div>
          <h4>Ou partez d'un répertoire de base</h4>
          <div className="row wrap">
            {STARTER.map((s) => (
              <button key={s.chapter} className="btn ghost" onClick={() => doImport(s.chapter, s.color, s.pgn)}>{s.chapter}</button>
            ))}
          </div>
          {msg && <p className={msg.ok ? 'ok' : 'err'}>{msg.ok ? '✓ ' : '✗ '}{msg.text}</p>}
        </div>
      )}

      {!lines.length && !showImport && (
        <div className="card empty">
          <p>Votre répertoire est vide. Ajoutez un PGN, importez un répertoire de base, ou analysez votre profil pour ajouter les ouvertures que vous jouez réellement.</p>
        </div>
      )}

      {chapters.map(([name, ls]) => {
        const d = ls.filter(isDue).length;
        const avg = ls.reduce((a, l) => a + l.box, 0) / ls.length;
        return (
          <div key={name} className="card">
            <div className="row space">
              <div>
                <h3>{name}</h3>
                <small className="muted">{ls.length} ligne(s) · {ls[0].color === 'white' ? 'Blancs' : 'Noirs'} · {d} due(s)</small>
                <div className="progress" aria-label={`Maîtrise ${Math.round((avg / 6) * 100)} %`}><div style={{ width: `${(avg / 6) * 100}%` }} /></div>
              </div>
              <div className="row">
                <button className="btn" onClick={() => start(ls)}>S'entraîner</button>
                <button className="btn ghost" onClick={() => setOpen(open === name ? null : name)}>{open === name ? 'Masquer' : 'Voir les lignes'}</button>
                <button className="btn ghost danger" onClick={() => { if (confirm(`Supprimer le chapitre « ${name} » ?`)) setLines(lines.filter((l) => l.chapter !== name)); }}>Supprimer</button>
              </div>
            </div>
            {open === name && (
              <ul className="lines">
                {ls.map((l) => (
                  <li key={l.id}>
                    <span className="pill">{masteryLabel(l.box)}</span>
                    <span className="mono">{formatLine(l.moves)}</span>
                    <button className="link danger" aria-label="Supprimer la ligne" onClick={() => setLines(lines.filter((x) => x.id !== l.id))}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
