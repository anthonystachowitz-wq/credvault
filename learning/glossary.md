# CredVault Course Glossary

> Every term used in the course, in one sentence each, jargon-free.
> If a definition uses another capitalized term, that term has its own entry.
> Terms are grouped by theme and alphabetized within each group.

---

## 1. Everyday web & computing

**API** — A fixed set of URLs or functions a program offers so other programs can request things from it.

**CLI (command-line interface)** — A program you operate by typing commands into a terminal instead of clicking buttons.

**CSV** — A plain-text table where each line is a row and commas separate the columns, and the format school record systems export natively.

**Environment variable** — A named setting the operating system hands to a program at launch, commonly used for endpoints and secrets.

**HTTP status code** — The three-digit number on every web response that says how it went (200 = OK, 404 = not found, 422 = well-formed but the answer is 'no').

**JSON** — A text format for structured data (objects, lists, strings, numbers) that every modern programming language can read.

**localStorage** — A small named storage area each browser gives each website that survives closing the tab, which the holder app uses for its on-device package store.

**Port** — A numbered door on a machine where one specific service listens for network connections (the portal listens on 4050).

**PWA (Progressive Web App)** — A website plus a manifest and a service worker, which together let a phone install it and run it like a native app.

**QR code** — A square barcode that encodes a short string (here, a share URL) so any camera can read it.

**Service worker** — A small script the browser runs between a web app and the network, enabling caching and offline loading of the app shell.

**Subprocess** — A separate program launched by another program, with its own lifetime and output streams — how the portal runs batches without risking itself.

**TTL (time to live)** — An expiry time after which stored data is automatically discarded, used by the presentation drop and by Midnight intents.

**Web manifest** — A small JSON file that tells a phone a web app's name, icon, and start page so it can be installed to the home screen.

---

## 2. Blockchain basics

**Address** — A public string identifying an account, safe to share (you paste yours into the faucet).

**Block** — A batch of transactions the network confirms together in one step.

**Blockchain** — A shared, append-only ledger maintained by many computers that everyone can check and no one can quietly rewrite.

**Devnet** — A private blockchain running on your own machine for development; Midnight calls this network 'undeployed'.

**Faucet** — A website that dispenses free, valueless test tokens for development networks, rate-limited on purpose.

**Finality** — The moment a transaction becomes permanently part of the chain and cannot be reversed.

**Gas / fee** — The payment a transaction must include to be processed; on Midnight, fees are paid in DUST.

**Genesis seed** — The pre-funded wallet built into the local devnet so you never need a faucet while developing.

**Indexer** — A service that reads the chain and answers structured queries about contract state in milliseconds.

**Ledger / ledger state** — The current contents of a contract's on-chain storage (for us: the validRoots set, the revoked set, the authority key).

**Mainnet** — The real production network, where tokens have actual value.

**Network** — A complete 'answering machine' for a chain — node RPC plus indexer plus proof server — selected here by one config preset.

**Node** — A computer running the blockchain software itself, relaying and validating transactions.

**Preprod** — The hosted test network that tracks mainnet's behavior, used for dress rehearsals (our pilot target).

**Preview** — The hosted test network meant for early experiments with new releases.

**Smart contract** — A program stored on the chain whose rules everyone can verify and no one can bypass (ours: degree.compact).

**Testnet** — Any network whose tokens are valueless, used for testing.

**Token** — A digital asset held by accounts on a chain.

**Transaction (tx)** — A signed instruction to the chain — deploy, anchor, revoke — that changes ledger state.

**Undeployed** — Midnight's name for the local Docker devnet used throughout the course.

**Wallet** — Software that holds your keys and submits transactions on your behalf; on preprod its entire identity is one recovery phrase.

---

## 3. Cryptography building blocks

**Commitment** — A sealed envelope for a value: it hides the contents but binds you to them, so you can later prove exactly what was inside.

**Digital signature** — A proof made with a secret key that a particular party approved a particular message, checkable by anyone.

**Domain separation** — Giving every hashed purpose its own label (like 'credvault:course:') so values from different purposes can never collide or be linked.

**Hash function** — A one-way blender turning any input into a fixed-size fingerprint that cannot be reversed or forged second-hand.

**Leaf** — One item's hash at the bottom of a Merkle tree.

**Merkle path (Merkle proof)** — The short list of sibling hashes that proves one item belongs to a tree without revealing the other items.

**Merkle root** — The single top hash of a Merkle tree; anchoring it anchors every item underneath at once.

**Merkle tree** — A pyramid of hashes built over many items so that one root hash can stand for the whole set.

**Nullifier** — A unique, unlinkable tag derived from a secret that lets a system detect reuse without learning anyone's identity.

**Salt** — Random bytes mixed into a hash or commitment so identical inputs produce different, unlinkable outputs (and brute-forcing becomes hopeless).

**SHA-256** — The specific hash function CredVault uses, producing 32-byte fingerprints.

---

## 4. Zero-knowledge proofs & Midnight

**BIP-39 / recovery phrase** — The 24 words from which a wallet's keys are derived; anyone holding them controls the wallet.

