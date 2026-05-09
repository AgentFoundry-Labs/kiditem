#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/kiditem}"
SWAP_SIZE="${SWAP_SIZE:-0}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Run this script on the EC2 Ubuntu host." >&2
  exit 2
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required." >&2
  exit 2
fi

echo "Installing base packages"
sudo apt-get update -y
sudo apt-get install -y ca-certificates certbot curl gnupg nginx python3-certbot-nginx rsync

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker Engine and Compose plugin"
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  . /etc/os-release
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "Docker already installed"
fi

sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

echo "Preparing app directory: $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"

if [[ "$SWAP_SIZE" != "0" && ! -f /swapfile ]]; then
  echo "Creating swapfile: $SWAP_SIZE"
  sudo fallocate -l "$SWAP_SIZE" /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "Swap setup skipped"
fi

sudo systemctl enable --now nginx

echo "Installed versions:"
docker --version
docker compose version
nginx -v

cat <<'NEXT'

Next steps:
1. Log out and SSH back in so the docker group membership applies.
2. Create /opt/kiditem/.env.staging.api and /opt/kiditem/.env.staging.web.
3. Run ./bin/deploy-staging.sh from your local repo.
4. After deploy syncs deploy/staging, install host nginx config:
   sudo cp /opt/kiditem/deploy/staging/host-nginx-http.conf.example /etc/nginx/sites-available/kiditem-staging
   sudo ln -sf /etc/nginx/sites-available/kiditem-staging /etc/nginx/sites-enabled/kiditem-staging
   sudo nginx -t
   sudo systemctl reload nginx
NEXT
