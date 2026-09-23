# Module 2: The Midnight Stack — Every Moving Part, Named and Explained

> Time: ~4 hours | Prerequisites: Module 1 (what a blockchain is, what a hash is, what "zero-knowledge" promises) and basic coding: you can run CLI commands, edit JSON, and read TypeScript slowly.

Before you can build on Midnight you need a map of the territory. This module is that map. By the end, every box on the diagram — node, indexer, proof server, wallet, compiler — will be something you have personally talked to with `curl` or deployed a contract against. Nothing here is abstract: the lab has you bring up the whole stack in Docker and poke each piece.

## Learning objectives

When you finish this module, you can:

- **Name** the three services every Midnight DApp talks to (node, indexer, proof server) and **explain** what each one does and why it exists.
- **Choose** the right network (undeployed / preview / preprod / mainnet) for a given task and **justify** the choice.
- **Explain** the NIGHT/DUST two-token model well enough to predict why a transaction fails with "not enough DUST."
- **Explain** why the proof server always runs locally, even against mainnet — and what would leak if it didn't.
- **Read** the compatibility support matrix and **pin** the right versions for every component.
- **Bring up** the local devnet, **verify** all three services are healthy with curl, and **deploy** a contract to it.

## 1. Concepts from scratch

### 1.1 The 10,000-foot view

A "blockchain" sounds like one thing. It is actually a pile of separate programs that cooperate, and — this is the part nobody tells beginners — **you will only ever talk to three of them**:

```
YOUR CODE (TypeScript, Midnight.js SDK)
   |
   |  1. "What's the state of contract X?"        --> INDEXER      :8088  (GraphQL)
   |  2. "Prove this private computation for me"  --> PROOF SERVER :6300  (HTTP)
   |  3. "Submit this transaction"                --> NODE         :9944  (JSON-RPC / WebSocket)
   |
THE CHAIN ITSELF (many nodes reaching consensus, producing a block every ~6 s)
```

Everything else — consensus algorithms, validators, finality gadgets — is infrastructure *behind* those three doors. You need to know it exists and roughly what it does, the way you know a car has a transmission. You do not need to rebuild the transmission.

Two more pieces live **on your laptop**, not on the network:

- **The Compact toolchain** (`compact` + `compactc`) — compiles your contract into JavaScript + ZK artifacts.
- **Your wallet** — holds keys, NIGHT, and DUST; balances and signs your transactions.

Let's go through each piece properly.

### 1.2 Networks: where your code points

A "network" is one running instance of the whole pile. Midnight operates **one production network and three development environments**. They run the *same software*, so moving between them is a configuration change, not a code change (the official docs say exactly this — and our codebase lives it: all network specifics live in one `NetworkConfig` object with presets, at `step1-degree/src/network.ts`).

| Network | What it is | How you fund a wallet | Anything at risk? |
|---|---|---|---|
| `undeployed` | Local devnet: node + indexer + proof server in Docker on your machine | Genesis wallet is pre-funded — nothing to do | Nothing |
| `preview` | Public testnet for early development, run by core engineering | Free tNIGHT from the Preview faucet | Nothing |
| `preprod` | Public testnet for final validation; tracks mainnet most closely | Free tNIGHT from the Preprod faucet | Nothing |
| `mainnet` | The production network | Real NIGHT (via cNIGHT on Cardano + ~12 h DUST registration) | **Real value** |

Yes, the local network is literally named `undeployed`. That confuses everyone at first — it is the *network ID*, not a statement about your contract. When you see `mn_addr_undeployed1...` as a wallet address, the prefix is Bech32m encoding that same network ID. Each network has its own address prefixes (`mn_addr_preview`, `mn_addr_preprod`, bare `mn_addr` for mainnet), so an address can never silently be used on the wrong network.

The endpoints (memorize the *shape*, not the hostnames):

| Service | undeployed | preprod (example of a public network) |
|---|---|---|
| Node RPC | `http://localhost:9944` | `https://rpc.preprod.midnight.network` |
| Indexer GraphQL | `http://localhost:8088/api/v4/graphql` | `https://indexer.preprod.midnight.network/api/v4/graphql` |
| Indexer WebSocket | `ws://localhost:8088/api/v4/graphql/ws` | `wss://indexer.preprod.midnight.network/api/v4/graphql/ws` |
| Proof server | `http://localhost:6300` | `http://localhost:6300` <- **not a typo** |

Read that last row again. The proof server is **always local**, on every network, including mainnet. Section 1.5 explains why.

