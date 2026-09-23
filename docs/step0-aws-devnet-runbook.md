# Step 0 on a Fresh AWS Instance — The Full Runbook

> **Goal:** from a bare AWS instance to a working Midnight devnet loop —
> compile → deploy → store → read — replicating what we did in
> `apps/credvault/step0-hello/` on 2026-09-03.
> **Time:** ~45–60 min first time (mostly Docker image pulls). **Cost:** a few
> dollars if you stop the instance when done.

---

## 0. What you are building (the moving parts)

```
your laptop ──SSH──► AWS instance (Ubuntu)
                      └── Docker: midnight-node :9944      ← the blockchain
                                  indexer-standalone :8088  ← GraphQL query layer
                                  proof-server :6300        ← generates ZK proofs
                      └── your project (create-mn-app)
                          compactc 0.31.1 compiles .compact → JS + ZK keys
                          Midnight.js 4.1.1 deploys & calls the contract
```

All three services run **on the instance localhost** — you never expose them to
the internet. The devnet is self-contained: a genesis wallet is pre-funded with
tNIGHT, so no faucet, no real money, nothing to break.

---

## 1. Instance recommendation (frugal but comfortable)

| Choice | Spec | ~Price (us-east-1, on-demand) | Verdict |
|---|---|---|---|
| **t3a.xlarge** | 4 vCPU (AMD), 16 GB RAM | ~$0.15/hr (~$110/mo if left on) | **Recommended** — proving is CPU/RAM-hungry; 16 GB keeps node+indexer+proof-server happy |
| t3.large | 2 vCPU, 8 GB RAM | ~$0.083/hr | Works for hello-world, tight for bigger circuits later |
| t3.xlarge | 4 vCPU, 16 GB RAM | ~$0.166/hr | Same as t3a.xlarge, Intel instead of AMD |

**Avoid ARM (t4g)** — the Midnight Docker images are x86_64.
**Disk:** 80 GB gp3 (images are several GB; chain data grows).
**AMI:** Ubuntu Server 24.04 LTS (x86).
**Security group:** inbound **SSH (22) from your IP only**. Do NOT open
9944/8088/6300 — everything stays on localhost.

**Cost control that actually matters:** *stop* the instance when you are not
using it (EBS persists, everything intact). A t3a.xlarge used 3 evenings a
week ≈ $5/month. Do not use Spot for this — an interruption mid-proof is
annoying.

---

## 2. Provision and connect

```bash
# From your laptop (console works too: EC2 → Launch instance → Ubuntu 24.04,
# t3a.xlarge, 80 GB gp3, your key pair, SG with SSH from your IP)
ssh -i ~/.ssh/YOUR-KEY.pem ubuntu@YOUR-INSTANCE-IP

# Everything below runs ON the instance unless noted.
sudo apt update && sudo apt upgrade -y
```

---

## 3. Install Docker + Compose plugin

```bash
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Let your user run docker without sudo (takes effect on next login)
sudo usermod -aG docker ubuntu
exit
ssh -i ~/.ssh/YOUR-KEY.pem ubuntu@YOUR-INSTANCE-IP   # back in
docker version && docker compose version              # verify both
```

---

## 4. Install Node.js 22+ and the Compact toolchain

```bash
# Node 22 LTS via NodeSource (Midnight requires >= 22)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs unzip
# (unzip is REQUIRED: compact compiler artifacts ship as .zip and Ubuntu
#  Server does not include it — without it 'compact update' fails with
#  "Failed to spawn artifact extraction command")
node --version    # v22.x

# Compact devtools + compiler (0.31.1 is the current stable matrix pin)
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source ~/.bashrc                 # puts ~/.local/bin on PATH (or re-login)
compact update 0.31.1            # download + set default compiler
compact --version                # devtools (0.5.x)
compact compile --version        # 0.31.1
```

---

## 5. Scaffold the project

```bash
mkdir -p ~/midnight && cd ~/midnight
npx -y create-mn-app step0-hello -t hello-world -y --use-npm
cd step0-hello
```

This creates the project, installs deps, and pre-compiles the contract.
Key files to read while learning:

- `contracts/hello-world.compact` — the contract (ledger + one circuit)
- `src/deploy.ts` — canonical provider wiring + deploy flow
- `src/wallet.ts` — HD key derivation + 3-wallet facade setup
- `docker-compose.yml` — the devnet, with excellent version-drift warnings in
  the comments (why indexer stays on 4.3.3 and proof-server on 8.1.0)

---

## 6. ⚠ THE FIX you must apply (learned the hard way, 2026-09-03)

