#!/usr/bin/env bash
# Aetheria VPS bootstrap - sets up the three-agent fleet on a fresh Ubuntu or
# Debian box. Idempotent: safe to re-run after a git pull or a config change.
#
#   sudo bash ops/bootstrap-vps.sh [testnet|mainnet]
#
# Prereqs done by hand, once:
#   1. Node 18+ installed (https://github.com/nodesource/distributions)
#   2. Repo cloned somewhere (this script infers its own location)
#   3. contracts/.env filled in - the script refuses to install without it:
#        PRIVATE_KEY=0x...            venue owner (resolver signs with this)
#        MM_PRIVATE_KEY=0x...         SEPARATE wallet for the market maker
#        AETHERIA_API_URL=https://... the hosted frontend
#        AGENT_LOG_SECRET=...         must match the frontend's value
set -euo pipefail

NETWORK="${1:-testnet}"
[[ "$NETWORK" == "testnet" || "$NETWORK" == "mainnet" ]] || {
  echo "usage: bootstrap-vps.sh [testnet|mainnet]" >&2; exit 1;
}

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$(id -un)}"

echo "== Aetheria VPS bootstrap =="
echo "   repo:    $REPO_DIR"
echo "   network: $NETWORK"
echo "   user:    $RUN_USER"

command -v node >/dev/null || { echo "node not found - install Node 18+ first" >&2; exit 1; }
NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
(( NODE_MAJOR >= 18 )) || { echo "node $NODE_MAJOR too old - need 18+" >&2; exit 1; }

ENV_FILE="$REPO_DIR/contracts/.env"
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE - fill it in first (see header)" >&2; exit 1; }
for key in PRIVATE_KEY AETHERIA_API_URL AGENT_LOG_SECRET; do
  grep -Eq "^${key}=.+" "$ENV_FILE" || { echo "missing ${key}= in contracts/.env" >&2; exit 1; }
done
grep -Eq "^MM_PRIVATE_KEY=.+" "$ENV_FILE" || \
  echo "WARN: MM_PRIVATE_KEY not set - the market maker will reuse PRIVATE_KEY (one key = one compromise takes everything)"
if grep -Eq "^AETHERIA_API_URL=http://localhost" "$ENV_FILE"; then
  echo "ERROR: AETHERIA_API_URL still points at localhost - set it to the hosted frontend" >&2; exit 1;
fi

echo "-- npm install (contracts, as $RUN_USER so cron can reuse it)"
sudo -u "$RUN_USER" bash -lc "cd '$REPO_DIR/contracts' && npm install --no-fund --no-audit"

echo "-- log directory + rotation"
mkdir -p /var/log/aetheria && chown "$RUN_USER" /var/log/aetheria
cat > /etc/logrotate.d/aetheria <<'ROT'
/var/log/aetheria/*.log {
  weekly
  rotate 4
  compress
  missingok
  notifempty
  copytruncate
}
ROT

echo "-- systemd unit (market maker)"
sed -e "s|__REPO_DIR__|$REPO_DIR|g" -e "s|__NETWORK__|$NETWORK|g" -e "s|__USER__|$RUN_USER|g" \
  "$REPO_DIR/ops/aetheria-mm.service" > /etc/systemd/system/aetheria-mm.service
systemctl daemon-reload
systemctl enable aetheria-mm.service
# restart (not just enable --now): a re-run after a config or code change
# must actually pick the change up.
systemctl restart aetheria-mm.service

echo "-- cron (resolver hourly, drafter daily)"
sed -e "s|__REPO_DIR__|$REPO_DIR|g" -e "s|__NETWORK__|$NETWORK|g" -e "s|__USER__|$RUN_USER|g" \
  "$REPO_DIR/ops/aetheria-agents.cron" > /etc/cron.d/aetheria
chmod 644 /etc/cron.d/aetheria

echo "-- smoke test: resolver dry run (settles nothing, as $RUN_USER)"
sudo -u "$RUN_USER" bash -lc "cd '$REPO_DIR/contracts' && RESOLVER_DRY_RUN=1 npm run 'resolve:$NETWORK'" || \
  echo "WARN: dry run failed - check RPC/env before trusting the cron"

echo
echo "== done =="
echo "market maker:  systemctl status aetheria-mm   |  journalctl -u aetheria-mm -f"
echo "resolver log:  tail -f /var/log/aetheria/resolver.log   (hourly)"
echo "drafter log:   tail -f /var/log/aetheria/drafter.log    (daily 06:10 UTC)"
echo "The AGENT OPS console on the site should show agents online within minutes."
