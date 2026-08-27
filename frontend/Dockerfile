# ---------- Compilation ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Aucune VITE_API_URL n'est fournie : le build de production vise la même origine,
# nginx se chargeant de relayer /api vers le backend (voir nginx.conf).
RUN npm run build

# ---------- Service ----------
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
