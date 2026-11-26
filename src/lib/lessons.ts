export interface Exercise {
  fen: string;
  prompt: string;
  /** Coups SAN : alternance joueur / réponse adverse (jouée automatiquement). */
  solution: string[];
  /** Autres premiers coups acceptés. */
  alternatives?: string[];
  /** Tout coup qui donne mat est accepté. */
  acceptAnyMate?: boolean;
  explanation: string;
}

export interface Lesson {
  id: string;
  title: string;
  theory: string[];
  exercises: Exercise[];
}

export interface Module {
  id: 'mates' | 'tactics' | 'openings' | 'endgames';
  title: string;
  description: string;
  lessons: Lesson[];
}

export const MODULES: Module[] = [
  {
    id: 'mates',
    title: 'Mats essentiels',
    description: 'Reconnaître les schémas de mat qui reviennent sans cesse.',
    lessons: [
      {
        id: 'back-rank',
        title: 'Le mat du couloir',
        theory: [
          'Quand le roi est enfermé derrière ses propres pions, une tour ou une dame sur la dernière rangée peut donner mat.',
          'Prévention : créez une « case de fuite » (h3/h6 ou g3/g6) au bon moment, ou gardez une pièce qui protège la dernière rangée.',
        ],
        exercises: [
          {
            fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
            prompt: 'Les Blancs jouent et matent en 1.',
            solution: ['Rd8#'],
            explanation: 'Les pions f7, g7, h7 empêchent le roi noir de s\'échapper : Td8 est mat.',
          },
          {
            fen: '1k6/ppp5/8/8/8/8/5PPP/4R1K1 w - - 0 1',
            prompt: 'Même motif, de l\'autre côté de l\'échiquier : matez en 1.',
            solution: ['Re8#'],
            explanation: 'Le roi b8 est prisonnier de ses pions a7, b7, c7 : Te8 est mat.',
          },
        ],
      },
      {
        id: 'two-rooks',
        title: 'Le mat de l\'escalier',
        theory: [
          'Deux tours (ou tour + dame) se relaient : l\'une coupe une rangée, l\'autre donne échec sur la rangée suivante.',
          'Gardez vos tours éloignées du roi adverse pour qu\'il ne puisse pas les attaquer.',
        ],
        exercises: [
          {
            fen: '7k/8/8/8/8/8/R7/1R4K1 w - - 0 1',
            prompt: 'Les Blancs matent en 2.',
            solution: ['Ra7', 'Kg8', 'Rb8#'],
            acceptAnyMate: true,
            explanation: 'Ta7 coupe la 7e rangée, le roi est obligé d\'aller en g8 et Tb8 donne mat.',
          },
        ],
      },
      {
        id: 'f7',
        title: 'Le point faible f7 (f2)',
        theory: [
          'En début de partie, f7 n\'est défendu que par le roi. Fou en c4 + dame en h5/f3 visent ce point.',
          'Avec les Noirs, ...Cf6 contre Dh5 n\'est possible que si e5 est protégé et que la dame ne prend pas en f7 avec mat.',
        ],
        exercises: [
          {
            fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
            prompt: 'Les Noirs viennent de jouer 3...Cf6?? Punissez.',
            solution: ['Qxf7#'],
            explanation: 'C\'est le « coup du berger » : Dxf7 est mat, la dame étant protégée par le fou c4.',
          },
        ],
      },
    ],
  },
  {
    id: 'tactics',
    title: 'Motifs tactiques',
    description: 'Fourchettes, enfilades, attaques à la découverte : gagner du matériel.',
    lessons: [
      {
        id: 'fork',
        title: 'La fourchette',
        theory: [
          'Une pièce attaque deux cibles à la fois. Le cavalier est le roi des fourchettes car ses attaques ne peuvent pas être interposées.',
          'Réflexe : repérez les pièces non protégées et le roi, puis cherchez une case qui les touche toutes les deux.',
        ],
        exercises: [
          {
            fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
            prompt: 'Les Blancs jouent et gagnent la tour.',
            solution: ['Nc7+', 'Kd7', 'Nxa8'],
            explanation: 'Cc7+ attaque à la fois le roi e8 et la tour a8 : après le déplacement du roi, la tour tombe.',
          },
          {
            fen: 'r5k1/8/8/8/8/8/8/3QK3 w - - 0 1',
            prompt: 'La dame peut aussi fourchetter : gagnez la tour.',
            solution: ['Qd5+', 'Kh8', 'Qxa8+'],
            explanation: 'Dd5+ attaque le roi g8 par la diagonale et la tour a8 par l\'autre diagonale.',
          },
        ],
      },
      {
        id: 'skewer',
        title: 'L\'enfilade',
        theory: [
          'Inverse du clouage : on attaque une pièce de grande valeur (souvent le roi) qui doit s\'écarter et découvrir une pièce derrière elle.',
        ],
        exercises: [
          {
            fen: '7q/8/8/4k3/8/8/1K6/4B3 w - - 0 1',
            prompt: 'Les Blancs gagnent la dame.',
            solution: ['Bc3+', 'Ke6', 'Bxh8'],
            explanation: 'Fc3+ : le roi doit quitter la grande diagonale et la dame h8 est capturée.',
          },
        ],
      },
      {
        id: 'discovered',
        title: 'L\'attaque à la découverte',
        theory: [
          'Une pièce se déplace et démasque l\'attaque d\'une autre. Si la pièce qui bouge donne échec, l\'adversaire n\'a pas le temps de sauver sa pièce.',
        ],
        exercises: [
          {
            fen: '8/4q3/8/1k6/8/8/4N3/4R1K1 w - - 0 1',
            prompt: 'Les Blancs gagnent la dame.',
            solution: ['Nd4+', 'Kb6', 'Rxe7'],
            alternatives: ['Nc3+'],
            explanation: 'Le cavalier donne échec ET libère la colonne e : la tour e1 prend la dame.',
          },
        ],
      },
    ],
  },
  {
    id: 'openings',
    title: 'Principes d\'ouverture',
    description: 'Développement, centre, roque : les règles qui évitent de perdre vite.',
    lessons: [
      {
        id: 'principles',
        title: 'Les trois règles d\'or',
        theory: [
          '1. Occupez ou contrôlez le centre (e4, d4, e5, d5).',
          '2. Développez les pièces mineures vers le centre avant de sortir la dame.',
          '3. Roquez tôt pour mettre le roi en sécurité et connecter les tours.',
          'Gestion du temps : en ouverture, jouez vite les coups connus (votre répertoire !) pour garder du temps pour le milieu de jeu.',
        ],
        exercises: [
          {
            fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
            prompt: 'Après 1.e4 e5 2.Cf3 Cc6, jouez un bon coup de développement.',
            solution: ['Bc4'],
            alternatives: ['Bb5', 'Nc3', 'd4'],
            explanation: 'Fc4 (Italienne), Fb5 (Espagnole), Cc3 ou d4 (Écossaise) : tous développent ou prennent le centre.',
          },
          {
            fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3',
            prompt: 'Les Noirs attaquent e4 ? Non : e4 est défendu. Développez une pièce vers le centre.',
            solution: ['Nf3'],
            alternatives: ['Bc4', 'f4', 'g3'],
            explanation: 'Cf3 développe en attaquant e5. Évitez les coups de dame prématurés comme Dh5.',
          },
        ],
      },
    ],
  },
  {
    id: 'endgames',
    title: 'Finales essentielles',
    description: 'Opposition, roi actif, promotion : convertir son avantage.',
    lessons: [
      {
        id: 'opposition',
        title: 'L\'opposition',
        theory: [
          'Deux rois face à face avec une case entre eux : celui qui n\'a PAS le trait « a l\'opposition ».',
          'Dans une finale roi + pion, un coup de pion d\'attente peut transmettre le trait à l\'adversaire et gagner l\'opposition.',
          'Règle : roi devant son pion, de préférence sur la 6e rangée.',
        ],
        exercises: [
          {
            fen: '8/8/3k4/8/3K4/8/3P4/8 w - - 0 1',
            prompt: 'Les Blancs jouent et gagnent : récupérez l\'opposition.',
            solution: ['d3', 'Ke6', 'Kc5'],
            explanation: 'd3 ! est un coup d\'attente : c\'est maintenant aux Noirs de céder le passage. Après ...Re6, Rc5 déborde et le roi blanc avance.',
          },
        ],
      },
      {
        id: 'kq-mate',
        title: 'Mat roi + dame',
        theory: [
          'La dame réduit la zone du roi adverse en restant à un saut de cavalier de lui. Attention au pat !',
          'Quand le roi est sur le bord, amenez votre roi puis donnez mat.',
        ],
        exercises: [
          {
            fen: 'k7/8/1K6/8/8/8/8/7Q w - - 0 1',
            prompt: 'Les Blancs matent en 1.',
            solution: ['Qh8#'],
            acceptAnyMate: true,
            explanation: 'Dh8 contrôle toute la 8e rangée, le roi b6 couvre a7 et b7. Da1+ ne suffirait pas : le roi fuirait en b8.',
          },
          {
            fen: '7k/8/6K1/8/8/8/8/1Q6 w - - 0 1',
            prompt: 'Les Blancs matent en 1 (sans pater !).',
            solution: ['Qb8#'],
            acceptAnyMate: true,
            explanation: 'Db8 (ou Dh7, protégée par le roi) est mat. Avant chaque coup de dame qui ne donne pas échec, vérifiez que le roi adverse garde un coup : sinon c\'est pat !',
          },
        ],
      },
    ],
  },
];
