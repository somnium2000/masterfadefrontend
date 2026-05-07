# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder

WORKDIR /app

# Variables obligatorias de build.
# En Vite, las variables VITE_* se inyectan durante npm run build.
# EasyPanel debe enviarlas como Build Args, no solo como variables runtime.
ARG VITE_API_URL
ARG VITE_APP_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package*.json ./
RUN npm ci

COPY . .

# Validación mínima anti-errores de ambiente.
# Evita que producción compile contra QA o que QA compile contra producción.
RUN set -eu; \
  if [ -z "$VITE_API_URL" ]; then echo "ERROR: VITE_API_URL es obligatorio"; exit 1; fi; \
  if [ -z "$VITE_APP_URL" ]; then echo "ERROR: VITE_APP_URL es obligatorio"; exit 1; fi; \
  if [ -z "$VITE_SUPABASE_URL" ]; then echo "ERROR: VITE_SUPABASE_URL es obligatorio"; exit 1; fi; \
  if [ -z "$VITE_SUPABASE_ANON_KEY" ]; then echo "ERROR: VITE_SUPABASE_ANON_KEY es obligatorio"; exit 1; fi; \
  if [ "$VITE_APP_URL" = "https://masterfadeapp.com" ] && [ "$VITE_API_URL" != "https://api.masterfadeapp.com" ]; then \
    echo "ERROR: Producción debe usar VITE_API_URL=https://api.masterfadeapp.com"; exit 1; \
  fi; \
  if [ "$VITE_APP_URL" = "https://www.masterfadeapp.com" ] && [ "$VITE_API_URL" != "https://api.masterfadeapp.com" ]; then \
    echo "ERROR: Producción www debe usar VITE_API_URL=https://api.masterfadeapp.com"; exit 1; \
  fi; \
  if [ "$VITE_APP_URL" = "https://qa.masterfadeapp.com" ] && [ "$VITE_API_URL" != "https://api-qa.masterfadeapp.com" ]; then \
    echo "ERROR: QA debe usar VITE_API_URL=https://api-qa.masterfadeapp.com"; exit 1; \
  fi; \
  npm run build

FROM nginx:1.27-alpine AS runner

RUN rm -f /etc/nginx/conf.d/default.conf \
  && printf '%s\n' \
    'server {' \
    '  listen 80;' \
    '  server_name _;' \
    '' \
    '  root /usr/share/nginx/html;' \
    '  index index.html;' \
    '' \
    '  location / {' \
    '    try_files $uri $uri/ /index.html;' \
    '  }' \
    '' \
    '  location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$ {' \
    '    expires 7d;' \
    '    add_header Cache-Control "public, immutable";' \
    '  }' \
    '}' \
    > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
