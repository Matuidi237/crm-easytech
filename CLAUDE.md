# Repères pour travailler sur ce dépôt

Outil de gestion interne, parti d'un CRM et en train de devenir un ERP :
clients, ventes et commissions, projets, partenaires, campagnes, planning et
feuilles de temps. Un module RH est en cours. Déployé en **une instance par
client**, jamais mutualisé.

## Commandes

```bash
cd backend && npm run dev      # API sur :4000, tsx watch
cd frontend && npm run dev     # interface sur :5173, Vite
```

```bash
cd backend && npx tsc --noEmit    # vérification des types
cd frontend && npx tsc --noEmit
```

```bash
cd backend && npx prisma migrate dev --name <nom>   # développement
cd backend && npx prisma migrate deploy             # production
```

Jeu de démonstration : `npm run demo:dg`, `:etat`, `:supprimer` depuis `backend`.

Il n'y a **aucun test automatisé**. La vérification se fait par le contrôle de
types des deux côtés, puis en ouvrant la page dans le navigateur. Ne pas
annoncer qu'une page fonctionne sans l'avoir regardée.

## Structure

- `backend/src/routes/` : une route par domaine, montée dans `index.ts` avec sa
  capacité requise.
- `backend/src/lib/` : les règles qui ne doivent exister qu'à un seul endroit.
  `commissions.ts` (barème), `ventes.ts` (marge et coût inconnu),
  `permissions.ts` (matrice et périmètre), `periodes.ts`, `activites.ts`.
- `frontend/src/api.ts` : tous les appels et tous les types partagés.
- `frontend/src/vues.ts` : la navigation par rôle.
- `frontend/src/i18n/fr.ts` et `en.ts` : le français est la référence, l'anglais
  est contraint à la parité par le type.
- `frontend/src/styles.css` : feuille unique, pas de CSS par composant.

## Règles de gestion à ne pas contourner

**La commission porte sur le bénéfice, jamais sur le chiffre d'affaires**, et le
taux dépend de la nature de ce qui est vendu : 3 % sur le matériel, 5 % sur le
service. Un taux négocié sur un compte remplace le barème pour les deux natures.
Tout cela vit dans `backend/src/lib/commissions.ts` et nulle part ailleurs.

**Un coût absent n'est pas un coût nul.** Le commercial enregistre une commande
validée dans Zoho et ne connaît pas le prix d'achat ; la direction le renseigne
ensuite. Tant qu'il manque, la vente compte dans le chiffre d'affaires et dans
les objectifs, mais reste hors marge, hors classement à la rentabilité et hors
commission. Chaque agrégat distingue donc le chiffre d'affaires total de
l'assiette chiffrée, seule base honnête d'un taux de marge. Voir
`backend/src/lib/ventes.ts`.

**La référence du document Zoho est unique sur tout le système.** C'est par elle
qu'une synchronisation automatique reconnaîtra un jour ce qui est déjà en base
au lieu de le recréer et de doubler le chiffre d'affaires.

**Les activités des feuilles de temps sont du texte libre**, pas une
énumération. Les libellés déjà employés sont reproposés à la saisie, ce qui
regroupe les statistiques sans rien interdire. Même principe pour les postes et
les services côté RH.

**Les colonnes `@db.Date` tronquent sur UTC.** Y écrire un minuit local décale
la date d'un jour à Douala. Toujours passer par `jourCalendaire()`, à l'écriture
comme à la lecture.

## Conventions

**Les commentaires disent pourquoi, pas quoi.** Le code dit déjà ce qu'il fait.
Un commentaire utile explique une décision, un piège évité, une alternative
écartée. En français, comme le reste.

**Toute chaîne visible passe par l'i18n**, dans les deux fichiers. Les nombres,
montants, dates et rangs passent par les fonctions de `useLangue()` : un taux
de 6,5 écrit en interpolation directe s'affiche « 6.5 % » en français.

**Jamais de tiret cadratin dans les textes livrés**, ni dans l'interface, ni
dans les messages de commit, ni dans les réponses.

**Les commandes données à l'utilisateur sont en syntaxe PowerShell**, pas bash.

**Attention aux collisions de classes CSS.** La feuille est unique et longue.
Vérifier qu'un nom n'existe pas déjà avant de l'ajouter ; l'erreur a été commise
trois fois, et une règle ajoutée pour une page en a cassé une autre.

**Langage visuel des pages d'analyse** : un panneau, exactement un chiffre héros
par vue, des tuiles sans glose sous l'intitulé, des tableaux classés où la part
est peinte en fond de ligne. Classes `panneau`, `heros-*`, `mesure-*`,
`tuiles`, `rangs`, `segmente`. Pas de sous-titre explicatif sous un titre qui se
suffit à lui-même.

**Git** : commit et push sans demander. Messages en français, sans tiret
cadratin, expliquant la raison du changement.

## Sécurité et accès

Les capacités sont déclarées dans `backend/src/lib/permissions.ts` et la matrice
par rôle vit **en base**, modifiable par l'interface. Le périmètre de données
(qui voit quelle ligne) est une fonction à part, `perimetreClients`.

Une capacité se crée dès qu'une donnée a une sensibilité propre. Exemples en
place : `clients.coordonnees` pour les adresses et téléphones, `ventes.cout`
pour le prix d'achat, que le commercial ne doit pas voir puisqu'il en déduirait
sa propre commission.

Faille connue, non corrigée : `requireAuth` ne vérifie que la signature du
jeton. Un compte supprimé ou désactivé garde l'accès jusqu'à expiration, douze
heures.

## Chantiers ouverts

- Module RH commencé au niveau du schéma seulement, non migré.
- La nouvelle page Ventes et l'écran « À chiffrer » compilent mais n'ont pas
  encore été ouverts dans un navigateur.
- Registre de modules activables, utile à la fois pour la RH et pour la revente.
- Paramètres par instance (marque, devise, barème) encore en constantes de code.
- Le paquet JavaScript dépasse 500 ko et demandera un découpage.
- `/newsletters` et `/campagnes` se recouvrent, un arbitrage reste à faire.

Pour installer l'outil chez une autre entreprise, voir `docs/NOUVELLE-INSTANCE.md`.
