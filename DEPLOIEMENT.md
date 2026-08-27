# Déploiement sur le VPS

Cible : VPS avec Docker et **Nginx Proxy Manager** déjà installés.

## Ce qui tourne

Trois conteneurs, **aucun port publié sur l'hôte** :

| Conteneur | Rôle | Joignable depuis |
|---|---|---|
| `crm-db` | PostgreSQL 16, volume `crm_pgdata` | réseau interne uniquement |
| `crm-backend` | API Node/Express, applique les migrations au démarrage | réseau interne uniquement |
| `crm-web` | nginx : sert l'application et relaie `/api` vers le backend | réseau du proxy |

Nginx Proxy Manager entre par `crm-web`. Comme l'application et l'API partagent la même origine, il n'y a ni CORS à configurer, ni adresse de serveur à figer dans le build.

---

## 1. Première installation

### Récupérer le code

```bash
cd /opt
git clone <url-de-votre-depot> crm
cd crm
```

### Trouver le réseau de Nginx Proxy Manager

```bash
docker network ls
```

Repérez le réseau du conteneur NPM, souvent `npm_default` ou `proxy`. En cas de doute :

```bash
docker inspect <nom-du-conteneur-npm> -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'
```

### Préparer le fichier de configuration

```bash
cp .env.example .env
```

Générez les deux secrets :

```bash
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -hex 32      # JWT_SECRET
```

`JWT_SECRET` n'est pas optionnel. Sans lui, le backend utilise un secret de développement connu publiquement, et n'importe qui pourrait fabriquer un jeton d'administrateur.

Renseignez aussi `RESEAU_PROXY` avec le nom trouvé plus haut.

### Créer le mot de passe du premier administrateur

Construisez d'abord les images, puis générez le hash :

```bash
docker compose build

docker compose run --rm --no-deps backend \
  node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'VotreMotDePasse'
```

Copiez la chaîne obtenue dans `ADMIN_PASSWORD_HASH`. Ce compte n'est créé qu'au tout premier démarrage, si la table des utilisateurs est vide ; les suivants se créent depuis l'interface.

### Démarrer

```bash
docker compose up -d
docker compose logs -f backend
```

Vous devez lire `Premier compte administrateur créé depuis .env : admin` puis `CRM backend démarré sur http://localhost:4000`.

---

## 2. Configurer Nginx Proxy Manager

Dans l'interface, **Proxy Hosts → Add Proxy Host**.

Onglet **Details** :

| Champ | Valeur |
|---|---|
| Domain Names | `crm.votre-domaine.com` |
| Scheme | `http` |
| Forward Hostname / IP | `crm-web` |
| Forward Port | `80` |
| Cache Assets | **désactivé** (nginx gère déjà le cache, et cela éviterait de servir un `index.html` périmé après mise à jour) |
| Block Common Exploits | activé |
| Websockets Support | inutile ici |

Onglet **SSL** : *Request a new SSL Certificate*, puis *Force SSL* et *HTTP/2 Support*.

Onglet **Advanced**, à ne pas oublier :

```nginx
client_max_body_size 30m;
```

Sans cette ligne, l'import d'un fichier volumineux échouerait avec une erreur `413` avant même d'atteindre l'application. La limite interne est de 25 Mo.

---

## 3. Vérifier

```bash
docker compose ps                 # les trois conteneurs en « running », db en « healthy »
curl -I https://crm.votre-domaine.com
```

Puis dans un navigateur : la page de connexion doit s'afficher, et la connexion avec `ADMIN_USERNAME` fonctionner. Changez le mot de passe depuis **Mon profil** dès la première connexion.

Un test utile de bout en bout : importer un petit CSV et vérifier qu'il apparaît dans la liste des fichiers importés.

---

## 4. Mettre à jour

```bash
cd /opt/crm
git pull
docker compose up -d --build
```

Les migrations de base de données en attente s'appliquent automatiquement au démarrage du backend. Rien d'autre à lancer.

Pour repartir proprement en cas de doute sur les images :

```bash
docker compose build --no-cache
docker compose up -d
```

---

## 5. Sauvegardes

Les données vivent dans le volume `crm_pgdata`. Sauvegarde :

```bash
docker compose exec -T db pg_dump -U crm crm | gzip > crm-$(date +%F).sql.gz
```

Restauration :

```bash
gunzip -c crm-2026-08-27.sql.gz | docker compose exec -T db psql -U crm -d crm
```

À automatiser avec une tâche cron quotidienne, en conservant les copies hors du VPS.

---

## 6. Activer l'envoi réel des emails

Tant que `RESEND_API_KEY` et `MAIL_FROM` sont vides, les campagnes sont enregistrées en base mais **aucun email ne quitte le serveur**. L'interface l'indique après chaque envoi.

Pour activer :

1. Créer un compte Resend et y vérifier votre domaine (enregistrements DNS SPF et DKIM).
2. Renseigner `RESEND_API_KEY` et `MAIL_FROM` (par exemple `newsletter@easytechgroup.com`) dans `.env`.
3. `docker compose up -d backend`

Testez d'abord sur une campagne ciblant un secteur ne contenant qu'un ou deux clients.

---

## 7. Points de vigilance

**L'envoi de newsletter est synchrone.** Les destinataires sont traités un par un dans la requête HTTP. Sur 1 000 fiches, l'appel peut durer plusieurs minutes. Les délais nginx sont réglés à 600 s en conséquence, mais si vos volumes augmentent il faudra passer l'envoi en tâche de fond.

**PostgreSQL n'est pas exposé.** C'est voulu. Pour y accéder ponctuellement :

```bash
docker compose exec db psql -U crm -d crm
```

**Le fichier `.env` n'est pas versionné.** Il vit uniquement sur le VPS. Gardez une copie des secrets dans votre gestionnaire de mots de passe : les perdre signifie déconnecter tout le monde et régénérer le compte administrateur.

**Le dossier `test-data/` est exclu du dépôt.** Il contient des milliers d'adresses email de vos clients, qui n'ont pas à se retrouver sur GitHub. Transférez ces fichiers séparément si besoin, ou importez-les depuis votre poste via l'interface.
