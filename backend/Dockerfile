# Base Debian et non Alpine : avec musl, Prisma échoue à détecter la version
# d'OpenSSL et sélectionne un moteur de requêtes inexistant.
# Les deux étapes partagent la même base pour que le moteur généré au build
# corresponde exactement à celui attendu à l'exécution.

# ---------- Compilation ----------
FROM node:20-slim AS build
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# ---------- Service ----------
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Dépendances de production uniquement. « prisma » est volontairement dans les
# dependencies : la CLI applique les migrations au démarrage.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Client Prisma généré à l'étape précédente (inclut le moteur de requêtes).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

# Sans ce chown, l'utilisateur « node » ne peut pas écrire dans node_modules,
# et prisma migrate deploy échoue avec « Can't write to @prisma/engines ».
RUN chown -R node:node /app

USER node
EXPOSE 4000

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/index.js"]
