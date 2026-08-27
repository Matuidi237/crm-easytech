#!/usr/bin/env bash
# Mise à jour du CRM en production : récupère le code, reconstruit, redémarre.
# Les migrations de base de données s'appliquent seules au démarrage du backend.

set -euo pipefail
cd "$(dirname "$0")/.."

vert() { printf '\033[0;32m%s\033[0m\n' "$1"; }
rouge() { printf '\033[0;31m%s\033[0m\n' "$1"; }

[ -f .env ] || { rouge "Aucun fichier .env : lancez d'abord ./scripts/installer.sh"; exit 1; }

# Le hash bcrypt contient des « $ ». Non protégé par des guillemets simples,
# Docker Compose l'interprète comme des variables et transmet un hash tronqué.
# Cette normalisation est sans effet si le fichier est déjà correct.
if grep -q '^ADMIN_PASSWORD_HASH=' .env; then
  awk '/^ADMIN_PASSWORD_HASH=/{
         v = substr($0, 21); gsub(/^\x27|\x27$/, "", v);
         print "ADMIN_PASSWORD_HASH=\x27" v "\x27"; next
       } {print}' .env > .env.tmp && mv .env.tmp .env && chmod 600 .env
fi

echo "Sauvegarde de la base avant mise à jour…"
mkdir -p sauvegardes
FICHIER="sauvegardes/crm-$(date +%F-%H%M).sql.gz"
# On ne source jamais le .env : le hash bcrypt contient des « $ » que bash
# interpréterait comme des paramètres. Les identifiants sont lus directement
# dans le conteneur, où ils sont déjà définis (guillemets simples volontaires).
if docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' 2>/dev/null | gzip > "$FICHIER"; then
  vert "  $FICHIER ($(du -h "$FICHIER" | cut -f1))"
else
  rm -f "$FICHIER"
  echo "  base non démarrée, sauvegarde ignorée"
fi

echo
echo "Récupération du code…"
AVANT=$(git rev-parse --short HEAD)
git pull --ff-only
APRES=$(git rev-parse --short HEAD)

if [ "$AVANT" = "$APRES" ]; then
  echo "  déjà à jour ($APRES)"
else
  echo "  $AVANT -> $APRES"
  git log --oneline "$AVANT..$APRES" | sed 's/^/    /'
fi

echo
echo "Reconstruction et redémarrage…"
docker compose build
docker compose up -d

echo
echo "Vérification…"
for i in $(seq 1 30); do
  if docker compose exec -T backend node -e "fetch(\`http://127.0.0.1:4000/api/health\`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    vert "  API opérationnelle"
    break
  fi
  [ "$i" -eq 30 ] && { rouge "L'API ne répond plus. Journaux :"; docker compose logs --tail 40 backend; exit 1; }
  sleep 2
done

# On ne garde que les dix dernières sauvegardes locales.
ls -1t sauvegardes/*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm --

echo
docker compose ps
echo
vert "Mise à jour terminée."
