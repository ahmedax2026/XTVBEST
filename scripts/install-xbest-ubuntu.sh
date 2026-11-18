#!/usr/bin/env bash
set -euo pipefail
umask 077

die() { printf 'XBEST: %s\n' "$*" >&2; exit 1; }

[[ $EUID == 0 ]] || die "Run sudo bash $0"
source /etc/os-release
[[ $ID == ubuntu && $(uname -m) == x86_64 ]] || die 'Ubuntu x86-64 is required.'
[[ -d /run/systemd/system ]] || die 'Run this on the Ubuntu server with systemd.'

app=/opt/xbest-studio
config=/etc/xbest-studio
data=/var/lib/xbest-studio
site=/etc/nginx/conf.d/xbest-studio.conf
internal_port=18737
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ -f "$bundle/SHA256SUMS" ]] || die 'Run the installer from the extracted XBEST archive.'

exec 9>/run/lock/xbest-studio-install.lock
flock 9

saved_port=
if [[ -f "$site" ]]; then
  saved_port=$(sed -nE 's/^    listen ([0-9]+) ssl;$/\1/p' "$site")
fi
port=${XBEST_HTTPS_PORT:-${saved_port:-8444}}
[[ $port =~ ^[1-9][0-9]{3,4}$ ]] && (( port <= 65535 && port != internal_port )) ||
  die 'XBEST_HTTPS_PORT must be 1000–65535 and cannot be 18737.'
[[ -z $saved_port || $port == "$saved_port" ]] ||
  die "This installation already uses HTTPS port $saved_port."
