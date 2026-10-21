#!/usr/bin/env bash
# install.sh  (root, on the VPS; deploy/deploy.sh runs it on every deploy)
#
# Prepares the server for the app. Idempotent, and leaves the other services
# (/opt/platform, sites-enabled) untouched:
#   1. Scripts in /opt/sites-platform and settings in /etc/sites-platform.
#   2. User sitesprov: the app's SSH key may only run sites-dispatch.
#      User sitesdeploy: the GitHub Actions key may only run app-deploy.
#   3. nginx: includes /etc/nginx/sites-platform/*.conf, answers ACME challenges
#      and redirects to HTTPS for every *.<SITES_DOMAIN>.
#   4. Admin panel at panel.<SITES_DOMAIN> (the app has its own login).
#   5. /etc/sites-platform/app.env with the fixed settings. Secrets arrive with
#      each deploy from GitHub Actions (secrets.env, see bin/app-deploy).
#
# Deploy key: put the public key of the SSH_PRIVATE_KEY secret in
# /etc/sites-platform/ci_deploy.pub before running this.
set -euo pipefail

SITES_DOMAIN=${SITES_DOMAIN:-sites.whatever.tech}
APP_PORT=${APP_PORT:-3100}
ACME_EMAIL=${ACME_EMAIL:-implementation@whatever.tech}
# uid of the "node" user in the container: it reads the SSH key and owns the data.
APP_UID=1000

src=$(cd "$(dirname "$0")" && pwd)
[[ $EUID -eq 0 ]] || { echo "ERROR: ejecútalo como root" >&2; exit 1; }

# 1. Scripts and settings
install -d -m 755 /opt/sites-platform/bin /opt/sites-platform/lib
install -m 755 "$src"/bin/* /opt/sites-platform/bin/
install -m 644 "$src/lib/common.sh" /opt/sites-platform/lib/
install -m 644 "$src/../compose.prod.yaml" /opt/sites-platform/compose.prod.yaml
install -d -m 755 /etc/sites-platform
printf 'SITES_DOMAIN=%s\nAPP_PORT=%s\nACME_EMAIL=%s\n' "$SITES_DOMAIN" "$APP_PORT" "$ACME_EMAIL" >/etc/sites-platform/vps.conf
chmod 644 /etc/sites-platform/vps.conf
source /opt/sites-platform/lib/common.sh

# 2. Provisioning user and key
id sitesprov >/dev/null 2>&1 || useradd --system --create-home --shell /bin/sh sitesprov
key=$SP_ETC/provisioner_ed25519
if [[ ! -s $key ]]; then
  ssh-keygen -q -t ed25519 -N '' -C sites-platform-provisioner -f "$key"
fi
chown "$APP_UID:$APP_UID" "$key"
chmod 400 "$key"
home=$(getent passwd sitesprov | cut -d: -f6)
install -d -m 700 -o sitesprov -g sitesprov "$home/.ssh"
printf 'command="/opt/sites-platform/bin/sites-dispatch",restrict %s\n' "$(cut -d' ' -f1,2 "$key.pub")" >"$home/.ssh/authorized_keys"
chown sitesprov:sitesprov "$home/.ssh/authorized_keys"
chmod 600 "$home/.ssh/authorized_keys"
# The container reaches the host as host.docker.internal: pin this server's key.
printf 'host.docker.internal %s\n' "$(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)" >"$SP_ETC/known_hosts"
chmod 644 "$SP_ETC/known_hosts"

# GitHub Actions deploys through this user: its key only runs app-deploy.
id sitesdeploy >/dev/null 2>&1 || useradd --system --create-home --shell /bin/sh sitesdeploy
home=$(getent passwd sitesdeploy | cut -d: -f6)
install -d -m 700 -o sitesdeploy -g sitesdeploy "$home/.ssh"
if [[ -s $SP_ETC/ci_deploy.pub ]]; then
  printf 'command="sudo -n /opt/sites-platform/bin/app-deploy",restrict %s\n' "$(cut -d' ' -f1,2 "$SP_ETC/ci_deploy.pub")" >"$home/.ssh/authorized_keys"
  chown sitesdeploy:sitesdeploy "$home/.ssh/authorized_keys"
  chmod 600 "$home/.ssh/authorized_keys"
else
  echo "AVISO: falta $SP_ETC/ci_deploy.pub; GitHub Actions no podrá desplegar"
fi

sudoers=/etc/sudoers.d/sites-platform
printf '%s\n' \
  'sitesprov ALL=(root) NOPASSWD: /opt/sites-platform/bin/site-ensure, /opt/sites-platform/bin/site-release' \
  'sitesdeploy ALL=(root) NOPASSWD: /opt/sites-platform/bin/app-deploy' >"$sudoers.tmp"
chmod 440 "$sudoers.tmp"
visudo -cqf "$sudoers.tmp" && mv -f "$sudoers.tmp" "$sudoers"

install -d -m 750 -o "$APP_UID" -g "$APP_UID" /var/lib/sites-platform

# Reload nginx after certbot renews (certbot.timer renews webroot certificates by itself).
hook=/etc/letsencrypt/renewal-hooks/deploy/sites-platform-reload-nginx
printf '#!/bin/sh\nnginx -t && systemctl reload nginx\n' >"$hook"
chmod 755 "$hook"

# 3. nginx
take_lock
install -d -m 755 "$NGINX_DIR" "$WEBROOT"
printf 'include %s/*.conf;\n' "$NGINX_DIR" >/etc/nginx/conf.d/sites-platform.conf
apply_conf "$NGINX_DIR/_http.conf" "# Generado por /opt/sites-platform. Desafíos ACME y redirección a HTTPS de todos los sitios.
server {
    listen 80;
    listen [::]:80;
    server_name *.$SITES_DOMAIN;

    location ^~ /.well-known/acme-challenge/ {
        root $WEBROOT;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}"

# 4. Panel
panel="panel.$SITES_DOMAIN"
issue_cert "$panel"
apply_conf "$NGINX_DIR/panel.conf" "$(https_server "$panel" 60m "        proxy_read_timeout 300s;
")"
# Basic auth of earlier versions (the app has its own login now).
rm -f "$SP_ETC/panel.htpasswd" "$SP_ETC/panel-credentials"

# 5. App settings (rewritten every time; secrets live in secrets.env)
cat >"$SP_ETC/app.env" <<EOF
NODE_ENV=production
DATA_DIR=/data
SITES_DOMAIN=$SITES_DOMAIN
SITES_PROTOCOL=https
SITES_PUBLIC_PORT=
TRUST_PROXY_HOPS=1
PROVISION_SSH_TARGET=sitesprov@host.docker.internal
PROVISION_SSH_KEY=/run/provisioner/key
PROVISION_KNOWN_HOSTS=/run/provisioner/known_hosts
EOF
chmod 644 "$SP_ETC/app.env"
echo "Servidor listo: https://$panel"