**Circuit** — The fixed set of checks a zero-knowledge system can prove, expressed as constraints on values (our three: addCohortRoot, revokeCredential, verifyMinGPA).

**Compact** — Midnight's smart-contract language, which compiles to ZK circuits plus a TypeScript twin.

**Constraint** — One equation a circuit enforces; more constraints mean slower proving, which is why big documents are hashed off-circuit.

**disclose()** — Compact's explicit 'I certify this value is safe to publish' marker, required before witness-derived data may be written to the ledger.

**DUST** — The fee-paying resource that accrues automatically to NIGHT holders over time, even while their server is off.

**Intent** — The fragment of a transaction a contract call produces before fees and balancing are added; intents carry the ~1-hour TTL submission window.

**Lace** — Midnight's browser wallet; recovery phrases generated by our tooling restore the identical wallet in it.

**Midnight.js** — The TypeScript SDK used to deploy contracts, call them, and read chain state.

**NIGHT** — Midnight's token; holding it is what generates DUST.

**onchain-runtime** — The WASM engine that executes ledger logic inside our process; exactly one copy of it may exist at a time.

**persistentCommit** — Compact's hide-a-value commitment (SHA-256 with randomness), whose output is safe to store on-chain.

**persistentHash** — Compact's binding fingerprint: it ties you to a value but does NOT hide it, so it is for public keys and nullifiers, not secrets.

**Private state** — Off-chain data a contract's witnesses read at call time, stored locally and never published.

**Proof server** — The local service that turns private data into ZK proofs; it is the only component that ever sees witness data, so it stays on private infrastructure.

**Proving key / verifier key** — The pair of public parameters, one per circuit, used to create and to check proofs (compiled into contracts/managed/.../keys).

**Provider** — One of the pluggable service connections Midnight.js needs: indexer, proof server, wallet, private state, and ZK-config.

**Seed** — The master secret bytes derived from a recovery phrase; the seed is the wallet.

**tblock** — The 'current time' argument you pass when validating a transaction locally; the TTL check reads this clock, not your wall clock.

**tNIGHT** — Valueless test-network NIGHT dispensed by the faucet.

**wellFormed** — The ledger's local validity check for a transaction (proofs, signatures, TTL, balancing), the heart of off-chain L2 verification.

**Witness (ZK)** — The private input fed to a circuit at proving time — for example, the real GPA and its salt.

**Witness taint** — The Compact compiler's tracking of secret-derived data, which forces an explicit disclose() before such data may touch the ledger.

**Zero-knowledge proof (ZKP)** — A proof that a statement is true that reveals nothing beyond its truth — here, 'GPA ≥ 3.50' without the GPA.

**ZKIR** — The compiler's intermediate circuit format emitted into contracts/managed/, between Compact source and prover keys.

**Zswap** — Midnight's shielded-token machinery for private value transfer (deliberately out of scope for this course).

---

## 5. CredVault terms

**Aggregate-only telemetry** — The rule that any issuer-facing statistics are counts ('137 verifications this month'), never per-event detail.

**Anchor (v) / anchor (n)** — To write a 32-byte root or credential ID on-chain; the value so written, which is all the chain ever stores.

**Anti-cherry-picking** — The guarantee that all revealed courses converge to ONE sub-root, so courses from different credentials cannot be stitched together.

**Authority key** — The public key sealed into the contract at deploy that gates anchor and revoke transactions to the issuer alone.

**Auto-premint** — The portal's automatic premint run chained after every successful batch job, so packages are immediately shareable with thresholds.

**Batch** — One issuer run that commits a whole cohort and anchors it in a single transaction, regardless of cohort size.

**Bundle** — A multi-credential envelope (Step-3 concept): independent presentations, each verified against its own issuer's anchor.

**Cohort** — A batch of credentials issued together (a graduation class, a renewal cycle), sharing one Merkle root.

**Credential package (package)** — The holder's full private inventory: field values, salts, Merkle paths, pre-minted proofs, and the contract address.

**credId** — The hash of a master leaf; the credential's unique identifier, and what revocation targets.

**Deploy-with-capture** — CredVault's deploy that also saves the proven deploy transaction to disk so verifiers can replay it later.

**Deploy replay** — Rebuilding a ledger state locally by re-applying the captured deploy transaction, which restores the verifier keys other state sources drop.

**Descriptor** — The hash-pinned JSON (Step-3 concept) that will tell the universal apps how to display and verify any schema's credentials.

**Deterministic salt (kdfSalt)** — A salt derived from issuer secret + record ID + field, so re-running an unchanged batch reproduces bit-identical commitments.

**Generator** — The Step-3 machine that turns a Verification Schema into a contract plus its off-chain runtime twin, from one intermediate representation.

**Granular mode** — The transcript commitment style that allows per-course subset disclosure via a course sub-tree.

**Historic roots** — The never-remove property of validRoots that keeps old packages valid across all later batches.

**Holder** — The person who carries and presents credentials (a student, a licensee) and never touches keys, tokens, or transactions.

**Idempotent batch** — A batch that is a no-op when nothing changed: the root is already anchored, packages keep their proofs, premint skips.

