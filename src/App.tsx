import { useState } from 'react';
import { Learn } from './components/Learn';
import { Profile } from './components/Profile';
import { Repertoire, useRepertoire } from './components/Repertoire';
import { isDue } from './lib/repertoire';
import type { Module } from './lib/lessons';

type Tab = 'profile' | 'learn' | 'repertoire';

export function App() {
  const [tab, setTab] = useState<Tab>('profile');
  const [lessonModule, setLessonModule] = useState<Module['id'] | undefined>();
  const [learnKey, setLearnKey] = useState(0);
  const rep = useRepertoire();
  const due = rep.lines.filter(isDue).length;

  const go = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span aria-hidden>♞</span> Chess Coach</div>
        <nav className="tabs">
          <button className={tab === 'profile' ? 'active' : ''} onClick={() => go('profile')}>Mon profil</button>
          <button className={tab === 'learn' ? 'active' : ''} onClick={() => { setLessonModule(undefined); setLearnKey((k) => k + 1); go('learn'); }}>Apprendre</button>
          <button className={tab === 'repertoire' ? 'active' : ''} onClick={() => go('repertoire')}>
            Variantes {due > 0 && <span className="badge" aria-label={`${due} lignes à réviser`}>{due}</span>}
          </button>
        </nav>
      </header>
      <main>
        <div hidden={tab !== 'profile'}>
          <Profile
            rep={rep}
            onGoLesson={(m) => { setLessonModule(m as Module['id']); setLearnKey((k) => k + 1); go('learn'); }}
            onGoRepertoire={() => go('repertoire')}
          />
        </div>
        {tab === 'learn' && <Learn key={learnKey} initialModule={lessonModule} />}
        {tab === 'repertoire' && <Repertoire rep={rep} />}
      </main>
      <footer className="muted small">Données publiques via les API Lichess et Chess.com · tout est stocké localement dans votre navigateur.</footer>
    </div>
  );
}