read -r address _ <<< "$(hostname -I)"
address=${address:-127.0.0.1}
panel_host=${XBEST_PANEL_HOST:-$address}
[[ $panel_host =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] ||
  die 'XBEST_PANEL_HOST must be a DNS name or IPv4 address.'

# Verify the packaged files and accept only flat, regular archive entries.
files=()
while read -r digest entry extra; do
  name=${entry#*/}
  [[ $digest =~ ^[[:xdigit:]]{64}$ && -z $extra && $entry == */* &&
    $name =~ ^[A-Za-z0-9][A-Za-z0-9._+-]*$ && -f "$bundle/$name" && ! -L "$bundle/$name" ]] ||
    die 'Invalid XBEST package manifest.'
  printf '%s  %s\n' "$digest" "$name" |
    (cd "$bundle" && sha256sum --check --status) || die "Checksum failed for $name."
  files+=("$name")
done < "$bundle/SHA256SUMS"
for required in XBEST meilisearch ersatztv-channel install-xbest-ubuntu.sh; do
  [[ " ${files[*]} " == *" $required "* ]] || die "Package is missing $required."
done

packages=()
for command_package in ffmpeg:ffmpeg ffprobe:ffmpeg curl:curl openssl:openssl nginx:nginx ss:iproute2 netstat:net-tools vainfo:vainfo; do
  if ! command -v "${command_package%%:*}" >/dev/null; then
    package=${command_package#*:}
    [[ " ${packages[*]} " == *" $package "* ]] || packages+=("$package")
  fi
done
if (( ${#packages[@]} )); then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends "${packages[@]}"
  # The stock site is enabled only when nginx was installed by this script.
  if [[ " ${packages[*]} " == *" nginx "* &&
    $(readlink /etc/nginx/sites-enabled/default || true) == /etc/nginx/sites-available/default ]]; then
    rm /etc/nginx/sites-enabled/default
  fi
fi
ffmpeg -version >/dev/null
ffprobe -version >/dev/null

if [[ -z $saved_port && -n $(ss -Hlt "sport = :$port") ]]; then
  die "Port $port is busy. Choose another with XBEST_HTTPS_PORT."
fi
if ! systemctl is-active --quiet xbest-studio && [[ -n $(ss -Hlt "sport = :$internal_port") ]]; then
  die "Local port $internal_port is busy."
fi


if ! id xbest-studio >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$data" --shell /usr/sbin/nologin xbest-studio
fi
for group in video render; do
  if getent group "$group" >/dev/null && ! id -nG xbest-studio | grep -qw "$group"; then
    usermod -aG "$group" xbest-studio
  fi
done
install -d -m 0755 "$app" "$app/releases"
install -d -m 0700 "$config"
install -d -m 0750 -o xbest-studio -g xbest-studio "$data" "$data/media"

stage=$(mktemp -d "$app/releases/.install.XXXXXX")
trap 'rm -rf -- "$stage"' EXIT
release_hash=$(sha256sum "$bundle/SHA256SUMS")
release="$app/releases/${release_hash%% *}"
if [[ ! -d "$release" ]]; then
  mkdir "$stage/bundle"
  for name in "${files[@]}"; do
    install -m 0644 "$bundle/$name" "$stage/bundle/$name"
  done
  chmod 0755 "$stage/bundle" "$stage/bundle/"{XBEST,meilisearch,ersatztv-channel}
  mv -T "$stage/bundle" "$release"
fi

if [[ ! -s "$config/credentials.env" ]]; then
  {
    printf 'TUNARR_BASIC_AUTH_USER=admin\n'
    printf 'TUNARR_BASIC_AUTH_PASSWORD=%s\n' "$(openssl rand -hex 20)"
  } > "$config/credentials.env.new"
  mv -T "$config/credentials.env.new" "$config/credentials.env"
fi
chmod 0600 "$config/credentials.env"

if [[ ! -s "$config/panel.crt" || ! -s "$config/panel.key" ]]; then
  san=DNS:localhost,IP:127.0.0.1
  if [[ $panel_host =~ ^[0-9]+(\.[0-9]+){3}$ ]]; then
    [[ $panel_host == 127.0.0.1 ]] || san+=",IP:$panel_host"
  else
    [[ $panel_host == localhost ]] || san+=",DNS:$panel_host"
  fi
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 825 -subj '/CN=XBEST Studio' \
    -addext "subjectAltName=$san" -keyout "$stage/panel.key" -out "$stage/panel.crt" 2>/dev/null
  install -m 0600 "$stage/panel.key" "$config/panel.key"
  install -m 0644 "$stage/panel.crt" "$config/panel.crt"
fi

cat > "$stage/xbest-studio.service" <<UNIT
[Unit]
Description=XBEST Channels Studio
After=network.target

[Service]
User=xbest-studio
Group=xbest-studio
WorkingDirectory=$app/current
Environment=TUNARR_DATABASE_PATH=$data
Environment=TUNARR_BIND_ADDR=127.0.0.1
Environment=TUNARR_SERVER_PORT=$internal_port
Environment=TUNARR_SERVER_TRUST_PROXY=127.0.0.1
EnvironmentFile=$config/credentials.env
EnvironmentFile=-$config/options.env
ExecStart=$app/current/XBEST
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
UMask=0027

[Install]
WantedBy=multi-user.target
UNIT
unit=/etc/systemd/system/xbest-studio.service
changed=0
if ! cmp -s "$stage/xbest-studio.service" "$unit"; then
  install -m 0644 "$stage/xbest-studio.service" "$unit"
  systemctl daemon-reload
  changed=1
fi

previous=$(readlink "$app/current" || true)
if [[ $previous != "$release" ]]; then
  ln -s "$release" "$stage/current"
  mv -Tf "$stage/current" "$app/current"
  changed=1
fi
if (( changed )); then
  systemctl restart xbest-studio
else
  systemctl start xbest-studio
fi

wait_for_panel() {
  local index status
  for ((index = 0; index < 60; index++)); do
    if status=$(curl --silent --max-time 2 -H 'Accept: text/html' \
      --output "$stage/login.html" --write-out '%{http_code}' "$@") &&
      [[ $status == 401 ]] && grep -Fq 'id="login"' "$stage/login.html"; then
      return 0
    fi
    sleep 1
  done
  return 1
}
if ! wait_for_panel "http://127.0.0.1:$internal_port/web/"; then
  if [[ -n $previous && $previous != "$release" ]]; then
    ln -s "$previous" "$stage/current"
    mv -Tf "$stage/current" "$app/current"
    systemctl restart xbest-studio
  fi
  die 'Panel failed to start. See journalctl -u xbest-studio -n 80.'
fi
systemctl enable xbest-studio

cat > "$stage/site.conf" <<NGINX
map \$http_upgrade \$xbest_studio_connection {
    default upgrade;
    '' close;
}

server {
    listen $port ssl;
    server_name _;
    ssl_certificate $config/panel.crt;
    ssl_certificate_key $config/panel.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 50m;
    absolute_redirect off;

    location = / {
        return 302 /web/;
    }

    location / {
        proxy_pass http://127.0.0.1:$internal_port;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-Host \$http_host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$xbest_studio_connection;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
NGINX
if ! cmp -s "$stage/site.conf" "$site"; then
  if [[ -f "$site" ]]; then cp "$site" "$stage/previous.conf"; fi
  install -m 0644 "$stage/site.conf" "$site"
  if ! nginx -t; then
    if [[ -f "$stage/previous.conf" ]]; then
      install -m 0644 "$stage/previous.conf" "$site"
    else
      rm "$site"
    fi
    die 'Nginx configuration failed.'
  fi
  systemctl reload-or-restart nginx
fi
systemctl enable --now nginx
wait_for_panel --cacert "$config/panel.crt" "https://127.0.0.1:$port/web/" ||
  die "HTTPS panel failed. See journalctl -u nginx -n 80."

if command -v ufw >/dev/null && LC_ALL=C ufw status | grep -q '^Status: active'; then
  ufw allow "$port/tcp" comment 'XBEST Studio HTTPS'
fi
if command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$port/tcp"
  firewall-cmd --add-port="$port/tcp"
fi

printf '\nXBEST: https://%s:%s/web/\n' "$panel_host" "$port"
printf 'Username: admin\nPassword: %s\n' "$(sed -n 's/^TUNARR_BASIC_AUTH_PASSWORD=//p' "$config/credentials.env")"
