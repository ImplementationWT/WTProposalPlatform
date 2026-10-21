# shellcheck shell=bash
# Shared functions of /opt/sites-platform/bin (run as root).
#
# Same approach as /opt/platform (WT_OutsourcingPlatform): every subdomain gets
# its own Let's Encrypt certificate (webroot) and nginx server. Names are
# validated with a regex before they reach a path, a command or a config file.

readonly SP_ETC=/etc/sites-platform
readonly NGINX_DIR=/etc/nginx/sites-platform
readonly WEBROOT=/var/www/certbot
readonly LIVE=/etc/letsencrypt/live
readonly NAME_RE='^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

# SITES_DOMAIN, APP_PORT, ACME_EMAIL (written by install.sh, owned by root).
# shellcheck source=/dev/null
source "$SP_ETC/vps.conf"

# A certificate's common name holds at most 64 characters.
require_name() {
  [[ ${1:-} =~ $NAME_RE ]] && ((${#1} + ${#SITES_DOMAIN} + 1 <= 64)) || die "nombre inválido: ${1:-}"
}

# One change at a time: certbot refuses to run twice and nginx reloads must not interleave.
take_lock() {
  exec {sp_lock}>/run/lock/sites-platform.lock
  flock -w 300 "$sp_lock" || die "otra operación sigue en curso"
}

# Never reissues an existing certificate (Let's Encrypt rate limits).
issue_cert() {
  local host=$1 out
  [[ -s $LIVE/$host/fullchain.pem ]] && return 0
  install -d -m 755 "$WEBROOT"
  if ! out=$(certbot certonly --webroot -w "$WEBROOT" -d "$host" --cert-name "$host" \
    --non-interactive --agree-tos -m "$ACME_EMAIL" --keep-until-expiring 2>&1); then
    printf '%s\n' "$out" >&2
    die "certbot no pudo emitir el certificado de $host: $(grep -m1 -E 'Detail:|Error' <<<"$out" | sed -E 's/^[[:space:]]+//')"
  fi
  [[ -s $LIVE/$host/fullchain.pem ]] || die "certbot terminó sin dejar el certificado de $host"
}

# Writes a server file; if nginx -t fails, restores the previous one and does not reload.
apply_conf() {
  local target=$1 content=$2 backup="" tmp out
  tmp=$(mktemp "$NGINX_DIR/.tmp.XXXXXX")
  printf '%s\n' "$content" >"$tmp"
  chmod 644 "$tmp"
  if [[ -e $target ]] && cmp -s "$tmp" "$target"; then
    rm -f "$tmp"
    return 0
  fi
  if [[ -e $target ]]; then
    backup=$(mktemp "$NGINX_DIR/.bak.XXXXXX")
    cp -p "$target" "$backup"
  fi
  mv -f "$tmp" "$target"
  if ! out=$(nginx -t 2>&1); then
    if [[ -n $backup ]]; then mv -f "$backup" "$target"; else rm -f "$target"; fi
    printf '%s\n' "$out" >&2
    die "nginx -t falló con $(basename "$target"); se restauró la configuración anterior"
  fi
  [[ -z $backup ]] || rm -f "$backup"
  systemctl reload nginx
}

remove_conf() {
  [[ -e $1 ]] || return 0
  rm -f "$1"
  nginx -t >/dev/null 2>&1 || die "nginx -t falla tras quitar $(basename "$1")"
  systemctl reload nginx
}

# HTTPS server of a host proxied to the app. Extra directives go inside "location /".
https_server() {
  local host=$1 body_size=$2 extra=${3:-}
  cat <<EOF
# Generado por /opt/sites-platform. No editar a mano.
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $host;

    ssl_certificate     $LIVE/$host/fullchain.pem;
    ssl_certificate_key $LIVE/$host/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:sites_platform_ssl:10m;

    client_max_body_size $body_size;

    location / {
$extra        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;   # the app picks the site from Host
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
}
