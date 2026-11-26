import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { buildReport, speedLabel, type Report } from '../lib/analyze';
import { fetchChessCom, fetchLichess } from '../lib/fetchGames';
import { addLines } from '../lib/repertoire';
import type { Color, Game, Source } from '../lib/types';
import { RatingChart, ScoreBar, ScoreRing, WdlBar } from './Charts';
import { Trainer } from './Trainer';
import { formatLine, type useRepertoire } from './Repertoire';

const PREF = 'chesscoach.profile.v1';
function loadPref(): { source: Source; username: string; max: number } {
  try { return { source: 'lichess', username: '', max: 100, ...JSON.parse(localStorage.getItem(PREF) ?? '{}') }; }
  catch { return { source: 'lichess', username: '', max: 100 }; }
}

/** Ligne la plus fréquemment jouée dans une famille d'ouverture (jusqu'à `plies` demi-coups). */
function mostCommonLine(games: Game[], plies = 12): string[] {
  let prefix: string[] = [];
  let pool = games;
  for (let i = 0; i < plies; i++) {
    const counts = new Map<string, Game[]>();
    for (const g of pool) if (g.moves[i]) counts.set(g.moves[i], [...(counts.get(g.moves[i]) ?? []), g]);
    const best = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (!best || best[1].length < 2) break;
    prefix = [...prefix, best[0]];
    pool = best[1];
  }
  return prefix;
}

function uciToSan(fen: string, uci: string): string | null {
  try {
    const c = new Chess(fen);
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }).san;
  } catch { return null; }
}

