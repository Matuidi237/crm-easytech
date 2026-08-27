# Déploiement sur le VPS

Même environnement que le site `easytech-site` déjà en production : VPS Ubuntu, Docker, Nginx Proxy Manager, réseau Docker partagé **`webproxy`**, code dans `/opt`.

## En bref

```bash
# Première fois
cd /opt && git clone https://github.com/Matuidi237/crm-easytech.git crm && cd crm
./scripts/installer.sh          # secrets, images, démarrage : tout en une commande

# Mises à jour suivantes
./scripts/deployer.sh           # sauvegarde, git pull, rebuild, vérification
```

Le reste de ce document détaille ce que font ces scripts et comment intervenir à la main.

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

```bash
cd /opt
git clone https://github.com/Matuidi237/crm-easytech.git crm
cd crm
./scripts/installer.sh
```

Le script vérifie que Docker et le réseau `webproxy` sont bien là, vous demande le mot de passe du premier administrateur, puis se charge du reste :

- génération de `POSTGRES_PASSWORD` et `JWT_SECRET` avec `openssl` ;
- écriture du `.env` en permissions `600` ;
- chiffrement bcrypt du mot de passe administrateur ;
- construction des images et démarrage ;
- attente que l'API réponde, sinon affichage des journaux.

Il refuse de s'exécuter si un `.env` existe déjà : régénérer les secrets déconnecterait tout le monde et rendrait le compte administrateur inutilisable.

`JWT_SECRET` mérite un mot. Sans lui, le backend retombe sur un secret de développement présent dans le code source : n'importe qui pourrait forger un jeton d'administrateur. Le script le génère pour vous, il n'y a plus d'oubli possible.

Le compte administrateur n'est créé qu'au tout premier démarrage, si la table des utilisateurs est vide. Les suivants se créent depuis l'interface.

### Faire les choses à la main

Si vous préférez ne pas utiliser le script : `cp .env.example .env`, remplissez chaque valeur (les commandes de génération sont en commentaire dans le fichier), puis `docker compose up -d --build`.

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
./scripts/deployer.sh
```

Le script sauvegarde la base **avant** toute modification, récupère le code, affiche les commits appliqués, reconstruit, redémarre et vérifie que l'API répond. Les dix dernières sauvegardes sont conservées dans `sauvegardes/`.

Les migrations de base de données en attente s'appliquent seules au démarrage du backend.

En cas de doute sur les images :

```bash
docker compose build --no-cache && docker compose up -d
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