Fresh `create-mn-app` installs currently resolve **two copies** of
`@midnight-ntwrk/onchain-runtime-v3` (3.1.0 for compact-runtime + 3.0.0 for
midnight-js-protocol). Two WASM runtime copies → `instanceof` breaks →
`callTx` fails with **"expected instance of StateValue"**.

```bash
# 1. Add the override to package.json:
node -e "
const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json'));
p.overrides={...(p.overrides||{}),'@midnight-ntwrk/onchain-runtime-v3':'3.0.0'};
fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n');
console.log('override added');"

# 2. Reinstall and dedupe to exactly ONE copy
npm install
npm dedupe

# 3. Verify: must print exactly ONE line, version 3.0.0
node -e "const l=require('./package-lock.json');
for (const [k,v] of Object.entries(l.packages))
  if (k.includes('onchain-runtime')) console.log(k, '→', v.version)"
# Expected: node_modules/@midnight-ntwrk/onchain-runtime-v3 → 3.0.0
```

---

## 7. Boot the devnet, compile, deploy (one command)

```bash
npm run setup
```

This runs `src/setup.ts`: `docker compose up -d --wait` (node, indexer,
proof-server — first run pulls several GB), compiles the contract, deploys it.
Watch for:

```
✓ Synced with network.
  Wallet Address: mn_addr_undeployed1...
  Balance: 250,000,000,000,000 tNight      ← genesis pre-funded devnet wallet
  ✅ Contract deployed successfully!
  Contract Address: ................       ← save this
```

Genesis DUST generation and deploy take ~1–3 min after images are pulled.

---

## 8. Interact — full transaction loop

```bash
npm run cli
# Menu: 1. Store a message  2. Read current message  3. Check balance  4. Exit
```

Behind option 1 the whole pipeline runs: local circuit execution → proof
generation on the proof server → fee balancing with DUST → submit → on-chain
finalization. Option 2 reads state back through the indexer GraphQL.

> **Heads-up for scripting:** `npm run cli` is readline-interactive and stdin
> piping does NOT reach it through npm/npx/tsx. For non-interactive runs and
> benchmarks, copy the instrumented driver from our repo —
> `apps/credvault/step0-hello/src/step0-driver.ts` (same wiring, adds timing
> marks) — and run `npx tsx src/step0-driver.ts`.

---

## 9. What you should see (benchmarks from 2026-09-03)

| Measurement | Expected |
|---|---|
| Wallet sync (restored state) | ~0.5 s |
| Connect to deployed contract | ~0.4 s |
| **Full tx loop** (exec → prove → balance → submit → finalize) | **~20 s** |
| Indexer read + decode | <0.1 s |
| Deploy end-to-end (after image pulls) | ~1–3 min |

---

## 10. Troubleshooting (the things that actually bit us)

| Symptom | Cause | Fix |
|---|---|---|
| `expected instance of StateValue` at callTx | Two onchain-runtime copies (3.1.0 + 3.0.0) | §6 override + `npm dedupe` |
| `compact: command not found` | PATH not reloaded | `source ~/.bashrc` or re-login |
| `compact update` → "already installed" but `compact compile` says file missing | Zombie registration from an interrupted first install | `rm -rf ~/.compact/versions/0.31.1 && compact update 0.31.1` |
| `compact update` → "Failed to spawn artifact extraction command" | `unzip` not installed (artifacts are .zip) | `sudo apt install -y unzip`, then wipe + retry as above |
| `docker: permission denied` | group not active | re-login after `usermod -aG docker` |
| `port 6300/9944/8088 already in use` | old devnet still running | `docker compose down` in the old project |
| Wallet shows 0 tNIGHT on undeployed | devnet preset did not mint | `docker compose down -v && npm run setup` |
| `npm run cli` ignores piped stdin | readline through npx/tsx | use the driver script (§8) |
| compose: SPO/indexer exits at boot | indexer started before block 1 | handled by template healthchecks — do not "simplify" them |

---

## 11. When you are done (cost + cleanup)

```bash
docker compose down        # stop the devnet (keeps volumes)
docker compose down -v     # ALSO wipe chain data (fresh start next time)
# Then in the AWS console: Stop (not Terminate) the instance — EBS persists,
# everything is exactly where you left it, and billing drops to ~disk only.
```

---

## 12. Where to go next

You now have the exact environment CredVault Step 1 is being built in:
- Read `src/deploy.ts` and `src/wallet.ts` until the 6 providers make sense
  (private-state, public-data, zk-config, proof, wallet, midnight).
- Then look at `apps/credvault/ARCHITECTURE.md` §7 — Step 1 hand-writes the
  degree + revocation contract on this same wiring.