export function Profile({ rep, onGoLesson, onGoRepertoire }: {
  rep: ReturnType<typeof useRepertoire>;
  onGoLesson: (m: string) => void;
  onGoRepertoire: () => void;
}) {
  const pref = loadPref();
  const [source, setSource] = useState<Source>(pref.source);
  const [username, setUsername] = useState(pref.username);
  const [max, setMax] = useState(pref.max);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [colorFilter, setColorFilter] = useState<Color | 'all'>('all');
  const [puzzle, setPuzzle] = useState(0);
  const [puzzleDone, setPuzzleDone] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const u = username.trim();
    if (!u) return;
    setError(null); setReport(null); setPuzzle(0);
    try { localStorage.setItem(PREF, JSON.stringify({ source, username: u, max })); } catch { /* ignore */ }
    try {
      const games = source === 'lichess' ? await fetchLichess(u, max, setLoading) : await fetchChessCom(u, max, setLoading);
      if (!games.length) throw new Error('Aucune partie standard trouvée pour ce joueur.');
      setLoading('Analyse des parties…');
      await new Promise((r) => setTimeout(r, 20));
      setReport(buildReport(u, games));
    } catch (err) {
      setError((err as Error).message === 'Failed to fetch'
        ? 'Impossible de joindre le serveur (connexion, bloqueur de publicité ou limite de requêtes).'
        : (err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  const mainSpeed = report?.bySpeed.slice().sort((a, b) => b.stats.n - a.stats.n)[0]?.speed;
  const ratingPoints = useMemo(
    () => report?.ratingHistory.filter((p) => p.speed === mainSpeed) ?? [],
    [report, mainSpeed],
  );

  const puzzles = useMemo(() => (report?.mistakes ?? [])
    .map((m) => ({ ...m, san: uciToSan(m.fenBefore!, m.bestUci!) }))
    .filter((m) => m.san)
    .slice(0, 30), [report]);

  const addOpening = (name: string, color: Color) => {
    if (!report) return;
    const gs = report.games.filter((g) => g.openingFamily === name && g.color === color);
    const line = mostCommonLine(gs);
    if (line.length < 2) return;
    const { all } = addLines(rep.lines, `${name} (${color === 'white' ? 'Blancs' : 'Noirs'}) — mes parties`, color, [line]);
    rep.setLines(all);
    setAdded({ ...added, [`${color}|${name}`]: true });
  };

  return (
    <section>
      <h2>Analyse de profil</h2>
      <form className="card form" onSubmit={run}>
        <div className="row wrap">
          <div className="seg" role="radiogroup" aria-label="Plateforme">
            {(['lichess', 'chesscom'] as Source[]).map((s) => (
              <button type="button" key={s} role="radio" aria-checked={source === s} className={source === s ? 'active' : ''} onClick={() => setSource(s)}>
                {s === 'lichess' ? 'Lichess' : 'Chess.com'}
              </button>
            ))}
          </div>
          <input aria-label="Nom d'utilisateur" placeholder="Nom d'utilisateur" value={username} onChange={(e) => setUsername(e.target.value)} />
          <select aria-label="Nombre de parties" value={max} onChange={(e) => setMax(+e.target.value)}>
            {[50, 100, 200, 300].map((n) => <option key={n} value={n}>{n} dernières parties</option>)}
          </select>
          <button className="btn" disabled={!!loading || !username.trim()}>{loading ? 'Analyse…' : 'Analyser'}</button>
        </div>
        {source === 'lichess' && <small className="muted">Astuce : les parties analysées par Stockfish sur Lichess donnent un diagnostic plus précis (gaffes, précision) et génèrent des exercices tirés de vos erreurs.</small>}
        {source === 'chesscom' && <small className="muted">Chess.com fournit la précision quand une partie a été revue ; le reste est calculé à partir des coups.</small>}
        {loading && <p className="loading">⏳ {loading}</p>}
        {error && <p className="err">✗ {error}</p>}
      </form>

      {report && (
        <>
          <div className="grid hero">
            <div className="card center">
              <ScoreRing score={report.globalScore} />
              <h3>{report.username}</h3>
              <p className="muted">{report.level} · {report.games.length} parties analysées</p>
              {report.performance && <p>Performance estimée : <strong>{report.performance}</strong></p>}
              {report.avgAccuracy !== undefined && <p>Précision moyenne : <strong>{report.avgAccuracy.toFixed(1)} %</strong></p>}
            </div>
            <div className="card">
              <h3>Résultats</h3>
              <WdlBar s={report.overall} label="Global" />
              <WdlBar s={report.byColor.white} label="Avec les Blancs" />
              <WdlBar s={report.byColor.black} label="Avec les Noirs" />
              <div className="speeds">
                {report.bySpeed.map((s) => (
                  <div key={s.speed} className="speed">
                    <small className="muted">{speedLabel(s.speed)}</small>
                    <strong>{s.rating ?? '—'}</strong>
                    <small>{s.stats.n} parties · {Math.round(s.stats.score * 100)} %</small>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid two">
            <div className="card">
              <h3>Points forts</h3>
              {report.strengths.length ? (
                <ul className="insights">{report.strengths.map((s, i) => <li key={i} className={s.tone}><span aria-hidden>▲</span> {s.text}</li>)}</ul>
              ) : <p className="muted">Pas de point fort marqué sur cet échantillon.</p>}
            </div>
            <div className="card">
              <h3>Axes de progression</h3>
              {report.weaknesses.length ? (
                <ul className="insights">{report.weaknesses.map((s, i) => (
                  <li key={i} className={s.tone}>
                    <span aria-hidden>▼</span> {s.text}
                    {s.lesson && (
                      <button className="link" onClick={() => (s.lesson === 'repertoire' ? onGoRepertoire() : onGoLesson(s.lesson!))}>
                        {s.lesson === 'repertoire' ? '→ Travailler le répertoire' : '→ Leçon associée'}
                      </button>
                    )}
                  </li>
                ))}</ul>
              ) : <p className="muted">Aucune faiblesse nette détectée. Bravo !</p>}
            </div>
          </div>

          <div className="card">
            <h3>Scoring par compétence</h3>
            <p className="muted small">Notes sur 100 (50 = niveau attendu pour votre classement). « Indicatif » = moins de 6 situations observées.</p>
            <div className="grid two">
              {report.dimensions.map((d) => <ScoreBar key={d.key} label={d.label} score={d.score} detail={d.detail} reliable={d.reliable} />)}
            </div>
          </div>

          <div className="grid two">
            <div className="card">
              <h3>Évolution du classement {mainSpeed && `(${speedLabel(mainSpeed)})`}</h3>
              <RatingChart points={ratingPoints} />
            </div>
            <div className="card">
              <h3>Où se jouent vos défaites ?</h3>
              <p className="muted small">Moment où vous perdez du matériel pour la première fois (ou fin de partie).</p>
              <table className="table">
                <thead><tr><th>Phase</th><th className="num">Défaites</th><th className="num">Part</th></tr></thead>
                <tbody>
                  {([['opening', 'Ouverture (coups 1-12)'], ['middlegame', 'Milieu de jeu'], ['endgame', 'Finale']] as const).map(([k, label]) => (
                    <tr key={k}><td>{label}</td><td className="num">{report.phaseOfLoss[k]}</td>
                      <td className="num">{Math.round((report.phaseOfLoss[k] / Math.max(1, report.overall.l)) * 100)} %</td></tr>
                  ))}
                </tbody>
              </table>
              <h4>Comment se terminent vos parties</h4>
              <table className="table">
                <thead><tr><th>Fin</th><th className="num">Victoires</th><th className="num">Défaites</th></tr></thead>
                <tbody>{report.terminations.map((t) => <tr key={t.label}><td>{t.label}</td><td className="num">{t.win}</td><td className="num">{t.loss}</td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="row space">
              <h3>Vos ouvertures</h3>
              <div className="seg small" role="radiogroup" aria-label="Filtrer par couleur">
                {([['all', 'Toutes'], ['white', 'Blancs'], ['black', 'Noirs']] as const).map(([k, l]) => (
                  <button key={k} role="radio" aria-checked={colorFilter === k} className={colorFilter === k ? 'active' : ''} onClick={() => setColorFilter(k)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead><tr><th>Ouverture</th><th>Couleur</th><th className="num">Parties</th><th className="num">V / N / D</th><th className="num">Score</th><th /></tr></thead>
                <tbody>
                  {report.openings.filter((o) => colorFilter === 'all' || o.color === colorFilter).slice(0, 20).map((o) => {
                    const k = `${o.color}|${o.name}`;
                    const tone = o.n >= 4 ? (o.score >= 0.58 ? 'good' : o.score <= 0.42 ? 'bad' : '') : '';
                    return (
                      <tr key={k}>
                        <td>{o.name}</td>
                        <td>{o.color === 'white' ? 'Blancs' : 'Noirs'}</td>
                        <td className="num">{o.n}</td>
                        <td className="num">{o.w} / {o.d} / {o.l}</td>
                        <td className={`num ${tone}`}>{tone === 'good' ? '▲ ' : tone === 'bad' ? '▼ ' : ''}{Math.round(o.score * 100)} %</td>
                        <td>{o.n >= 3 && (added[k]
                          ? <span className="ok small">✓ Ajoutée</span>
                          : <button className="link" onClick={() => addOpening(o.name, o.color)}>+ Répertoire</button>)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <small className="muted">« + Répertoire » ajoute la ligne que vous jouez le plus souvent dans cette ouverture, pour la réviser en répétition espacée.</small>
          </div>

          {puzzles.length > 0 && (
            <div className="card">
              <h3>Exercices tirés de vos erreurs ({puzzles.length})</h3>
              {(() => {
                const p = puzzles[puzzle % puzzles.length];
                return (
                  <div className="lesson">
                    <div className="lesson-text">
                      <p><span className={`pill ${p.kind}`}>{p.kind === 'blunder' ? 'Gaffe' : 'Erreur'}</span> contre {p.game.opponent}, coup {Math.floor(p.ply / 2) + 1}</p>
                      <p>Dans cette partie vous avez joué <strong>{p.played}</strong>. Trouvez le meilleur coup selon Stockfish.</p>
                      <a href={p.game.url} target="_blank" rel="noreferrer">Voir la partie ↗</a>
                      {puzzleDone && <p className="explain">Le meilleur coup était <strong>{p.san}</strong>.</p>}
                      <div className="row">
                        <button className="btn ghost" onClick={() => { setPuzzle(puzzle + 1); setPuzzleDone(false); }}>Exercice suivant →</button>
                      </div>
                    </div>
                    <Trainer startFen={p.fenBefore} moves={[p.san!]} playerColor={p.game.color} onComplete={() => setPuzzleDone(true)} />
                  </div>
                );
              })()}
            </div>
          )}
          {!report.hasEngineData && (
            <div className="card muted">
              Aucune analyse moteur trouvée dans ces parties : les scores de tactique et d'ouverture sont estimés à partir des échanges de matériel.
              {report.source === 'lichess' && ' Demandez une analyse par ordinateur sur quelques parties Lichess pour obtenir des exercices personnalisés.'}
            </div>
          )}

          <div className="card">
            <h3>Défaites à revoir en priorité</h3>
            <ul className="games">
              {report.worstGames.map((g) => (
                <li key={g.id}>
                  <a href={g.url} target="_blank" rel="noreferrer">vs {g.opponent} ({g.oppRating ?? '?'})</a>
                  <span className="muted small"> · {g.opening} · {Math.ceil(g.moves.length / 2)} coups · {new Date(g.date).toLocaleDateString('fr-FR')}</span>
                  <div className="mono small muted">{formatLine(g.moves, 10)}…</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
