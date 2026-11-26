# Chess Coach

Application web (React + TypeScript) pour apprendre, réviser ses variantes et analyser son profil Lichess / Chess.com.

## En ligne

https://tomado84.github.io/chess_appli/ (déployé automatiquement par GitHub Actions à chaque push sur `main`).

## Lancer en local

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # version statique dans dist/
npm run verify     # vérifie la légalité des exercices et du répertoire de départ
```

## Modules

- **Mon profil** : télécharge les 50 à 300 dernières parties (API publiques Lichess / Chess.com, directement depuis le navigateur), calcule un score global sur 100 et 7 compétences notées (ouvertures, tactique, conversion, défense, finales, gestion du temps, mental), puis en déduit les points forts et les axes de progression, ainsi que les statistiques par ouverture, par couleur et par cadence, l'évolution du classement et les défaites à revoir. Avec Lichess, les parties analysées par Stockfish deviennent des exercices tirés de vos propres erreurs.
- **Apprendre** : modules de leçons (mats, tactique, ouverture, finales) avec exercices interactifs.
- **Variantes** : répertoire importé en PGN (variantes entre parenthèses acceptées), répertoire de départ, ou ouvertures ajoutées depuis vos parties ; révision en répétition espacée (méthode Leitner : 1, 3, 7, 16, 35, 80 jours).

Tout est stocké en `localStorage` : pas de serveur ni de compte.

## Structure

- `src/lib/fetchGames.ts` : récupération et normalisation des parties
- `src/lib/analyze.ts` : extraction des caractéristiques (matériel, phases, pendule, éval) et scoring
- `src/lib/repertoire.ts` : parseur PGN avec variantes et répétition espacée
- `src/lib/lessons.ts` : contenu pédagogique
- `src/components/` : interface (Trainer = échiquier d'entraînement générique)