**Invisible blockchain** — The design goal that no end user ever sees blockchain-shaped anything; value is felt as a fast, free, accountless check.

**Issuer** — The organization that creates credentials and anchors them (a university, a licensing board) and holds all the data.

**Issuer console** — The registrar's web app: CSV in, one anchor transaction, package links out, and a revoke button.

**Issuer runtime** — The issuer's batch tool: ingest a cohort, compute commitments, build the tree, anchor, and write packages.

**Issuer secret** — The secret, held only by the issuer runtime, from which the authority key derives; on-chain, it IS the issuer.

**Job (portal)** — A tracked subprocess (batch or revoke) whose streamed log the console polls until it finishes.

**L1 (instant degree check)** — The basic verification level: anchored and not revoked, with nothing else revealed.

**L2 (threshold proof)** — The verification level that adds a ZK proof that a hidden number clears a public bar.

**L3 (full verified transcript)** — The verification level where all values are revealed and recompute-checked against the anchor.

**Magic link** — The planned one-tap package download link for holders; in the MVP the package URL plays this role.

**Master leaf** — The single commitment that binds all of one credential's fields into one Merkle leaf, which is what makes fields un-swappable.

**Monolithic mode** — The transcript commitment style that seals the whole document as one blob for all-or-nothing verification.

**Package format version** — The label (e.g., 'credvault-degree/0.3') that lets data contracts evolve without breaking older packages.

**Pre-minted proof** — An L2 proof generated at issuance time so that verification later is instant, free, and needs no issuer uptime.

**Presentation** — The possibly-redacted bundle a holder actually shares with a verifier, assembled from the package at share time.

**Presentation cache** — The student's role in the distribution model: holding packages for instant, offline-capable, private presentation.

**Presentation drop (TTL drop)** — The portal's short-lived in-memory cache used only to hand a bundle from holder to verifier; it is not a store.

**Prompt-revocation duty** — The flag for issuers (like license boards) whose runtime must stay reachable because revocation cannot wait for a batch window.

**Recompute-and-compare** — The verification method for revealed data: rebuild the hashes and check equality — no ZK proof needed, works at any size.

**Rectification** — The correction flow: fix the record at the source, re-anchor, and revoke the old credId; history is never rewritten.

**Registry** — The planned public directory mapping schemas and issuers to contract addresses, which becomes the apps' trust root.

**Revoked set** — The contract's on-chain set of revoked credIds, always checked against current chain state at verification time.

**Revocation** — The issuer's on-chain declaration that a credential ID is no longer valid.

**Selective disclosure** — Revealing exactly the chosen fields while keeping the rest sealed yet still verifiable.

**Share-sheet** — The holder app's disclosure screen: pick courses, optionally hide the GPA, pick a threshold, create the QR.

**SIS (student information system)** — The school's records system (Banner, PeopleSoft, Workday, PowerSchool), whose CSV/API exports feed onboarding.

**Stateless verifier** — The rule that the portal recomputes, renders, and discards: no credential database, and the only read is public chain state.

**System of record** — The authoritative copy of credential data (the school's SIS), as opposed to the student's presentation cache.

**Tamper-evidence** — The property that changing even one character of a value breaks the commitment match and reads TAMPERED.

**Threshold proof** — A ZK proof of 'value ≥ bar' that reveals nothing about the value itself.

**Universal apps** — The verifier portal, holder PWA, and issuer console, built once and serving every issuer type forever.

**validRoots** — The contract's on-chain set of every cohort root ever anchored; membership here is what 'anchored' means.

**Verdict** — The machine-readable outcome of a verification: VERIFIED, TAMPERED, REVOKED, UNKNOWN_ANCHOR, CONTRACT_NOT_FOUND, L2_INVALID, or L2_UNAVAILABLE.

**Verification Schema** — The versioned description of a credential type — fields, provable rules, modes, policies — that the generator consumes.

**Verifier** — The person or service that checks a presentation (an employer, a hospital), with no account and no fees.

**verify-core** — The single shared verification implementation behind the CLI, the HTTP service, and the portal.

---

## 6. Operations & tooling

**Deploy proof (deploy-proof.bin)** — The serialized, proven deploy transaction saved at deploy time and replayed during L2 verification; it is bound to the network it was captured on.

**Deployment record (deployment.json)** — The small file caching the current contract address and deploy timestamp; a cache of chain truth, safe to regenerate.

**Idempotence** — The property that running the same operation twice is safe and cheap because unchanged inputs produce identical results.

**Network config** — The single object holding all endpoints plus the network ID, with presets for undeployed, preview, and preprod.

**npm overrides / dedupe** — Package-manager tools that pin one dependency version and collapse duplicates; our defense against the two-WASM-runtimes failure.

**Runbook** — A step-by-step operational procedure written to be followable under pressure (the docs/ folder is full of them).

**State file (.midnight-state.json)** — The owner-read-only file holding per-network wallets and deployments; precious, because the wallet seed inside it is the wallet.

**Support matrix** — Midnight's official compatibility table pinning which compiler, SDK, indexer, proof server, node, and ledger versions work together.
