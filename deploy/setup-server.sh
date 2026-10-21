#!/usr/bin/env bash
# setup-server.sh  (from your machine, with root SSH access): installs or updates
# the server side (deploy/vps/install.sh). Run it the first time and whenever
# deploy/ changes. The app itself is deployed by GitHub Actions (.github/workflows/deploy.yml).
#   DEPLOY_HOST=whatever-vps ./deploy/setup-server.sh
set -euo pipefail

host=${DEPLOY_HOST:-whatever-vps}
dir=/opt/sites-platform/setup
root=$(cd "$(dirname "$0")/.." && pwd)

ssh "$host" "mkdir -p $dir"
rsync -az --delete "$root/deploy/" "$host:$dir/"
ssh "$host" "bash $dir/vps/install.sh"
