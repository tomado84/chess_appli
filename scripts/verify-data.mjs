// Vérifie la légalité de tous les exercices et du répertoire de départ.
import { Chess } from 'chess.js';
import { buildSync } from 'esbuild';
import { mkdirSync } from 'node:fs';
const load = async (p) => {
  mkdirSync('node_modules/.verify', { recursive: true });
  const out = `node_modules/.verify/${p.split('/').pop()}.mjs`;
  buildSync({ entryPoints: [p], outfile: out, bundle: true, format: 'esm', platform: 'node', external: ['chess.js'] });
  return import('../' + out);
};
const { MODULES } = await load('src/lib/lessons.ts');
const { STARTER, pgnToLines } = await load('src/lib/repertoire.ts');
let ok = true;
for (const m of MODULES) for (const l of m.lessons) l.exercises.forEach((e, i) => {
  const tag = `${l.id}#${i + 1}`;
  try {
    for (const first of [e.solution[0], ...(e.alternatives ?? [])]) {
      const c = new Chess(e.fen);
      const seq = [first, ...e.solution.slice(1)];
      for (const mv of seq) c.move(mv);
      if (e.solution.at(-1).endsWith('#') && first === e.solution[0] && !c.isCheckmate()) throw new Error('pas mat');
    }
    console.log('OK  ', tag, e.solution.join(' '));
  } catch (err) { ok = false; console.log('FAIL', tag, err.message); }
});
for (const s of STARTER) {
  try { const ls = pgnToLines(s.pgn); console.log('OK  ', s.chapter, ls.length, 'lignes'); ls.forEach(l => console.log('      ', l.join(' '))); }
  catch (err) { ok = false; console.log('FAIL', s.chapter, err.message); }
}
process.exit(ok ? 0 : 1);
