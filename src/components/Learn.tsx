import { useState } from 'react';
import { MODULES, type Module } from '../lib/lessons';
import { Trainer } from './Trainer';
import { Chess } from 'chess.js';

const KEY = 'chesscoach.lessons.v1';
function loadDone(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

export function Learn({ initialModule }: { initialModule?: Module['id'] }) {
  const [done, setDone] = useState(loadDone);
  const [moduleId, setModuleId] = useState<Module['id'] | null>(initialModule ?? null);
  const [lessonIdx, setLessonIdx] = useState(0);
  const [exIdx, setExIdx] = useState(0);
  const [finished, setFinished] = useState(false);

  const mark = (k: string) => {
    const next = { ...done, [k]: true };
    setDone(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  if (!moduleId) {
    return (
      <section>
        <h2>Apprendre</h2>
        <p className="muted">Des leçons courtes avec exercices interactifs. Déplacez les pièces sur l'échiquier.</p>
        <div className="grid cards">
          {MODULES.map((m) => {
            const total = m.lessons.reduce((a, l) => a + l.exercises.length, 0);
            const ok = m.lessons.reduce((a, l) => a + l.exercises.filter((_, i) => done[`${l.id}#${i}`]).length, 0);
            return (
              <button key={m.id} className="card clickable" onClick={() => { setModuleId(m.id); setLessonIdx(0); setExIdx(0); setFinished(false); }}>
                <h3>{m.title}</h3>
                <p className="muted">{m.description}</p>
                <div className="progress" aria-label={`${ok} exercices réussis sur ${total}`}><div style={{ width: `${(ok / total) * 100}%` }} /></div>
                <small className="muted">{ok} / {total} exercices réussis</small>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  const mod = MODULES.find((m) => m.id === moduleId)!;
  const lesson = mod.lessons[lessonIdx];
  const ex = lesson.exercises[exIdx];
  const turn = new Chess(ex.fen).turn() === 'w' ? 'white' : 'black';
  const isLast = exIdx === lesson.exercises.length - 1 && lessonIdx === mod.lessons.length - 1;

  const next = () => {
    setFinished(false);
    if (exIdx < lesson.exercises.length - 1) setExIdx(exIdx + 1);
    else if (lessonIdx < mod.lessons.length - 1) { setLessonIdx(lessonIdx + 1); setExIdx(0); }
    else setModuleId(null);
  };

  return (
    <section>
      <button className="btn ghost" onClick={() => setModuleId(null)}>← Tous les modules</button>
      <h2>{mod.title}</h2>
      <div className="tabs small">
        {mod.lessons.map((l, i) => (
          <button key={l.id} className={i === lessonIdx ? 'active' : ''} onClick={() => { setLessonIdx(i); setExIdx(0); setFinished(false); }}>
            {l.exercises.every((_, j) => done[`${l.id}#${j}`]) ? '✓ ' : ''}{l.title}
          </button>
        ))}
      </div>
      <div className="lesson">
        <div className="lesson-text">
          <h3>{lesson.title}</h3>
          {lesson.theory.map((t, i) => <p key={i}>{t}</p>)}
          <hr />
          <p><strong>Exercice {exIdx + 1} / {lesson.exercises.length}</strong> — {ex.prompt}</p>
          {finished && <p className="explain">💡 {ex.explanation}</p>}
          {finished && <button className="btn" onClick={next}>{isLast ? 'Terminer le module' : 'Exercice suivant →'}</button>}
        </div>
        <Trainer
          startFen={ex.fen}
          moves={ex.solution}
          playerColor={turn}
          alternativesFirst={ex.alternatives}
          acceptAnyMate={ex.acceptAnyMate}
          onComplete={(errs) => { setFinished(true); if (errs === 0) mark(`${lesson.id}#${exIdx}`); }}
        />
      </div>
    </section>
  );
}
