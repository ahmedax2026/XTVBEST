#!/usr/bin/env bash
set -euo pipefail

archive=$1
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
archive=$(realpath -- "$archive")
cd "$work"
mkdir extracted
tar -xzf "$archive" -C extracted
installer=$(find extracted -name install-xbest-ubuntu.sh -print -quit)
bash -n "$installer"
sudo apt-get update
sudo apt-get install -y ufw
sudo ufw allow 22/tcp
sudo ufw --force enable
sudo bash "$installer" > "$work/xbest-install.log"
systemctl is-enabled xbest-studio nginx
systemctl is-active xbest-studio nginx
sudo ufw status > "$work/xbest-ufw.log"
grep -Eq '^8444/tcp +ALLOW' "$work/xbest-ufw.log"
ss -Hlt 'sport = :18737' > "$work/xbest-backend.log"
grep -F '127.0.0.1:18737' "$work/xbest-backend.log"
sudo install -o "$(id -u)" -m 600 /etc/xbest-studio/panel.crt "$work/xbest.crt"
base=https://127.0.0.1:8444
curl_tls=(curl -sS --cacert "$work/xbest.crt")
test "$("${curl_tls[@]}" -o /dev/null -w '%{redirect_url}' "$base/")" = "$base/web/"
test "$("${curl_tls[@]}" -H 'Accept: text/html' -o login.html -w '%{http_code}' "$base/web/")" = 401
grep -F 'id="login"' login.html > /dev/null
password=$(sudo sed -n 's/^TUNARR_BASIC_AUTH_PASSWORD=//p' /etc/xbest-studio/credentials.env)
printf '{"username":"admin","password":"%s"}' "$password" |
  "${curl_tls[@]}" --fail -H 'Content-Type: application/json' -H "Origin: $base" \
    --data-binary @- -D headers -c cookies "$base/auth/session"
grep -Ei '^set-cookie:.*; Secure' headers > /dev/null
"${curl_tls[@]}" --fail -b cookies "$base/web/" -o studio.html
grep -F '<title>XBEST</title>' studio.html > /dev/null
before=$(systemctl show xbest-studio -p MainPID --value)
sudo bash "$installer" > "$work/xbest-reinstall.log"
test "$before" = "$(systemctl show xbest-studio -p MainPID --value)"
test "$password" = "$(sudo sed -n 's/^TUNARR_BASIC_AUTH_PASSWORD=//p' /etc/xbest-studio/credentials.env)"
sudo systemctl restart xbest-studio
for attempt in {1..45}; do
  if [[ $("${curl_tls[@]}" -H 'Accept: text/html' -o login.html -w '%{http_code}' "$base/web/") == 401 ]]; then
    grep -F 'id="login"' login.html > /dev/null
    exit 0
  fi
  sleep 1
done
exit 1
