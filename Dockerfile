# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_URL=https://masterfadeapp.com
ARG VITE_APP_URL=https://masterfadeapp.com
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package*.json ./
RUN npm ci

COPY . .
RUN VITE_API_URL=https://masterfadeapp.com VITE_APP_URL=https://masterfadeapp.com npm run build

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
    '  location /v1/ {' \
    '    proxy_pass http://backend-qa:3002/v1/;' \
    '    proxy_http_version 1.1;' \
    '' \
    '    proxy_set_header Host $host;' \
    '    proxy_set_header X-Real-IP $remote_addr;' \
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;' \
    '    proxy_set_header X-Forwarded-Proto $scheme;' \
    '' \
    '    proxy_set_header Upgrade $http_upgrade;' \
    '    proxy_set_header Connection "upgrade";' \
    '  }' \
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