> **Retired name alert.** Older articles and tools reference a network called `testnet-02`. It is retired and its endpoints no longer resolve. If a tutorial mentions it, translate mentally to `preview` or `preprod`.

#### The roadmap phases (where mainnet is today)

Mainnet did not launch all at once. Midnight rolls out in named phases (from the January 2026 blog post "Testnet-02 transition & the roadmap to Mohalu"):

| Phase | Milestone | Who produces blocks |
|---|---|---|
| Hilo | Token Genesis | Initial liquidity + the NIGHT "Glacier Drop" on Cardano |
| **Kukolu** | **Federated Mainnet** | **Ecosystem partners** run the validators, keeping the network stable during rapid development |
| Mohalu | Incentivized Mainnet | Cardano SPO (stake pool operator) onboarding begins |
| Hua | Full Decentralization | Block production transitions to the community |

(The phase names carry Hawaiian diacritics — Kūkolu, Mōhalu — search engines handle either spelling.)

The practical takeaway: today's mainnet is in its **federated (Kūkolu) phase** — a known set of ecosystem partners runs the validators. That is a deliberate, temporary centralization while the network hardens. For you as an app developer it changes nothing mechanically (the endpoints are the endpoints), but it explains why validator documentation is currently sparse: the docs are being rebuilt for the Mōhalu SPO-onboarding phase, and **you are not expected to run a validator** either way.

### 1.3 The node — the blockchain itself (light touch, promised)

The node is the program that *is* the blockchain: it holds the ledger, gossips with other nodes, and produces blocks. Midnight's node is built on **Substrate** (the Rust blockchain framework that also powers Polkadot) and runs as a **Cardano partner chain** — its validator selection accounts for stake delegation from Cardano stake pool operators, which is what "partner chain" means in practice.

Two Substrate consensus pieces, one sentence each:

- **AURA (Authority Round)** — *block production*: validators take turns round-robin, each producing a block in its assigned slot. Deterministic and fast.
- **GRANDPA** — *finality*: validators vote on chains *separately from* block production, and once a block is finalized it is final forever (no "wait 6 confirmations" probabilistic dance).

What you actually need to remember:

1. **Blocks come every ~6 seconds.** This is the heartbeat you'll feel everywhere: transactions finalize in one-to-a-few blocks, and some SDK waits are measured in block-times (our deploy script literally sleeps one block-time, 6 s, waiting for DUST accounting to catch up).
2. **You talk to the node over JSON-RPC** (HTTP + WebSocket on port 9944 locally). In practice, Midnight.js does this for you. The only node RPC you'll ever type by hand is a health check.
3. **You will probably never operate one.** See section 1.7.

### 1.4 The indexer — why apps never read the chain directly

Here is a question every beginner asks: "The node has all the data. Why is there a second service to *read* it?"

Because the node stores the chain as an append-only sequence of blocks optimized for *consensus*, not for *questions*. Asking the node "what is the current state of contract X?" is like asking a library for a fact by reading every book in acquisition order. The **indexer** is the card catalog: it watches every block, decodes every transaction and contract state change, and stores it all in a database shaped for questions. Then it answers those questions over **GraphQL** (HTTP for queries, WebSocket for subscriptions).

```
NODE (blocks, one every 6 s, consensus-optimized)
   |  watches and decodes every block
   v
INDEXER (query-optimized database + GraphQL API)
   |  "{ contractAction(address: ...) { state } }"
   v
YOUR APP — gets exactly the slice it asked for, in JSON
```

Concretely, everything our verifier does is an indexer read: when an employer verifies a credential in ~0.1 s, that speed is the indexer answering "give me the state of this contract" from its database — no wallet, no transaction, no account. The API is versioned in the URL path: today's indexer speaks **API v4** (`/api/v4/graphql`).

Two queries you'll use in the lab:

- `{ block { height } }` — latest block height (is the chain alive and moving?)
- `contractAction(address: ...) { state }` — the full current state of one contract, hex-encoded.

A subtlety worth internalizing early: the indexer is a *view* of the chain, not the chain. If the indexer is down, the chain is fine — your reads just have nowhere to go. (Writes are different: transactions are submitted to the **node**, and your wallet *also* syncs through the indexer. So a down indexer blocks both reads and wallet sync, but never endangers the ledger itself.)

### 1.5 The proof server — your private data's bodyguard

Midnight's whole point is *private* smart contracts: you prove things about secret data without revealing the data. Somebody has to do the cryptographic work of turning "your secret + the public rules" into a zero-knowledge proof. That somebody is the **proof server**.

