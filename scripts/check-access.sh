#!/usr/bin/env bash
# Fails unless a host answers with a redirect to the Cloudflare Access login.
# Run before a deploy (so the Worker never binds an ungated hostname) and
# after it (so a removed Access app is caught). Retries to ride out DNS and
# edge propagation on a first deploy.
set -euo pipefail
host="${1:?usage: check-access.sh <hostname>}"
for attempt in 1 2 3 4 5 6; do
  read -r code location < <(curl -s -o /dev/null -m 15 -w '%{http_code} %{redirect_url}\n' "https://${host}/" || echo "000 -")
  if [[ $code == 302 && $location == https://*.cloudflareaccess.com/* ]]; then
    echo "OK: https://${host}/ redirects to Cloudflare Access."
    exit 0
  fi
  echo "Attempt ${attempt}: got ${code} ${location:-}; expected 302 to *.cloudflareaccess.com."
  sleep 10
done
echo "::error::https://${host}/ is not behind Cloudflare Access. Apply the geo-tracker worker_apps entry in terraform-cloudflare-boldin first."
exit 1
