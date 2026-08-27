# ---------- Compilation ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# ---------- Service ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Dépendances de production uniquement. « prisma » figure volontairement dans
# les dependencies : la CLI est nécessaire au démarrage pour migrate deploy.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Client Prisma généré à l'étape précédente (inclut le moteur de requêtes).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

USER node
EXPOSE 4000

# Les migrations en attente sont appliquées avant le démarrage du serveur.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/index.js"]