The critical design fact: **the proof server sees your private data.** To build the proof, it needs the secret inputs — your wallet's coin ownership details, your contract's private state, the GPA in a credential. So the architecture makes the only safe choice: the proof server runs **on your own machine**, bound to localhost, port 6300, in a Docker container that *opens no network connections of its own* — it only listens. It phones no one. It is a calculator you rent by the request, and it lives in your house.

That is why the endpoint table in section 1.2 says `http://localhost:6300` for **every** network. Even when your DApp targets mainnet, with real value at stake, the proof server sits next to your code on localhost. The official docs put it plainly: "you should access only a local proof server, or perhaps one on a remote machine that you control, over an encrypted channel."

Two operational facts from the field (both documented in our devnet's `docker-compose.yml` comments):

- The image is **distroless** (no curl, no shell on PATH). Health checks must use a TCP probe, and from the host you check `GET http://localhost:6300/health`.
- Pin **8.1.0**. The entire 7.x line hangs during proof generation on Apple Silicon Macs (worker thread spins at 100% CPU forever, no logs), and 9.0.0-rc tags are pre-releases. This is the kind of version pin the support matrix exists for (section 1.8).

### 1.6 NIGHT and DUST — the two-token model (learn it once, never be confused again)

Most blockchains have one token that is both money and gas, which creates a nasty incentive problem: the thing you invest in is the thing you burn. Midnight splits the two jobs apart:

- **NIGHT** is the token — transferable, unshielded (balances are public), used for staking and governance. Atomic unit: **STAR** (1 NIGHT = 10^6 STAR).
- **DUST** is *not a token* — it is a **shielded, non-transferable resource** that transaction fees are paid in. Atomic unit: **SPECK** (1 DUST = 10^15 SPECK).

The official analogy is genuinely good, so we'll steal it:

> **NIGHT is a solar panel. DUST is the electricity it generates.** You don't spend the panel; you spend the power it produces, and it keeps producing more.

The mechanics (from `docs/concepts/dust-architecture.mdx`, which is the authoritative source):

1. You **register** your NIGHT for DUST generation (a one-time on-chain action per NIGHT UTXO; our deploy script does it automatically).
2. Registered NIGHT **generates DUST continuously**, up to a cap of **5 DUST per NIGHT**. The rate and cap both scale linearly with your NIGHT, so *time to full cap is the same for everyone: about one week* (604,800 seconds — the docs show the arithmetic from the two ledger parameters).
3. **Every transaction consumes DUST.** Small transactions cost small amounts.
4. **Spend the backing NIGHT and its DUST decays** to zero at the same rate it accrued. DUST is a capacity projection of NIGHT you *currently* hold, not a balance you can stockpile or sell. It is also deliberately **non-persistent** — the protocol may redistribute it on hard forks. Never design anything that treats DUST as an asset.

The developer-experience consequences, per network:

| Network | Where fees come from |
|---|---|
| `undeployed` | The genesis wallet is pre-funded **and pre-registered**. DUST starts appearing within seconds-to-minutes of boot. You do nothing. |
| `preview` / `preprod` | Faucet gives you tNIGHT (free, rate-limited; preprod sends 1,000 per request) -> register it -> tDUST accrues. |
| `mainnet` | No faucet. Most NIGHT lives on Cardano as cNIGHT today; you register your Cardano reward address + a Midnight DUST key in the cNgD DApp, and DUST generation begins **~12 hours later** (the registration must finalize on Cardano and reach a Midnight node). Fund production wallets well before launch day. |

The single most common beginner failure on a fresh devnet — a transaction failing with `Not enough Dust` / `Insufficient Funds` — is simply "your DUST hasn't accrued yet." Our deploy script treats it as a *retryable* condition with a 20-attempt loop for exactly this reason. When you see it: wait one block-time, check the wallet's DUST balance, retry.

### 1.7 "You never run a node anymore"

A short history lesson, because it recalibrates expectations. In the early days of every chain, developers ran full nodes on their laptops just to read chain state and submit transactions — gigabytes of sync, hours of waiting, constant version churn. That era is over, on Midnight by design:

- **Locally**, "running the network" means `docker compose up -d --wait` — three containers (node, indexer, proof server) start together with health checks, a genesis wallet is already funded, and you're deploying within minutes. You are *hosting* a node, not *operating* one: no keys, no stake, no sync pain, no ops.
- **Against public networks**, Midnight provides public node and indexer endpoints for development and testing. You run **only the proof server** locally (it must be local — section 1.5) and point everything else at `*.midnight.network` URLs.
- **In production**, the docs recommend you *consider* your own node or a dedicated infrastructure provider — a reliability/independence choice, not a requirement. And running validators is a job for ecosystem partners (Kūkolu phase) and later community SPOs (Mōhalu/Hua) — professionals with stake and SLAs, not app developers.

Keep the division of labor straight: **validators** produce blocks, **infrastructure providers** serve reads, **you** build applications. Your production dependency list is: one HTTPS node endpoint, one indexer endpoint, and a localhost proof server.

### 1.8 The toolchain — `compact`, `compactc`, and version discipline

Two binaries, easy to confuse:

- **`compact`** (the "devtools," v0.5.x) — the manager. Installs, lists, and selects compiler versions (`compact update 0.31.1`), scaffolds projects, runs `compact compile` as a pass-through.
- **`compactc`** (the compiler proper, **0.31.1**) — the actual Compact-to-JS+ZK compiler. You invoke it through `compact compile`; check it with `compact compile --version`.

What a compile produces (you'll see this in the lab): for each exported circuit, a ZKIR intermediate representation (`.zkir`/binary `.bzkir`), a **prover key** and a **verifier key**, plus a JavaScript/TypeScript wrapper of your contract and a `contract-info.json` manifest stamped with `compiler-version`, `language-version`, and `runtime-version`.

**Version discipline is not optional on Midnight** — it's survival. Versions across the stack (compiler, runtime, SDK, wallet, indexer, proof server, node) are only guaranteed to work together in the combinations the team has tested, and those combinations are published in one place: the **compatibility matrix** at `docs/relnotes/support-matrix.mdx` (online: docs.midnight.network/relnotes/support-matrix). The current matrix:

| Component | Version |
|---|---|
| Compact devtools (`compact`) | 0.5.1 (our machine runs 0.5.2 — devtools are the manager; the compiler pin is the one to hold exactly) |
| Compact toolchain (`compact compile`) | **0.31.1** |
| Compact runtime | 0.16.0 |
| Compact JS / Platform JS | 2.5.1 / 2.2.4 |
| On-chain runtime (v3) | **3.0.0** |
| Midnight.js | **4.1.1** |
| Wallet SDK | **1.2.0** |
| Indexer | 4.3.5 (preview) / 4.3.3-hotfix (preprod, mainnet); our devnet pins indexer-standalone **4.3.3** — 4.3.4/4.4.0 are pre-alpha |
| Proof server | **8.1.0** |
| Node | 1.0.1 (preview) / 1.0.2 (preprod, mainnet); our devnet pins midnight-node **1.0.0** |

> **Story with a moral — the March pins.** This project's predecessor (March 2026) ran on compactc 0.29, midnight-js 3.1.0, indexer v3, proof-server 7.0.0. When we revived it six months later, *every one of those pins was dead*, and half the archived "workarounds" were fixes for bugs that no longer existed (one whole manual transaction-signing workaround — gone; a wallet-API singular/plural rename broke the rest). Worse, a fresh install *today* silently resolves `onchain-runtime-v3` to 3.1.0 (published after the matrix), which breaks against midnight-js 4.1.1's pinned 3.0.0 until you force an npm override (Module 4 tells that story in full). **Moral: the matrix is the only source of truth. Old notes — including ours — are patterns, not pins.** When notes and matrix disagree, the matrix wins.

## 2. Hands-on lab: bring up the stack and touch every piece

**Where:** the working devnet project at `apps/credvault/step0-hello/`. Everything below is real — outputs shown are from this repo's devnet.

### Lab 2.1 — Boot the devnet (or verify it's up)

```bash
cd /home/anthony/midnight/apps/credvault/step0-hello
docker compose up -d --wait
docker compose ps
```

Expected: three containers, all `(healthy)`:

```
step0-hello-node          Up ... (healthy)   0.0.0.0:9944->9944/tcp
step0-hello-indexer       Up ... (healthy)   0.0.0.0:8088->8088/tcp
step0-hello-proof-server  Up ... (healthy)   0.0.0.0:6300->6300/tcp
```

**What can go wrong:**
- *First run pulls several GB of images* — expect a few minutes.
- `port is already allocated` -> another devnet is running; `docker compose down` in that project first.
- Indexer keeps restarting -> it started before the node produced block 1. The template's healthchecks already handle this (the node is only "healthy" once block 1 exists, and the indexer `depends_on` that). Do not "simplify" those healthchecks — they encode a real failure mode.

### Lab 2.2 — Talk to the NODE (JSON-RPC)

```bash
# Health: is it producing blocks?
curl -s http://127.0.0.1:9944/health
# -> {"peers":0,"isSyncing":false,"shouldHavePeers":false}

# What chain is this?
curl -s -H 'Content-Type: application/json' \
  -d '{"id":1,"jsonrpc":"2.0","method":"system_chain","params":[]}' \
  http://127.0.0.1:9944
# -> {"jsonrpc":"2.0","id":1,"result":"undeployed1"}

# The node's own healthcheck: does block 1 exist yet?
curl -s -H 'Content-Type: application/json' \
  -d '{"id":1,"jsonrpc":"2.0","method":"chain_getBlockHash","params":[1]}' \
  http://127.0.0.1:9944
# -> {"jsonrpc":"2.0","id":1,"result":"0x<64 hex chars>"}
```

Note `"peers":0` — your devnet is a one-node network. It *is* the consensus. (On public networks `system_chain` returns `Midnight Preview` / `Midnight Preprod` / `Midnight Mainnet`.)

### Lab 2.3 — Talk to the INDEXER (GraphQL)

```bash
# Latest block height — run it twice, ~10 s apart. It grows ~1 block / 6 s.
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"query":"{ block { height } }"}' \
  http://127.0.0.1:8088/api/v4/graphql
# -> {"data":{"block":{"height":26245}}}

# Read the LIVE CredVault degree contract's state (deployed on this devnet):
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"query":"query Q($a: HexEncoded!) { contractAction(address: $a) { state } }",
       "variables":{"a":"c3b82a86c2b4fe3b2414caef250008731c79b45e93ec0edcca7faf2867325d92"}}' \
  http://127.0.0.1:8088/api/v4/graphql
# -> {"data":{"contractAction":{"state":"6d69646e696768743a636f6e74726163742d73746174655b76365d3a..."}}}
```

That hex blob is the contract's full ledger state — the roots and revocations of the live degree contract — encoded. (You can't read it by eye; in Module 4 you'll decode it with the compiled contract's `ledger()` function. The point today: the indexer hands your app the exact slice of chain it asked for, in milliseconds, with no wallet.)

### Lab 2.4 — Talk to the PROOF SERVER (HTTP)

```bash
curl -s http://127.0.0.1:6300/health
# -> {"status":"ok","timestamp":"2026-09-05 09:09:24.878100834 +00:00:00"}
```

That's the whole interface surface you need today: it answers, it's local, it's healthy. Your wallet/SDK will POST proof jobs to it later.

### Lab 2.5 — Compile and deploy hello-world end-to-end

```bash
cd /home/anthony/midnight/apps/credvault/step0-hello

# Toolchain check (matrix pins):
export PATH="$HOME/.local/bin:$PATH"
compact --version           # devtools: 0.5.2
compact compile --version   # compiler: 0.31.1

# Compile the contract -> contracts/managed/hello-world/{contract,keys,zkir}
npm run compile

# Deploy (builds wallet from genesis seed, syncs, registers DUST, deploys):
npm run deploy
```

Expected tail of a successful deploy:

```
  ✓ Synced with network.
  Wallet Address: mn_addr_undeployed1...
  Balance: 250,000,000,000,000 tNight        <- genesis pre-funded
  ...
  ✅ Contract deployed successfully!
  Contract Address: <64 hex chars>
  Saved to .midnight-state.json
```

Then run the instrumented driver for the full transaction loop with timings (Module 4 dissects this script line by line):

```bash
npx tsx src/step0-driver.ts
```

```
wallet address: mn_addr_undeployed1...
tNight: 250,000,000,000,000
DUST: <nonzero>
connected to contract: <address>
stored message. txId: 0x... block: <height>
read back: "CredVault says hello from the devnet"
=== STEP-0 BENCHMARKS (undeployed, proof-server 8.1.0) ===
wallet create + sync (restored): 0.5s
connect (findDeployedContract):   0.4s
storeMessage FULL TX LOOP:        20.0s
read (indexer query + decode):    <0.1s
```

**What can go wrong (the real table from our runbooks):**

| Symptom | Cause | Fix |
|---|---|---|
| `expected instance of StateValue` at callTx | Two onchain-runtime copies (3.1.0 + 3.0.0) | The `overrides` in package.json + `npm dedupe` — already applied in this repo; Module 4 explains it |
| `Not enough Dust` / `Insufficient Funds` | DUST still accruing | Wait ~1 block, retry (deploy.ts retries automatically) |
| Deploy hangs at "Checking proof server..." | proof-server container down | `docker compose up -d --wait` |
| Wallet shows 0 tNight on undeployed | devnet preset didn't mint | `docker compose down -v && npm run setup` |
| `compact: command not found` | PATH not reloaded | `export PATH="$HOME/.local/bin:$PATH"` |

### Lab wrap-up — the picture in your head now

You have personally verified: a node answering JSON-RPC (:9944), an indexer answering GraphQL (:8088), a proof server answering HTTP (:6300), a compiler producing ZK artifacts, and a wallet paying DUST to land a transaction in a block. That is the whole stack. There is no other piece.

## 3. Exercises

**Exercise 1 (network selection).** For each task, name the network and your reason: (a) iterating on a contract 50 times a day; (b) a demo to a partner next week that must survive your laptop closing; (c) final dress rehearsal before a money-handling launch; (d) launch day.

<details><summary>Solution</summary>

(a) `undeployed` — genesis-funded, zero friction, instant resets. (b) `preview` — public, persistent, shared infrastructure for early development; faucet-funded so nothing at risk. (c) `preprod` — the testnet that tracks mainnet most closely; the docs' own rule is "anything that fails there will fail in production." (d) `mainnet` — real NIGHT, ~12 h cNIGHT-to-DUST registration lead time, no faucet.

</details>

**Exercise 2 (DUST arithmetic).** You register a single 200-NIGHT UTXO. (a) What is its DUST cap? (b) Roughly how long to reach it? (c) At ~71 DUST/day per 100 NIGHT, about how much do you have after 24 h? (d) You then spend 100 of the NIGHT. What happens to the DUST?

<details><summary>Solution</summary>

(a) 5 DUST per NIGHT x 200 = **1,000 DUST cap**. (b) **~1 week** — time-to-cap is amount-independent (rate and cap both scale with N). (c) ~142 DUST (71 x 2 x 1 day). (d) The DUST capacity tied to the spent NIGHT **decays linearly to zero** at the same rate it accrued; the remaining 100 NIGHT keeps generating toward its own 500-DUST cap. DUST is never transferable, so you can't "move" it off the spent UTXO first.

</details>

**Exercise 3 (reading the matrix).** A teammate's fresh `create-mn-app` project has: compactc 0.31.1, midnight-js 4.1.1, wallet-sdk 1.2.0, proof-server **7.0.3** (their old laptop image), indexer-standalone **4.4.0**, and `onchain-runtime-v3` resolving to **3.1.0**. Find every problem and the fix.

<details><summary>Solution</summary>

1. **proof-server 7.0.3** — the whole 7.x line hangs during proof generation on Apple Silicon; the matrix pins **8.1.0**. Repin the image.
2. **indexer-standalone 4.4.0** — pre-alpha integration build, not a stable release; the devnet pin is **4.3.3** (public networks run 4.3.5 / 4.3.3-hotfix). Repin.
3. **onchain-runtime-v3 3.1.0** — published after the matrix; midnight-js 4.1.1 pins 3.0.0, and two WASM runtime copies break `instanceof` ("expected instance of StateValue"). Add `"overrides": {"@midnight-ntwrk/onchain-runtime-v3": "3.0.0"}` + `npm dedupe` until exactly one hoisted 3.0.0 remains.

</details>

**Exercise 4 (threat modeling the proof server).** A company proposes a *hosted* proof-server SaaS: "send us your proving jobs over TLS, never run Docker again." Name two distinct things that go wrong.

<details><summary>Solution</summary>

1. **Privacy collapse at the root**: the proof server receives your *secret inputs* — private state, coin ownership, witness values (e.g., the GPA inside a credential proof). A hosted service sees, in plaintext, exactly the data Midnight exists to hide. TLS only protects it in transit; the operator has it at the endpoint.
2. **Metadata + trust regression**: the operator learns who proves what, when, and for which contract (activity tracking), and you must trust their servers aren't logging, compromised, or subpoenaed. The entire architecture choice — proof server local on port 6300, listening only, phoning no one — exists to make this class of problem impossible by construction.

</details>

**Exercise 5 (indexer reasoning).** Your verifier portal suddenly returns "contract not found" for every request, but your friend says transactions are still landing on-chain. Give the most likely explanation and your first two diagnostic commands.

<details><summary>Solution</summary>

The chain is fine; the **indexer** (or your route to it) is down or wedged — reads go through the indexer, writes go to the node, so this exact split symptom means indexer trouble. Diagnostics: (1) `docker compose ps` (is `step0-hello-indexer` up/healthy?); (2) `curl -s -X POST -H 'Content-Type: application/json' -d '{"query":"{ block { height } }"}' http://127.0.0.1:8088/api/v4/graphql` (does GraphQL answer, and is the height advancing?). Then `docker compose logs indexer` — the classic cause is it started before block 1 existed and needs a `docker start` nudge (the template healthchecks prevent this; hand-rolled setups hit it).

</details>

**Exercise 6 (stretch — the roadmap).** Explain to a non-technical boss, in three sentences, what "Kūkolu (Federated Mainnet)" means for your launch risk.

<details><summary>Solution</summary>

Anything reasonable containing: mainnet is live but currently operated by a known set of ecosystem partners rather than fully decentralized community validators; that's a deliberate stability phase while the network hardens (later phases onboard community stake-pool operators and then full community block production); for our app it means production endpoints are real and stable, with the caveat that the validator set is permissioned today and decentralization is a roadmap item, not a launch blocker.

</details>

## 4. Checkpoint quiz

1. **Name the three services a Midnight DApp talks to, and the local port of each.**
   *Answer:* Node :9944 (JSON-RPC), indexer :8088 (GraphQL, `/api/v4/graphql`), proof server :6300 (HTTP).
2. **Which of those three must be local even when you target mainnet, and why?**
   *Answer:* The proof server — it receives your private data (witness values, private state) to build ZK proofs; running it remotely would hand your secrets to a third party.
3. **True or false: `undeployed` means your contract is not deployed.**
   *Answer:* False. It's the network ID of the local Docker devnet. Contracts deploy to it like any network; wallet addresses there carry the `mn_addr_undeployed` prefix.
4. **What does the indexer add over the node, and how do apps talk to it?**
   *Answer:* A query-optimized, decoded view of every block (contract states, transactions, block data), served over GraphQL (HTTP queries + WebSocket subscriptions). The node is consensus-optimized append-only storage; apps never query it directly for state.
5. **DUST in one sentence: what is it, what creates it, and what destroys it?**
   *Answer:* A shielded, non-transferable fee *resource* (not a token) that registered NIGHT generates over time (cap 5 DUST/NIGHT, ~1 week to full), consumed by every transaction, and it decays to zero when the backing NIGHT is spent.
6. **Blocks arrive about every ___ seconds, produced by ___ (round-robin) and finalized by ___.**
   *Answer:* 6; AURA; GRANDPA.
7. **Your deploy fails with `Not enough Dust` on a fresh devnet. What's almost always wrong, and what's the fix?**
   *Answer:* DUST hasn't accrued yet (fee capacity lags by about a block on a fresh chain). Wait ~one block-time and retry — this is why our deploy script retries the balancing step automatically.
8. **Where is the authoritative list of which component versions work together, and what beats what when sources disagree?**
   *Answer:* The compatibility matrix (`docs/relnotes/support-matrix.mdx` / docs.midnight.network/relnotes/support-matrix). When old notes and the matrix disagree, the matrix wins.
9. **Which roadmap phase is mainnet in, and who produces its blocks?**
   *Answer:* Kūkolu — the federated phase; ecosystem partners run the validators. (Mōhalu onboards community SPOs; Hua is full decentralization.)
10. **Why does `compact --version` not tell you your compiler version?**
    *Answer:* `compact` is the devtools *manager* (0.5.x) that installs and selects compilers; the compiler (`compactc`) is versioned separately — check it with `compact compile --version` (matrix pin: 0.31.1).

## Agent teacher notes

**Pacing.** Budget ~2 h for concepts, ~2 h for the lab (more if Docker images need pulling — start Lab 2.1 first and teach concepts during the pulls). The concepts in section 1.6 (NIGHT/DUST) and section 1.8 (version discipline) repay slow reading; section 1.3 (node internals) can go fast — say explicitly "this is the light-touch section; you will not be quizzed on GRANDPA mechanics."

**Check understanding before advancing.** Before starting the lab, ask the student to draw the three-service diagram from memory and label the ports. If they can't, re-teach section 1.1 — everything downstream depends on it. After the lab, ask: "Which piece was involved when the driver printed `read back` in under 0.1 s?" (The indexer.) "And which pieces were involved in the 20 s `storeMessage` loop?" (All three: local execution + proof server + node, with the indexer confirming finalization.)

**Common misconceptions to kill on sight.**
- *"DUST is a token you buy."* No — it's a non-transferable resource NIGHT generates. You cannot buy, sell, or send it. Students who bring Ethereum gas intuitions get this wrong for weeks.
- *"I need to run a node to build."* No — section 1.7. Some students burn a day here; catch it early.
- *"The indexer is the chain."* No — it's a read replica with a nice API. The Exercise 5 scenario (writes work, reads fail) is the perfect probe of this.
- *"Proof server = someone's server."* The name is unfortunate. It's *your* local process; "server" only means "listens on a port."
- *"`undeployed` is a status."* It's a network name. Point at the `mn_addr_undeployed1...` address from the lab as proof.
- *"Any recent versions work together."* The matrix exists precisely because they don't. The onchain-runtime 3.1.0 story makes this concrete — tell it.

**FAQ answers ready.**
- *"Why is my transaction taking 20 seconds?!"* Normal. Small-circuit transactions are fixed-overhead dominated: proving ~2 s, the rest is balancing, submission, and waiting for block inclusion/finality. Our benchmarks: deploy 21.5 s, anchor 22.1 s, revoke 24.8 s. Reads are the fast part (0.1 s).
- *"Can the proof server see my secrets?"* Yes — by design, locally. That's why it's on localhost and why we never expose it.
- *"Do I need NIGHT on the devnet?"* No — the genesis wallet is pre-funded and pre-registered.
- *"Why did `system_chain` return `undeployed1`?"* That's the dev chain's internal name; public networks answer `Midnight Preview` etc.
- *"Is mainnet real yet?"* Yes — live, in the federated (Kūkolu) phase, with real value; there's just no faucet and DUST registration takes ~12 h.

**Let them struggle vs. help.** Let them struggle with: the curl commands (typing GraphQL by hand teaches the API shape), the `Not enough Dust` retry (it's the best first failure — self-healing and diagnostic-rich), and reading `docker compose ps` output. Help immediately with: anything involving version pins (give the matrix; guessing versions is misery), Docker daemon not running, and PATH issues (`export PATH="$HOME/.local/bin:$PATH"`).

**Advance when:** the student can (1) draw the stack diagram with ports from memory, (2) explain NIGHT-to-DUST-to-fees in their own words, (3) bring the devnet up unaided and verify all three health endpoints, and (4) state the current compiler/SDK/proof-server pins without looking. Then Module 3 (the Compact language) is safe ground.

## References

**This repo (ground truth):**
- `apps/credvault/step0-hello/docker-compose.yml` — the devnet, with the version-drift warnings in comments (why indexer stays 4.3.3, proof-server 8.1.0)
- `apps/credvault/step0-hello/src/step0-driver.ts` — the instrumented full-loop driver
- `apps/credvault/step0-hello/src/deploy.ts` — DUST registration, retries, proof-server polling
- `apps/credvault/step1-degree/src/network.ts` — one `NetworkConfig` with per-network presets (`undeployed`/`preview`/`preprod`)
- `apps/credvault/ARCHITECTURE.md` section 8 (environment strategy + current matrix), section 13 (Step-0 benchmarks + workaround obsolescence)
- `apps/credvault/docs/step0-aws-devnet-runbook.md` — full provisioning runbook + troubleshooting table

**Reference repos:**
- `midnight-docs/docs/guides/networks-and-environments.mdx` — the four networks, endpoints, funding, mainnet checklist — https://docs.midnight.network/guides/networks-and-environments
- `midnight-docs/docs/relnotes/support-matrix.mdx` — **the compatibility matrix** — https://docs.midnight.network/relnotes/support-matrix
- `midnight-docs/docs/tokens/overview.mdx` — NIGHT/DUST, STAR/SPECK, shielded vs unshielded — https://docs.midnight.network/tokens/overview
- `midnight-docs/docs/concepts/dust-architecture.mdx` — generation/decay math, the solar-panel analogy — https://docs.midnight.network/concepts/dust-architecture
- `midnight-docs/main_versioned_docs/version-0.0.0/operate/network-architecture/consensus.mdx` — AURA + GRANDPA, validator selection
- `midnight-docs/blog/2026-01-27-testnet-02-transition.mdx` — Hilo/Kūkolu/Mōhalu/Hua phases — https://docs.midnight.network/blog/testnet-02-transition
- `midnight-docs/docs/guides/run-proof-server.mdx` — proof server is local by design — https://docs.midnight.network/guides/run-proof-server
- `midnight-docs/docs/tutorials/leaderboard/browser-dapp.mdx` — the `contractAction` GraphQL query shape in the wild
