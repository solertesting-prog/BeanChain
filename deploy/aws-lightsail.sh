#!/usr/bin/env bash
# Instala BeanChain en un servidor Ubuntu 22.04/24.04 (AWS Lightsail).
# Pégalo como "launch script" al crear la instancia, rellenando GITHUB_TOKEN.
# Progreso: sudo tail -f /var/log/beanchain-install.log   ·   Credenciales: sudo cat /root/beanchain-credenciales.txt
set -euo pipefail
exec > >(tee -a /var/log/beanchain-install.log) 2>&1

GITHUB_TOKEN="${GITHUB_TOKEN:-PEGA_AQUI_TU_TOKEN}"   # token de GitHub de sólo lectura para el repo BeanChain
REPO="solertesting-prog/BeanChain"
DOMAIN="${DOMAIN:-}"                                  # opcional: tu dominio, si ya apunta a la IP del servidor
DIR=/opt/beanchain

echo "==> $(date) Instalando Docker"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git openssl
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi

# Memoria de intercambio: compilar la web y la API necesita algo más de RAM
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Descargando BeanChain"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" "$DIR"
  git -C "$DIR" remote set-url origin "https://github.com/${REPO}.git"
fi
cd "$DIR/deploy"

IP=$(curl -s http://checkip.amazonaws.com)
if [ -n "$DOMAIN" ]; then SITE_ADDRESS="$DOMAIN"; PUBLIC_URL="https://$DOMAIN"; else SITE_ADDRESS=":80"; PUBLIC_URL="http://$IP"; fi

if [ ! -f .env ]; then
  echo "==> Generando secretos"
  ADMIN_PASS="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)Aa1"
  cat > .env <<ENV
DB_PASSWORD=$(openssl rand -hex 16)
PUBLIC_URL=$PUBLIC_URL
SITE_ADDRESS=$SITE_ADDRESS
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
APP_ENCRYPTION_KEY=$(openssl rand -hex 32)
BLOCKCHAIN_MODE=simulated
KYC_PROVIDER=mock
MAIL_DRIVER=console
SEED_ADMIN_EMAIL=admin@beanchain.local
SEED_ADMIN_PASSWORD=$ADMIN_PASS
ENV
  chmod 600 .env
  printf 'Web: %s\nAdministrador: admin@beanchain.local\nContraseña: %s\n' "$PUBLIC_URL" "$ADMIN_PASS" > /root/beanchain-credenciales.txt
  chmod 600 /root/beanchain-credenciales.txt
fi

echo "==> Construyendo y arrancando (10-15 minutos la primera vez)"
docker compose -f docker-compose.prod.yml up -d --build

echo "==> Esperando a la API"
for i in $(seq 1 60); do curl -fs http://localhost/health >/dev/null && break; sleep 5; done
docker compose -f docker-compose.prod.yml exec -T api node prisma/seed.js || true

echo "==> $(date) LISTO: $PUBLIC_URL"
cat /root/beanchain-credenciales.txt
