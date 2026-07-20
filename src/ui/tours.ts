import type { TourStep } from './tour'

/**
 * Visites guidées, par id de niveau. Les gates non-'next' sont des
 * CustomEvents émis par main.ts : ds:camera-moved, ds:action-played,
 * ds:cti-shown, ds:brick-proved.
 */
export const tours: Record<string, readonly TourStep[]> = {
  't1-fusible': [
    {
      target: null,
      html: '<b>Demonic Scheduler.</b> Vous allez d’abord casser des systèmes en jouant l’ordonnanceur malveillant, puis prouver que les versions corrigées tiennent. Petit tour de l’écran.',
      gate: 'next',
    },
    {
      target: '.levels',
      html: 'Ceci est la <b>campagne</b> : les niveaux se débloquent dans l’ordre. Votre progression est sauvegardée.',
      gate: 'next',
    },
    {
      target: '.spec',
      html: 'Ceci est la <b>spec</b> du système, dans un TLA+ simplifié : des <b>VARIABLES</b> typées, des <b>ACTIONS</b> gardées (« garde → effet » : jouable quand la garde est vraie), et l’<b>INVARIANT</b>, la propriété censée toujours tenir.',
      gate: 'next',
    },
    {
      target: '#app canvas',
      html: 'Ceci est le <b>graphe d’états</b> : chaque bille est un état complet du système (son étiquette = les variables), chaque trait une action qui mène de l’un à l’autre. <b>Faites-le pivoter à la souris</b> pour continuer.',
      gate: 'ds:camera-moved',
    },
    {
      target: '.editor-mount',
      html: 'Ceci est votre <b>console</b> : tout se joue au clavier. Ici, on ordonnance : <b>tapez <code>load</code> puis Entrée</b> pour jouer un pas (l’autocomplétion connaît les actions jouables).',
      gate: 'ds:action-played',
    },
    {
      target: '.moves',
      html: 'Le compteur de <b>coups</b> face au <b>par</b> : la longueur de la trace violante optimale. Égalez-le pour le score parfait.',
      gate: 'next',
    },
    {
      target: null,
      html: 'À vous : amenez le système dans un état qui viole l’INVARIANT.',
      gate: 'next',
    },
  ],

  'p1-fusible-sur': [
    {
      target: null,
      html: 'Nouveau rôle : fini de casser — vous <b>prouvez</b>. Objectif : établir que l’INVARIANT tient dans <i>tous</i> les états atteignables, par <b>induction</b>.',
      gate: 'next',
    },
    {
      target: '#app canvas',
      html: 'Le graphe montre maintenant l’espace d’états <b>COMPLET</b> — y compris les <b>états fantômes</b> (assombris) que le système n’atteint jamais. L’induction doit les dompter aussi : c’est là que les preuves échouent.',
      gate: 'next',
    },
    {
      target: '.bricks',
      html: 'Ceci est votre <b>mur de briques</b> : chaque formule prouvée devient une brique, réutilisable comme hypothèse pour prouver les suivantes. L’arbre de vos briques EST votre preuve.',
      gate: 'next',
    },
    {
      target: '.editor-mount',
      html: 'Proposez une formule candidate — sa <b>région</b> (les états qui la satisfont) s’éclaire en direct. <b>Tapez <code>charge <= 1</code></b> (sans Entrée) et regardez le graphe.',
      gate: 'ds:cti-shown',
    },
    {
      target: '#app canvas',
      html: 'Les arêtes <b>rouges</b> sont des <b>contre-exemples à l’induction</b> (CTI) : depuis un état de votre région, une action s’en échappe — ici <code>load</code> depuis charge = 1. Cette candidate n’est pas inductive.',
      gate: 'next',
    },
    {
      target: '.editor-mount',
      html: 'Élargissez : <b>tapez <code>charge <= 2</code> puis Entrée</b>. Plus aucune fuite : l’init est dedans, chaque action reste dedans — la formule est prouvée et devient une brique.',
      gate: 'ds:brick-proved',
    },
    {
      target: '.goal-status',
      html: 'La ligne d’<b>objectif</b> vérifie si vos briques impliquent l’INVARIANT. C’est le cas : niveau prouvé. Dès le prochain, l’invariant ne sera <b>pas</b> inductif tel quel — il faudra des briques intermédiaires.',
      gate: 'next',
    },
  ],
}
