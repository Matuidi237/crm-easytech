# CRM Clients — EasyTech Group SA

Outil interne de centralisation de la base de données clients : import CSV/Excel/JSON avec mapping de colonnes, fiche client standardisée, filtres (pays, ville, secteur, chiffre d'affaires, commercial en charge), tableau de bord avec statistiques, accès protégé par authentification. Conçu pour évoluer vers l'envoi automatisé de newsletters et d'offres.

## Stack

- Backend : Node.js + Express + Prisma + PostgreSQL (TypeScript)
- Frontend : React + Vite (TypeScript)

## Lancer en local (sans Docker)

1. Démarrer une base PostgreSQL locale (ou via Docker : `docker compose up db -d`)
2. Backend :
   ```bash
   cd backend
   cp .env.example .env   # ajuster DATABASE_URL, définir ADMIN_USERNAME / ADMIN_PASSWORD_HASH / JWT_SECRET
   npm install
   npx prisma migrate dev --name init
   npm run dev
   ```
   Pour générer le hash du mot de passe admin :
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('votre-mot-de-passe', 10))"
   ```
3. Frontend :
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
4. Ouvrir http://localhost:5173

## Lancer avec Docker (tout compris)

```bash
docker compose up --build
```

- Frontend : http://localhost:5173
- Backend : http://localhost:4000
- PostgreSQL : localhost:5432

## Déploiement VPS

Le `docker-compose.yml` est déployable tel quel sur le VPS. Pour la prod :
- Remplacer les identifiants PostgreSQL par des secrets forts.
- Mettre le frontend derrière un reverse proxy (nginx/Caddy) avec le build de production (`npm run build` + serveur statique) plutôt que `vite dev`.
- Ajouter HTTPS via Let's Encrypt.

## Roadmap

- [x] Import CSV / Excel / JSON avec mapping de colonnes
- [x] Fiche client standardisée (nom, adresse, site web, email, contact interne, commercial, secteur, CA)
- [x] Filtres (pays, ville, secteur, CA, commercial, recherche texte)
- [x] Authentification (compte admin unique, JWT)
- [x] Tableau de bord (statistiques + raccourcis)
- [ ] Envoi automatisé de newsletters et offres de services
- [ ] Édition de fiche client depuis l'interface
- [ ] Gestion des utilisateurs / rôles (commercial vs admin) — actuellement un seul compte admin
- [ ] Champs personnalisés supplémentaires (le modèle `champsPersonnalises` est déjà prévu en JSON)
