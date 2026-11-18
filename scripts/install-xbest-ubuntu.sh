#!/usr/bin/env bash
set -euo pipefail
umask 077

die() { printf 'XBEST: %s\n' "$*" >&2; exit 1; }

[[ $EUID == 0 ]] || die "Run sudo bash $0"
source /etc/os-release
[[ $ID == ubuntu && $(uname -m) == x86_64 ]] || die 'Ubuntu x86-64 is required.'
[[ -d /run/systemd/system ]] || die 'Run this on the Ubuntu server with systemd.'
legacy_runtime=0
if [[ $VERSION_ID == 20.04 ]]; then legacy_runtime=1; fi

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
commands=(curl:curl openssl:openssl nginx:nginx ss:iproute2)
if (( legacy_runtime )); then
  commands+=(docker:docker.io)
else
  commands+=(ffmpeg:ffmpeg ffprobe:ffmpeg netstat:net-tools vainfo:vainfo)
fi
for command_package in "${commands[@]}"; do
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
if (( legacy_runtime )); then
  systemctl enable --now docker
  if ! docker image inspect xbest-studio-runtime:ubuntu22 >/dev/null 2>&1; then
    docker build -t xbest-studio-runtime:ubuntu22 - <<'DOCKERFILE'
FROM ubuntu:22.04
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates ffmpeg fonts-dejavu-core net-tools vainfo \
    && rm -rf /var/lib/apt/lists/*
DOCKERFILE
  fi
else
  ffmpeg -version >/dev/null
  ffprobe -version >/dev/null
fi

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

start="ExecStart=$app/current/XBEST"
stop=
docker_dependency=
identity=$'User=xbest-studio\nGroup=xbest-studio'
if (( legacy_runtime )); then
  identity=
  docker_dependency=$'Requires=docker.service\nAfter=docker.service'
  docker_args="--rm --name xbest-studio-runtime --network host --security-opt no-new-privileges --cap-drop ALL"
  docker_args+=" --user $(id -u xbest-studio):$(id -g xbest-studio)"
  docker_args+=" --mount type=bind,src=$app/current,dst=$app/current,readonly"
  docker_args+=" --mount type=bind,src=$data,dst=$data --workdir $app/current"
  docker_args+=" --volume /etc/localtime:/etc/localtime:ro --env HOME=$data"
  if [[ -d /dev/dri ]]; then
    docker_args+=" --device /dev/dri"
    for group in video render; do
      if entry=$(getent group "$group"); then
        IFS=: read -r _ _ gid _ <<< "$entry"
        docker_args+=" --group-add $gid"
      fi
    done
  fi
  for name in TUNARR_DATABASE_PATH TUNARR_BIND_ADDR TUNARR_SERVER_PORT \
    TUNARR_SERVER_TRUST_PROXY TUNARR_BASIC_AUTH_USER TUNARR_BASIC_AUTH_PASSWORD \
    MEILI_DUMP_DIR XBEST_LICENSE_PUBLIC_KEY_FILE XBEST_LICENSE_SERVER_URL; do
    docker_args+=" --env $name"
  done
  docker_path=$(command -v docker)
  start="ExecStartPre=-$docker_path rm -f xbest-studio-runtime"
  start+=$'\n'"ExecStart=$docker_path run $docker_args xbest-studio-runtime:ubuntu22 $app/current/XBEST"
  stop="ExecStop=$docker_path stop --time 10 xbest-studio-runtime"
fi

cat > "$stage/xbest-studio.service" <<UNIT
[Unit]
Description=XBEST Channels Studio
After=network.target
$docker_dependency

[Service]
$identity
WorkingDirectory=$app/current
Environment=TUNARR_DATABASE_PATH=$data
Environment=TUNARR_BIND_ADDR=127.0.0.1
Environment=TUNARR_SERVER_PORT=$internal_port
Environment=TUNARR_SERVER_TRUST_PROXY=127.0.0.1
Environment=MEILI_DUMP_DIR=$data/dumps
EnvironmentFile=$config/credentials.env
EnvironmentFile=-$config/options.env
$start
$stop
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
