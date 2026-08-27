#!/usr/bin/env bash
# Première installation du CRM sur le VPS.
# Génère les secrets, crée le fichier .env, construit les images et démarre.
# À ne lancer qu'une seule fois : il refuse d'écraser un .env existant.

set -euo pipefail
cd "$(dirname "$0")/.."

RESEAU="webproxy"
vert() { printf '\033[0;32m%s\033[0m\n' "$1"; }
rouge() { printf '\033[0;31m%s\033[0m\n' "$1"; }

echo "Installation du CRM EasyTech Group SA"
echo "======================================"
echo

# --- Vérifications préalables -------------------------------------------------

command -v docker >/dev/null || { rouge "Docker est introuvable."; exit 1; }
docker compose version >/dev/null 2>&1 || { rouge "Le plugin « docker compose » est introuvable."; exit 1; }

if ! docker network inspect "$RESEAU" >/dev/null 2>&1; then
  rouge "Le réseau Docker « $RESEAU » n'existe pas."
  echo "C'est celui qu'utilise Nginx Proxy Manager. Réseaux disponibles :"
  docker network ls --format '  {{.Name}}'
  echo "Corrigez le nom dans docker-compose.yml, ou créez le réseau."
  exit 1
fi

if [ -f .env ]; then
  rouge "Un fichier .env existe déjà."
  echo "L'écraser régénérerait les secrets et déconnecterait tout le monde."
  echo "Pour une simple mise à jour, utilisez plutôt : ./scripts/deployer.sh"
  exit 1
fi

command -v openssl >/dev/null || { rouge "openssl est requis pour générer les secrets."; exit 1; }

# --- Mot de passe administrateur ---------------------------------------------

echo "Choisissez le mot de passe du premier compte administrateur."
echo "Identifiant : admin (modifiable ensuite depuis l'interface)."
echo
while true; do
  read -rsp "Mot de passe (8 caractères minimum) : " MDP; echo
  read -rsp "Confirmation : " MDP2; echo
  [ "$MDP" != "$MDP2" ] && { rouge "Les deux saisies diffèrent."; continue; }
  [ ${#MDP} -lt 8 ] && { rouge "Trop court : 8 caractères minimum."; continue; }
  break
done
echo

# --- Fichier .env -------------------------------------------------------------

echo "Génération des secrets…"
cat > .env <<EOF
# Généré par scripts/installer.sh le $(date +"%F à %H:%M")
# Ne jamais versionner ce fichier.

POSTGRES_USER=crm
POSTGRES_DB=crm
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '\n/+=' | cut -c1-28)

JWT_SECRET=$(openssl rand -hex 32)

ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=

# Envoi des emails : tant que ces deux valeurs sont vides, les campagnes sont
# journalisées mais aucun email ne quitte le serveur.
RESEND_API_KEY=
MAIL_FROM=
EOF
chmod 600 .env
vert "  .env créé (lecture réservée au propriétaire)"

# --- Images -------------------------------------------------------------------

echo
echo "Construction des images (quelques minutes la première fois)…"
docker compose build

echo
echo "Chiffrement du mot de passe administrateur…"
HASH=$(docker compose run --rm --no-deps -T backend \
  node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" "$MDP" | tr -d '\r\n')

if [ -z "$HASH" ]; then rouge "Le chiffrement a échoué."; exit 1; fi
# Le hash contient des « / » et des « $ » : on passe par un fichier temporaire
# plutôt que par sed, dont les délimiteurs seraient cassés.
awk -v h="$HASH" '/^ADMIN_PASSWORD_HASH=/{print "ADMIN_PASSWORD_HASH=" h; next} {print}' .env > .env.tmp
mv .env.tmp .env
chmod 600 .env
unset MDP MDP2
vert "  mot de passe chiffré et enregistré"

# --- Démarrage ----------------------------------------------------------------

echo
echo "Démarrage des conteneurs…"
docker compose up -d

echo
echo "Attente de la disponibilité de l'API…"
for i in $(seq 1 30); do
  if docker compose exec -T backend wget -qO- http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    vert "  API opérationnelle"
    break
  fi
  [ "$i" -eq 30 ] && { rouge "L'API ne répond pas. Journaux :"; docker compose logs --tail 40 backend; exit 1; }
  sleep 2
done

echo
docker compose ps
echo
vert "Installation terminée."
cat <<'FIN'

Dernière étape, dans Nginx Proxy Manager (Proxy Hosts > Add Proxy Host) :

  Domain Names           crm.easytechgroup.net   (ou tout autre domaine pointé
                                                  sur le VPS en attendant)
  Scheme                 http
  Forward Hostname / IP  crm-web
  Forward Port           80
  Cache Assets           désactivé
  Block Common Exploits  activé

  Onglet SSL       : Request a new SSL Certificate, puis Force SSL
  Onglet Advanced  : client_max_body_size 30m;

Cette dernière ligne n'est pas facultative : sans elle vos imports de fichiers
échouent en erreur 413 avant même d'atteindre l'application.

Connectez-vous ensuite avec l'identifiant « admin » et changez le mot de passe
depuis Mon profil.
FIN
