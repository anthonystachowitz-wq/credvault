# Preprod Migration Runbook — taking CredVault online

> **Goal:** move the working school demo from the local `undeployed` devnet to the
> hosted **preprod** network — real public infrastructure, faucet-funded tNIGHT,
> phone-reachable portal over HTTPS.
> **Prerequisite:** Step-2 runbook completed on the AWS instance (everything works
> locally). **Time:** ~60–90 min, mostly waiting on faucet + sync.

---

## 0. The mental model (nothing runs but the proof server)

```
AWS instance:  portal + issuer runtime + proof server :6300   ← yours
preprod (hosted by Midnight):  node RPC + indexer GraphQL     ← theirs
```

No node, no db-sync, no Cardano relay. Contracts deploy through the hosted RPC;
the network executes them. Only the proof server stays ours (private data).

---

## 1. Fund a wallet from the preprod faucet

```bash
cd ~/step1-degree
# print YOUR wallet address (seed is auto-persisted per network):
npm run check-balance -- --network preprod 2>/dev/null || npx tsx -e "
import { getOrCreateWallet } from './src/network.js';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk';
const { seed } = getOrCreateWallet('preprod');
const hd = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
const k = hd.hdWallet.selectAccount(0).selectRoles([Roles.NightExternal]).deriveKeysAt(0);
console.log('seed (SAVE THIS):', seed);
" 2>/dev/null | head -2
```

Then open the faucet in your browser: https://midnight-tmnight-preprod.nethermind.dev/
Request tNIGHT for your address. Rate-limited — one request, then WAIT (minutes).

> ⚠ Save the seed shown in `.midnight-state.json` — it IS the wallet. Losing it
> = losing the preprod wallet + its tNIGHT.

## 2. Point the stack at preprod

Every command accepts `-- --network preprod` (or set `"activeNetwork": "preprod"` in
`.midnight-state.json`). The presets in `src/network.ts` already carry the hosted
endpoints — verify them:

```bash
grep -A6 "preprod:" src/network.ts | head -8
# node:      https://rpc.preprod.midnight.network
# indexer:   https://indexer.preprod.midnight.network/api/v4/graphql
# indexerWS: wss://indexer.preprod.midnight.network/api/v4/graphql/ws
```

## 3. First sync + deploy-with-capture (fresh on preprod)

```bash
rm -f data/deployment.json data/deploy-proof.bin     # L2 replay needs the PREPROD deploy
npm run runtime batch -- --network preprod
```

Watch for:
- **first wallet sync: MINUTES, not 0.5s** (one-time; restores from saved state after)
- `deployed (with capture): <address>` — the deploy tx is saved for L2 replay
- `root anchored` — first REAL preprod transaction from the app 🎉

If the wallet shows 0 tNIGHT: faucet tx hasn't landed yet — wait and retry.

## 4. Premint + test matrix on preprod

```bash
npm run premint -- --network preprod     # ~2s per proof, local CPU (unchanged)
npm run verifier presentations/STU-001.presentation.json -- --min-gpa 350
```

Then re-run the gauntlet: valid ✓ / revoked ✗ (needs a fresh revoke on preprod) /
tampered ✗ / subset ✓ / monolithic ✓ / L2 ✓. Everything should behave identically
— the stack doesn't change, only finality times (tens of seconds per tx).

## 5. Portal reachable + HTTPS (phone test, for real this time)

```bash
# 1. Security group: open 4050 to your IP(s) — and 80/443 for Caddy
# 2. Caddy for HTTPS (real PWA install + camera QR on Android):
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile <<EOF
your-domain.example.com {
    reverse_proxy 127.0.0.1:4050
}
EOF
sudo systemctl reload caddy
npm run portal
```

No domain yet? Plain http://INSTANCE-IP:4050 works in-browser (no install prompt).
Then: phone → https://your-domain/holder.html → install → import → share → scan.

## 6. Expected timings (preprod vs devnet)

| Operation | undeployed | preprod |
|---|---|---|
| First wallet sync | 0.5 s | minutes (one-time) |
| Tx loop (deploy/anchor/revoke) | ~20 s | ~20–60 s (finality) |
| L2 premint per proof | ~2 s | ~2 s (local, unchanged) |
| Verification (L1/L2) | 0.1–0.2 s | ~1 s (indexer latency) |

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| Wallet 0 tNIGHT after faucet | Faucet is rate-limited/slow — wait 5–10 min, re-check |
| `expected instance of StateValue` | npm dedupe (the eternal override) |
| L2 verify fails after redeploy | stale deploy-proof.bin — it must be from the CURRENT network's deploy |
| deploy hangs on contract probe | you're pointing at a deployment from another network — `rm data/deployment.json` |
| indexer timeouts on reads | public indexer latency — retry; our reads are one-shot GraphQL |
| preview vs preprod confusion | we chose PREPROD (tracks mainnet); preview is for early experiments |

## 8. Roll back

```bash
# undeployed is untouched — flip activeNetwork back (or just drop --network):
npm run runtime batch        # local devnet, instant as always
```