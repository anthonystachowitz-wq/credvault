# CredVault Step 3 — Apps-Layer Architecture

> **Schema-parameterized universal apps & multi-credential holders.**
> Status: DESIGN (2026-09-06). Builds on Steps 1–2c (ARCHITECTURE.md §13–17),
> MVP.md, schemas/college-degree.yaml, and the user's reverse-engineered issuer
> questionnaire model. Companion to — not a replacement for — ARCHITECTURE.md.

---

## 0. TL;DR — the seven decisions

1. **One App Descriptor is the whole contract between the generator and the apps.**
   The generator turns a Verification Schema (YAML, authored via questionnaire)
   into a **descriptor** (JSON, hash-pinned, registry-served). All three apps are
   pure functions of (descriptor × package/presentation). No app ever contains
   per-issuer or per-schema code. New schema = new descriptor, never a new app.
2. **The questionnaire model maps onto three schema element kinds** —
   *direct-match variables → value fields*, *conditional variables → metric
   fields* (uint + operator + criteria), *multiple-match sets → sets* (granular
   = individual verification, monolithic = group verification). The current
   college template is the special case: 3 value fields, 1 metric (gpa), 1 set
   (courseGrades).
3. **One universal contract template covers 100% of the questionnaire model.**
   The Step-1 anchor core (validRoots / revoked / authority) plus ONE generic
   range circuit (op → [min,max]) serves every value field, every uint
   threshold, and both set modes — because anchors are opaque roots (§14, §17).
   Per-issuer "generation" in v1 = descriptor + issuer config + a DEPLOYMENT of
   the audited template with the issuer's authority sealed. Custom-generated
   Compact (March-DSL composites: AND/OR/NOT/THRESHOLD predicates, hidden-bound
   ranges, string equality-in-ZK) is a v2 seam that plugs into the same app
   interface — and this time the off-chain twin is specified first (§13).
4. **Multi-credential = a bundle of independent presentations.** A bundle is a
   typed envelope of N single-credential presentations, each with its own
   schemaRef, contract address, and disclosure decisions. Each item is verified
   against ITS issuer's anchor; the envelope adds no cross-credential crypto
   (v1). Overall verdict: VERIFIED / PARTIAL / FAILED, per-item verdicts always
   shown.
5. **A CredVault issuer registry becomes the trust root.** Today the issuer name
   and contract address travel inside the (self-asserted) package. Multi-issuer
   makes that unsafe: verify-core cross-checks presentation.contractAddress
   against the registry entry for that schemaRef and renders issuer identity
   FROM THE REGISTRY. New verdict: REGISTRY_MISMATCH.
6. **QR size stays constant at any bundle size.** The QR always encodes only a
   short TTL-drop URL (~90 chars). Payloads (3.5 KB single → ~80 KB 3-cred
   bundle with 100-item sets) travel via POST to the presentation drop. Caps:
   2 MB body, 1 MB per drop entry, 100 MB drop store with TTL + LRU.
7. **The invisible-blockchain bar is a copy rule, not a feature.** A banned/
   allowed vocabulary table (§11) applies to every string the wizard, holder
   app, and verify page emit. The wizard never shows a key, hash, or the word
   "blockchain"; the issuer sees "anchored", "sealed", "operations balance".

---

## 1. Inputs: the issuer questionnaire → schema model

The issuer-facing questionnaire (user's model, Penn State example) reverse-
engineers to exactly three element kinds. This mapping is the generator's job;
the apps only ever see the OUTPUT (the descriptor, §3).

| Questionnaire answer | Schema element | Example (Penn State) |
|---|---|---|
| **1. Direct Match Variables** — how many, names | `fields[]` with `kind: value` | 3: fullName, degree, gpa |
| **2. Conditional Variables** — count, operator (> < >= <=), number format, variable, match criteria (multiple allowed) | `fields[]` with `kind: metric` + `predicates { operators, scale, premint[] }` | 1: gpa, >=, format x.xx → scale 100, criteria [>=3.00, >=3.50] |
| **3. Multiple-Match Variable Sets** — total sets ≤ 100; per-set vars | `sets[]` with `itemFields[]`, `maxItems ≤ 100` | 1 set × 4 vars: courseCode, courseTitle, credits, grade |
| → Option 1: each item individually verifiable | `set.mode: granular` (per-item sub-tree) | per-course subset disclosure |
| → Option 2: items verified as a group | `set.mode: monolithic` (docCommit blob) | whole-transcript seal |
| **Also required: multi-credential holders** | bundle envelope + holder store v2 | doctor: degree + license + … |

Design generalizations over the current college template:

- **Any number of value fields** (not just fullName/degree). Leaf layout is a
  declared ordered list (§3.4), not hardcoded.
- **Any number of metric fields.** Each is a `Uint<64>` commitment in the
  Compact-compatible layout (persistentCommit, §15) so one commitment serves
  L1 tamper-evidence AND L2 predicates. Number format → scale (x.xx → ×100;
  Compact has no floats — comparisons on Uint only, per §3 gotchas).
- **Any number of sets, mode PER SET** (today transcriptMode is per-schema).
  `maxItems` up to 100 → dynamic-depth sub-tree (current buildTree is
  nextPow2-dynamic: 100 items = 128-leaf tree, 7-level paths). Multiple sets
  are domain-separated at the leaf hash (§4.2).
- **Multiple criteria per metric** are pre-minted at issuance (today: 3.00 and
  3.50); novel criteria are on-request (issuer runtime profile, §5).

---

## 2. Architecture overview

```
 ISSUER SIDE                          CREDVAULT PLATFORM                    USER SIDE
┌──────────────────┐   publishes   ┌────────────────────────────┐
│ Issuer runtime   │──────────────▶│ Registry (public, no PII): │
│ (batch anchor,   │  registry     │  • schema descriptors      │
│  premint, revoke)│  entry        │  • issuer entries: id,     │
│        │         │               │    displayName, contract   │
│ holds ALL data   │               │    addresses, deploy       │
└──────────────────┘               │    captures, status        │
                                   └──────────┬─────────────────┘
                                              │ serves
                     ┌────────────────────────┼─────────────────────────┐
                     ▼                        ▼                         ▼
              ┌────────────┐          ┌──────────────┐          ┌──────────────┐
              │ Holder PWA │  drop    │ Verify portal│  config  │ Issuer       │
              │ (store v2, │─────────▶│ (verify-core │◀─────────│ console      │
              │  bundles,  │  bundle  │  engine,     │  +batch  │ (wizard,     │
              │  QR share) │          │  renderer)   │   jobs   │  CSV mapping)│
              └────────────┘          └──────┬───────┘          └──────────────┘
                                             │ indexer reads ONLY
                                      ┌──────▼───────┐
                                      │ Chain: per-  │
                                      │ issuer       │
                                      │ deployments  │
                                      │ of ONE       │
                                      │ template     │
                                      └──────────────┘
```

**Three artifacts parameterize everything:**

| Artifact | Produced by | Consumed by | Integrity |
|---|---|---|---|
| **Verification Schema** (YAML, `credvault-schema/1.0`) | issuer questionnaire (wizard) | generator | reviewed by issuer at preview step |
| **App Descriptor** (JSON, `credvault-descriptor/1.0`) | generator (schema → descriptor) | all three apps + verify-core | `schemaRef.hash` = sha256 of canonical descriptor; apps verify before use |
| **Issuer registry entry** (JSON, `credvault-issuer/1.0`) | issuer runtime at deploy | verify-core + verify UI + holder import | CredVault-signed (v2: transparency log) |

**Data-custody invariants (unchanged, restated for the apps layer):**

- Chain holds anchors only (validRoots, revoked credIds, sealed authority). No PII, ever.
- CredVault holds no PII: the drop is a TTL cache for QR handoff; bundles are
  processed transiently and discarded; audit log = hashes/IDs only (MVP.md rules).
- The issuer is the system of record; the holder is a presentation cache.
- Holders and verifiers generate ZERO transactions — reads and off-chain proof
  verification only. Issuers batch: one tx per cohort, any size.
- One canonical hashing library (cv-core schemes, §4.2) used identically by
  issuer runtime, holder app, and verify-core — the March hash-mismatch class
  of bug stays structurally impossible.

---

## 3. The App Descriptor (the generator ↔ apps contract)

The descriptor is the ONLY thing the apps know about a schema. Full college-
degree instance in Appendix A; field-by-field spec here.

### 3.1 Shape

```json
{
  "descriptorType": "credvault-descriptor/1.0",
  "schemaId": "college-degree",
  "schemaVersion": "1.0.0",
  "displayName": "College Degree Verification",
  "issuerType": "university",
  "display":  { "...": "see §3.3" },
  "fields":   [ { "...": "value | metric fields, see §3.2" } ],
  "sets":     [ { "...": "multi-match sets, see §3.2" } ],
  "leafLayout": ["field:fullName", "field:degree", "field:gpa", "set:courseGrades"],
  "issuerRuntime": { "mode": "batch", "revocationCadence": "batch", "novelProofs": "on-request" },
  "contract": { "template": "credvault-anchor-core/1", "predicateSupport": "universal-range-v1" },
  "fees": { "enabled": false }
}
```

### 3.2 Element kinds (the renderer + verifier dispatch table)

**(a) `kind: value` — direct-match variable.**

```json
{ "name": "degree", "label": "Degree", "kind": "value", "type": "string",
  "scheme": "canonical-field/v1",
  "disclosable": ["reveal", "equality"],
  "defaultDisclosure": "reveal" }
```

- `scheme` names a registered commitment scheme (§4.2) — strings use
  `canonical-field/v1` (our SHA-256 fieldCommit).
- `equality` is reveal-then-compare in v1 (the verifier sees the value — that
  IS how employers check a degree match); hidden equality-in-ZK is a v2
  generated circuit, declared here so the seam exists.
- Holder control: show / seal checkbox. Verify render: label+value row, or a
  "SEALED by holder" pill.

**(b) `kind: metric` — conditional variable.**

```json
{ "name": "gpa", "label": "GPA", "kind": "metric", "type": "uint",
  "scale": 100, "format": "x.xx",
  "scheme": "compact-commit-uint64/v1",
  "disclosable": ["reveal", "threshold", "range"],
  "predicates": {
    "mechanism": "universal-range-v1",
    "operators": [">=", "<=", "=="],
    "premint": [ {"op": ">=", "value": 300}, {"op": ">=", "value": 350} ]
  },
  "defaultDisclosure": "reveal" }
```

- `scale` comes from the questionnaire's number format (x.xx → 100). All
  rendering divides by scale; all commitments use the scaled uint.
- `mechanism: universal-range-v1` — the generic circuit (§5.2). op+value are
  mapped to [min,max] bounds by cv-core:
  `>= t → [t, 2⁶⁴−1]`, `<= t → [0, t]`, `> t → [t+1, 2⁶⁴−1]`,
  `< t → [0, t−1]`, `== t → [t, t]`. (`!=` = two range proofs — v2.)
- `premint` = the questionnaire's "match criteria (multiple allowed)". The
  issuer runtime pre-mints one proof per criterion at batch time (~2 s each,
  off-chain, §15 cost model).
- Holder control: THREE-WAY — show value / prove a cutoff (dropdown of
  pre-minted criteria; novel = on-request note) / seal.
- Verify render: value row, or SEALED pill, or green pill
  "GPA ≥ 3.50 — proven, value never shared".

**(c) `sets[]` — multiple-match variable sets.**

```json
{ "name": "courseGrades", "label": "Courses",
  "mode": "granular",
  "maxItems": 100,
  "itemScheme": "canonical-setitem/v1",
  "docScheme": "canonical-doc/v1",
  "canonicalSort": ["courseCode"],
  "itemFields": [
    { "name": "courseCode",  "label": "Code",   "type": "string" },
    { "name": "courseTitle", "label": "Title",  "type": "string" },
    { "name": "credits",     "label": "Cr",     "type": "uint"   },
    { "name": "grade",       "label": "Grade",  "type": "string" } ],
  "itemDisplay": "{{courseCode}} — {{courseTitle}} ({{grade}})" }
```

- `mode: granular` (Option 1): per-item sub-tree; holder picks ANY subset;
  verifier recomputes each revealed item's path and requires convergence to
  ONE sub-root (anti-cherry-picking, §16). Render: revealed-items table +
  "…N more SEALED by the holder".
- `mode: monolithic` (Option 2): whole set as one canonical doc blob;
  all-or-nothing. Render: full table, or — if the holder attempts a subset —
  the honest refusal (§17): "this issuer verifies the document as a whole".
- `itemDisplay` is a template for holder-side pickers; `canonicalSort`
  defines the order-independent canonical doc form for monolithic mode.

### 3.3 Display block (drives ALL app chrome)

```json
"display": {
  "icon": "🎓",
  "cardTitle": "{{fields.degree}}",
  "cardSubtitle": "{{issuer.displayName}} · {{cohort}}",
  "verifyTitle": "{{fields.fullName}}",
  "verifySubtitle": "{{fields.degree}} — {{fields.university}}"
}
```

Templates interpolate over REVEALED field values + registry issuer metadata.
Sealed fields render as the SEALED pill even inside templates (never blank).
This is how one holder app renders a degree card and a license card with zero
per-schema code — the schema author designs the card.

### 3.4 leafLayout (the binding spec)

Ordered slot list; each slot is `field:<name>` (that field's commitment) or
`set:<name>` (sub-root or docCommit). The master leaf is:

```
masterLeaf = H("credvault:leaf:" || slot₀ || slot₁ || … || slotₙ || masterSalt)
credId     = H("credvault:credid:" || masterLeaf)
```

Same shape for every holder, any set sizes — the size rule (schema yaml) is
enforced by the generator's validator: no slot ever contains raw document
bytes, only 32-byte commitments.

### 3.5 Descriptor integrity

`schemaRef.hash = sha256(canonicalJSON(descriptor))`. Packages pin
`schemaRef {id, version, hash}`. Holder app and verify-core FETCH the
descriptor from the registry and RE-HASH it before use — a compromised portal
can mislabel nothing (a mismatched descriptor is rejected with
DESCRIPTOR_MISMATCH). Descriptors are immutable per (id, version); rule
changes mint a new version (§7).

---

## 4. Data formats v1.0

Generalizing `credvault-degree/0.3` (the working format) to N fields / M sets
/ K predicate proofs. cv-core keeps a versioned scheme registry and a 0.3
compatibility shim — every existing Step-1/2 package keeps verifying.

### 4.1 Holder package (`credvault-package/1.0`) — the private inventory

```json
{
  "packageType": "credvault-package/1.0",
  "schemaRef": { "id": "college-degree", "version": "1.0.0", "hash": "9f2c…" },
  "issuer": { "id": "penn-state", "displayName": "Penn State University" },
  "cohort": "2027-spring",
  "holderRef": "STU-001",
  "values":  { "fullName": "Alice Johnson", "degree": "B.S. Computer Science", "gpa": 385 },
  "salts":   { "fullName": "…", "degree": "…", "gpa": "…", "master": "…" },
  "commitments": { "fullName": "…", "degree": "…", "gpa": "…" },
  "sets": {
    "courseGrades": {
      "mode": "granular", "itemCount": 5, "subRoot": "…",
      "items": [
        { "values": {"courseCode":"CS101","courseTitle":"Intro to Computer Science","credits":3,"grade":"A"},
          "salt": "…", "path": [ {"sibling":"…","goesLeft":true}, … ] }
      ]
    }
  },
  "masterLeaf": "…", "credId": "…",
  "path": [ … ], "cohortRoot": "…",
  "contractAddress": "16312e67…", "network": "undeployed",
  "predicateProofs": [
    { "field": "gpa", "op": ">=", "value": 300, "provenTx": "…", "mintedAt": "…" },
    { "field": "gpa", "op": ">=", "value": 350, "provenTx": "…", "mintedAt": "…" }
  ]
}
```

Changes from 0.3, and why:

- `schemaRef` (id+version+hash) replaces the bare `schema` string — this is
  what makes apps universal: the package names its own descriptor.
- `commitments` for EVERY field (not just gpaCommit): enables sealing ANY
  field while the leaf still recomputes (redaction generalization of the
  Step-2 GPA trick).
- `sets` map replaces the hardcoded `courses`/`docCommit`/`courseSubRoot`
  triple; each set self-describes its mode.
- `holderRef` renames `studentId` (issuer-scoped opaque id; a doctor is not
  a "student" of the medical board).
- `issuer.id` + `contractAddress` + `network` are checked against the
  registry (§7).

### 4.2 Commitment scheme registry (cv-core)

Descriptors name schemes; cv-core implements them; all three apps share the
one library. Versioned ids make migrations explicit:

| Scheme id | Construction | Used for |
|---|---|---|
| `canonical-field/v1` | H("credvault:field:" ‖ name ‖ normalize(value) ‖ salt) | value fields (strings) |
| `compact-commit-uint64/v1` | SHA-256(rand ‖ le64(x)) — persistentCommit layout (probe-verified, §15) | metric fields (doubles as L2 witness commitment) |
| `canonical-setitem/v1` | H("credvault:setitem:" ‖ **setName** ‖ values-in-declared-order ‖ salt) | granular set items (set-name domain separation — new in v1.0; prevents cross-set item replay) |
| `canonical-course-leaf/v0` | legacy `credvault:course:` (0.3 shim) | existing packages |
| `canonical-doc/v1` | H("credvault:doc:" ‖ canonicalDoc ‖ docSalt), canonicalDoc = normalized "v₀‖v₁‖…" lines sorted by canonicalSort | monolithic sets |
| `canonical-leaf/v1`, `canonical-node/v1`, `canonical-credid/v1` | as today | master leaf, trees, credIds |
| `kdf-salt/v1` | deterministic salts from issuer SK (idempotent re-batches, §15) | issuance only |

### 4.3 Presentation (`credvault-presentation/1.0`) — what leaves the holder's device

Package minus sealed values/salts, plus an explicit disclosure record:

```json
{
  "presentationType": "credvault-presentation/1.0",
  "schemaRef": { "…": "…" }, "contractAddress": "…", "network": "…",
  "issuer": { "…": "…" }, "cohort": "…",
  "disclosure": {
    "revealedFields": ["fullName", "degree"],
    "sealedFields": ["gpa"],
    "sets": { "courseGrades": { "revealedItems": [0, 2, 4], "itemCount": 5 } }
  },
  "values": { "fullName": "Alice Johnson", "degree": "B.S. Computer Science" },
  "salts":  { "fullName": "…", "degree": "…", "master": "…" },
  "commitments": { "fullName": "…", "degree": "…", "gpa": "…" },
  "sets": { "courseGrades": { "mode": "granular", "itemCount": 5,
             "items": [ {"values":{…},"salt":"…","path":[…]}, …3 revealed… ] } },
  "predicateProofs": [ {"field":"gpa","op":">=","value":350,"provenTx":"…","mintedAt":"…"} ],
  "masterLeaf": "…", "credId": "…", "path": [ … ], "cohortRoot": "…",
  "presentedAt": "2026-09-06T14:22:10Z"
}
```

Redaction rule (today's GPA trick, generalized): a sealed field drops
`values[f]` and `salts[f]`; its 32-byte commitment stays in
`commitments[f]` so the master leaf still recomputes. Only a predicate proof
can then speak for the sealed value. Sealed set items simply leave the set's
`items` list (their paths are never revealed); `itemCount` lets the verifier
render "N SEALED" and the sub-root convergence check enforces honesty.

### 4.4 Bundle envelope (`credvault-bundle/1.0`) — the multi-credential share

```json
{
  "presentationType": "credvault-bundle/1.0",
  "bundleId": "7fa3c1…",
  "presentedAt": "2026-09-06T14:22:10Z",
  "holderNote": "Application documents — A. Johnson",
  "items": [
    { "label": "Penn State — B.S. Computer Science",
      "presentation": { "presentationType": "credvault-presentation/1.0", "…": "…" } },
    { "label": "State Medical Board — Physician License",
      "presentation": { "presentationType": "credvault-presentation/1.0", "…": "…" } }
  ]
}
```

- Each item is a COMPLETE, independently-verifiable single-credential
  presentation with its own schemaRef, contract address, salts, paths, and
  predicate proofs. Disclosure decisions are PER ITEM.
- The envelope adds `bundleId` (random per share — unlinkability across
  shares), timestamp, and a free-text note. **No cryptographic linkage between
  items in v1** — the bundle asserts co-presentation, exactly like handing
  over two paper documents. What it deliberately does NOT prove: same-PERSON
  binding (holder-binding options are parked, §13, ARCHITECTURE §10).
- Verification (§5.3): each item against ITS issuer's anchor, in parallel.

---

## 5. The verification engine (schema-driven verify-core)

Current `verify-core.ts` hardcodes fullName/degree/gpa, one set, one L2
circuit. Step 3 turns it into a **pattern engine**: descriptor in → the same
six checks out, for any schema.

### 5.1 verifySingle(presentation) — pseudocode

```
d ← registry.descriptor(p.schemaRef);  if !d → UNKNOWN_SCHEMA
if sha256(canonical(d)) ≠ p.schemaRef.hash → DESCRIPTOR_MISMATCH
reg ← registry.issuerFor(p.schemaRef.id, p.contractAddress)
if !reg || reg.status ≠ active → REGISTRY_MISMATCH     // anti-self-issuance (§7)

1. FIELD COMMITS — for each field in d.fields, in d.leafLayout order:
     revealed → recompute scheme(value, salt)
     sealed   → take p.commitments[f]            (binds, hides)
2. SETS — for each set in d.leafLayout order:
     granular   → for each revealed item: leaf=itemScheme(values,salt);
                  root=recomputeRoot(leaf,path); ALL must converge to ONE
                  sub-root (else TAMPERED "mixed credentials")
     monolithic → docCommit(canonicalDoc(all items), docSalt) must equal
                  the presented doc commitment; subsets → honest refusal
3. LEAF — masterLeaf = H("credvault:leaf:" ‖ slots… ‖ masterSalt);
   must equal p.masterLeaf (else TAMPERED)
4. ROOT — root = recomputeRoot(masterLeaf, p.path)
5. CHAIN — indexer read of p.contractAddress (network from registry):
   root ∈ validRoots?  else UNKNOWN_ANCHOR.
   credId ∉ revoked?    else REVOKED.   (always CURRENT chain state, §15)
6. PREDICATES — for each p.predicateProofs: field must be a metric in d with
   op ∈ d.predicates.operators; map (op,value)→[min,max] (§3.2b);
   verify off-chain via deploy-replay against THIS contract's verifier keys
   (cached per address, from the registry's deploy capture, §15 recipe);
   mint-time tblock window per the settled TTL rules (§16)
→ VERIFIED with a RENDER MODEL: per-field {label, status: revealed|sealed,
   displayValue}, per-set {revealedItems, itemCount}, per-proof
   {field, op, value, ok}, plus registry issuer identity + timing.
```

### 5.2 The universal contract template (`credvault-anchor-core/1`)

```
ledger:  sealed authority: Bytes<32>;  validRoots: Set<Bytes<32>>;  revoked: Set<Bytes<32>>
witness: issuerSecretKey(): Bytes<32>
circuit: addCohortRoot(root)            — guard authority
circuit: revokeCredential(credId)       — guard authority
witness: fieldValue(): Uint<64>;  fieldSalt(): Bytes<32>
circuit: verifyRange(credId, fieldCommit, min: Uint<64>, max: Uint<64>) —
   assert persistentCommit<Uint<64>>(fieldValue(), fieldSalt()) == fieldCommit
   assert fieldValue() >= min;  assert fieldValue() <= max
   assert !revoked.member(disclose(credId))     // binds proof to a live credential
```

`verifyMinGPA` (Step 2) is `verifyRange` with max = 2⁶⁴−1. ONE circuit now
serves every metric of every schema of every issuer — each issuer still gets
its own DEPLOYMENT (own authority, own roots, own revocation set: isolation +
ownership story per §6). The template is audited once; the generator emits
zero Compact in v1. (v2: generated composite circuits attach alongside, same
anchor core — §12.4.)

### 5.3 verifyBundle(bundle) — multi-credential

```
results ← parallel bundle.items.map(verifySingle)     // independent anchors
overall ← all VERIFIED ? VERIFIED : (any VERIFIED ? PARTIAL : FAILED)
```

Per-item results render in per-item sections (§6.1). PARTIAL is first-class:
a revoked license beside a valid degree shows exactly that — the overall AND
never collapses away the item detail. New bundle-level verdict
`BUNDLE_MALFORMED` for structural errors (empty items, non-presentation
items).

### 5.4 Verdict vocabulary (engine-wide)

VERIFIED · TAMPERED · REVOKED · UNKNOWN_ANCHOR · CONTRACT_NOT_FOUND ·
L2_INVALID · L2_UNAVAILABLE (existing) + UNKNOWN_SCHEMA ·
DESCRIPTOR_MISMATCH · REGISTRY_MISMATCH · SUBSET_REFUSED (monolithic honest
refusal) · PARTIAL · BUNDLE_MALFORMED (new).

---

## 6. The three universal apps, schema-parameterized

One stateless portal server (current pattern) serves all three experiences.
Per-schema behavior comes from descriptors fetched at runtime; per-issuer
behavior from registry entries and issuer configs. Nothing else changes.

### 6.1 Verify app (public portal)

**Inputs (unchanged patterns):** QR/link token → drop fetch; pasted JSON;
file upload. New: any of these may contain a single presentation OR a bundle.

**Rendering model per field type** (the requirement, explicitly):

| Element | Revealed | Sealed | Predicate-proven |
|---|---|---|---|
| value field | `Label: VALUE` row | grey pill "SEALED by holder" | (v2 hidden equality) |
| metric field | `Label: value` formatted by scale/format (385 → "3.85") | grey pill | green pill "GPA ≥ 3.50 — proven, value never shared" |
| granular set | item table (itemFields as columns) + "…N more SEALED" | count line only | (v2 set-item proofs) |
| monolithic set | full item table | "Document sealed — this issuer verifies the whole set" | — |
| issuer identity | from REGISTRY (displayName, status), never from the package | | |
| trust footer | "Checked against {issuer}'s public anchor in N ms · no account needed" | | |

**Bundle result page:**

```
┌──────────────────────────────────────────────────────────────┐
│ 🌙 CredVault — verification result                           │
│                                                              │
│        ✓ 2 of 2 credentials VERIFIED  (or: ⚠ 1 of 2)         │
│                                                              │
│ ┌─ 🎓 College Degree — Penn State University ─── ✓ VERIFIED ┐│
│ │ Name        ALICE JOHNSON                                 ││
│ │ Degree      B.S. Computer Science                         ││
│ │ GPA         🔒 SEALED by holder                           ││
│ │ Cutoff      ✓ GPA ≥ 3.50 — proven, value never shared     ││
│ │ Courses (3 shown, 2 sealed)                               ││
│ │   CS101  A  Intro to Computer Science            3 cr     ││
│ │   … +2 more · 2 SEALED by holder                          ││
│ │ Checked against Penn State's anchor in 96 ms              ││
│ └───────────────────────────────────────────────────────────┘│
│ ┌─ 🩺 Physician License — State Medical Board ── ✓ VERIFIED ┐│
│ │ Name        ALICE JOHNSON, MD                             ││
│ │ License no. MD-044821                                     ││
│ │ Valid thru  2028-06-30                                    ││
│ │ Checked against the Board's anchor in 88 ms               ││
│ └───────────────────────────────────────────────────────────┘│
│ Shared 2026-09-06 14:22 · link expires 14:37 · hashes only   │
│ are logged. Details ▾ (commitment ids, anchors)              │
└──────────────────────────────────────────────────────────────┘
```

Failed items render their own verdict block (✗ REVOKED with issuer identity)
while good items still verify — partial truth, never a single opaque NO.

**Server changes:** `/api/verify` accepts presentation|bundle (auto-detect);
`/api/registry/*` read endpoints; `/api/schemas/:id/:version` descriptor
endpoint; body cap 2 MB; drop caps (§8). The service stays STATELESS:
process → render → discard; audit log stores bundleId, item credIds,
verdicts, timestamp — hashes/IDs only (MVP.md rule 4).

### 6.2 Holder app (PWA) — single- and multi-credential

**Store v2** (localStorage today, IndexedDB seam):

```json
{ "credentials": {
    "<credIdHex>": {
      "credId": "…", "schemaRef": {…}, "issuerId": "penn-state",
      "label": "B.S. Computer Science",
      "acquiredAt": "…", "source": "link|file",
      "package": { "…full credvault-package/1.0…" },
      "descriptorCache": { "hash": "…", "fetchedAt": "…", "descriptor": {…} }
    } },
  "settings": { "defaultTtlMinutes": 15 } }
```

Key = `credId` (globally unique by construction — unlike studentId, which is
issuer-scoped). Import dedupes on credId. Descriptors are fetched at import,
hash-checked against schemaRef, and cached (they're immutable per version —
cache forever). Storage math: ~5–25 KB per package (§8), so a doctor's
5–10 credentials ≈ 100–250 KB — far inside the ~5 MB localStorage quota;
IndexedDB is the documented seam if media attachments ever arrive.
Export/backup: one JSON export of all credentials (v1, plain file; encrypted
backup is a listed seam).

**Unified credential list** — every card rendered from its own descriptor's
display block:

```
┌────────────────────────────────────┐
│ 🌙 My Credentials                  │
│ ────────────────────────────────── │
│ 🎓 B.S. Computer Science           │
│    Penn State University · 2027    │
│    [ Share… ]                      │
│ ────────────────────────────────── │
│ 🩺 Physician License               │
│    State Medical Board             │
│    [ Share… ]                      │
│ ────────────────────────────────── │
│ ☐ Share several together           │
│ [ + Add a credential ]             │
└────────────────────────────────────┘
```

**Descriptor-driven share sheet** (per credential — this is the holder-side
parameterization requirement):

```
┌────────────────────────────────────┐
│ Share: B.S. Computer Science       │
│ ────────────────────────────────── │
│ What to include:                   │
│ ☑ Name: ALICE JOHNSON              │
│ ☑ Degree: B.S. Computer Science    │
│ GPA: (•) Show 3.85                 │
│      ( ) Prove a cutoff instead ▾  │
│            [≥ 3.50]  (≥ 3.00)      │
│      ( ) Keep private              │
│ Courses: [search…] [all] [none]    │
│ ☑ CS101 Intro to CS (A)            │
│ ☑ CS240 Data Structures (A)        │
│ ☐ CS320 Algorithms (A-)            │
│ …                                  │
│ [ Create share QR ]                │
└────────────────────────────────────┘
```

Every control is generated: value fields → checkboxes; metric fields → the
three-way (show / prove-from-preminted-criteria / hide); granular sets →
searchable item picker (itemDisplay template); monolithic sets → an
all-or-nothing note instead of a picker. Defaults come from each element's
`defaultDisclosure`. A metric with no pre-minted proof for a wanted cutoff
shows "ask the issuer for a new proof" (descriptor `novelProofs: on-request`
→ issuer proof-request flow, §6.3/§13).

**Multi-credential share flow ("Share several together"):**

1. Check N credentials → 2. one disclosure sheet per credential (sequenced,
   each generated from its descriptor) → 3. review summary:

```
┌────────────────────────────────────┐
│ You're sharing 2 credentials       │
│ ────────────────────────────────── │
│ 🎓 Penn State degree               │
│    Name, Degree shown · GPA sealed │
│    ✓ ≥3.50 proof · 3 of 5 courses  │
│ 🩺 Medical license                 │
│    Everything shown                │
│ [ Create one QR for both ]         │
└────────────────────────────────────┘
```

4. The app assembles the bundle (§4.4) → POST to the drop → ONE QR. The tap
is the consent act (per-credential and per-field granularity preserved in the
disclosure record).

### 6.3 Issuer console (registrar view)

The console is configured by the SAME descriptor plus an **issuer config**
(produced at onboarding, stored issuer-side):

```json
{
  "configType": "credvault-issuer-config/1.0",
  "issuerId": "penn-state", "schemaRef": {…},
  "contractAddress": "…", "network": "undeployed",
  "upload": {
    "format": "csv",
    "rowGrouping": "holderId",
    "columns": { "holderRef": "studentId",
                 "fields": { "fullName": "fullName", "degree": "degree", "gpa": "gpa" },
                 "sets": { "courseGrades": { "courseCode": "courseCode", "courseTitle": "courseTitle",
                                              "credits": "credits", "grade": "grade" } } },
    "valueChecks": { "gpa": "uint, scale 100" }
  },
  "premint": [ {"field":"gpa","op":">=","value":300}, {"field":"gpa","op":">=","value":350} ],
  "revocation": { "cadence": "batch" },
  "delivery": { "packageLinks": true }
}
```

Screens (evolved from today's issuer.html, now config-driven):

- **Upload** — the CSV guards stay (data exports only, never PDFs — §17);
  the column MAPPING comes from config, so a license board uploads
  `licenseId,fullName,licenseType,expiryDate,…` and the console validates
  types/formats per schema (uint scales, dates, maxItems ≤ 100 per holder).
  Preview shows parsed holders + a ready pill (no auto-population).
- **Batch** — one button: commit → tree → anchor (ONE tx, any cohort size) →
  premint the config's criteria → write packages → manifest. Live job log
  (current subprocess pattern). Idempotent re-batches via deterministic salts.
- **Credentials** — filterable table from packages; per-holder package link;
  revoke button (per-schema label: "revoke credential", not "revoke student").
- **Novel-proof requests** (license boards, recruiting cutoffs): "mint proof"
  action — pick holder + metric + cutoff → ~3 s off-chain proof (§15 finding:
  raw proving is 1.7–2.5 s) → share link. This is the issuer-side half of the
  holder's "ask for a new proof" button.
- **Stats** — aggregate only ("137 verifications this month"), never per-event
  (MVP.md rule 3).

---

## 7. Registry & trust roots (multi-issuer makes this mandatory)

Today the issuer name and contract address travel INSIDE the package — self-
asserted. With one mock issuer that's harmless; with N issuers an attacker
could deploy their own contract, anchor their own root, and present a "Penn
State" degree that verifies green against THEIR anchor. The fix is a
CredVault-operated **registry** — the apps' only trusted input:

```json
{
  "entryType": "credvault-issuer/1.0",
  "issuerId": "penn-state",
  "displayName": "Penn State University",
  "status": "active",
  "schemas": [ { "id": "college-degree", "version": "1.0.0", "descriptorHash": "9f2c…" } ],
  "contracts": [
    { "address": "16312e67…", "network": "undeployed", "deployedAt": "…",
      "status": "active", "deployCaptureRef": "/api/registry/deploys/16312e67…" }
  ],
  "onboardedAt": "…"
}
```

- **verify-core** refuses presentations whose (schemaId, contractAddress,
  network) don't match an active registry contract → REGISTRY_MISMATCH, and
  the UI renders issuer identity from the registry, not the package.
- **Deploy captures** (the serialized proven deploy tx, §15) are published to
  the registry at deploy time; verify-core downloads once per contract and
  caches the reconstructed verifier keys for predicate-proof checking.
  (No PII anywhere in the registry — it's contract metadata.)
- **Holder import** checks the package's contractAddress against the registry
  too — a fake package warns at import, not at interview time.
- v1 trust root = CredVault (like a CA list). Seams noted: signed entries,
  third-party auditors, a transparency log. Deliberately NOT on-chain in v1
  (verifier reads must stay free and instant; the chain already anchors the
  credentials themselves).

**Versioning & migration** (contract rule changes): a schema change mints a
new descriptor version; a rule change requiring new on-chain behavior deploys
a NEW contract instance; the registry keeps BOTH addresses (old: status
"legacy-verify-only"). Since validRoots are never removed (§14), old packages
keep verifying against the old contract; new batches anchor on the new one.
The issuer sees "a new version of your credential is live; previously issued
credentials still verify."

---

## 8. Presentation & QR model at scale

**Pattern (unchanged from MVP, now load-rated):** holder POSTs the
presentation/bundle to `/api/presentations` → server stores it in the TTL
drop → returns an opaque token → holder renders a QR of
`{portal}/verify.html?t=<token>`. The verifier's scan fetches the bundle
portal-side and verifies. **The QR always encodes ~90 chars of URL — bundle
size never touches QR density** (a v4 QR, instant-scan at any payload size).

**Measured payloads (this codebase):**

| Payload | Size |
|---|---|
| Granular package, 5 courses, no proofs | 3.5 KB |
| Package + 1 predicate proof | ~17 KB (proof hex ≈ 9.9 KB of it) |
| Package + 2 proofs | ~21 KB |
| 100-item granular set (package) | ~70–80 KB (100 × ~700 B item+7-level path) |
| Subset presentation (5 of 100 items) | ~8 KB |
| 3-credential bundle, mixed proofs | ~30–80 KB typical |
| Hard cap per drop entry | 1 MB (≈ 3 max-size credentials) |

**Drop configuration:** TTL 15 min default (env-tunable; short BY DESIGN —
re-sharing is instant and free, §16/MVP guide); 2 MB request body cap; 1 MB
per entry; 100 MB store with TTL sweeper + LRU eviction; tokens widened to
128-bit. Compact JSON (no pretty-print) + gzip on the wire cut ~60–70%.

**Backpressure & honesty:** a full drop → 503 with "ask the holder to share
again" (re-share is the protocol's answer to every transport failure).
Offline/no-drop fallbacks (multi-frame QR, NFC) are explicitly OUT — the
holder's phone is online when they share; the VERIFIER need only reach the
portal. Paste-JSON remains for desktop flows; 80 KB pasted bundles are ugly
but functional.

**localStorage:** ~5 MB quota ⇒ 60–200 typical credentials; IndexedDB seam
documented. Phone upload of an 80 KB bundle on weak cell: < 2 s.

---

## 9. Issuer onboarding: the wizard

Console-gated flow. Eight steps; the issuer never sees a key, a hash, or the
word "blockchain" (§11 copy rules apply to every string).

```
Step 1  What are you issuing?          Step 2  What can verifiers check?
┌────────────────────────────┐        ┌─────────────────────────────┐
│ Organization: [Penn State] │        │ Direct facts (3):           │
│ Credential: [College       │        │  • Name (text)              │
│   Degree]                  │        │  • Degree (text)            │
│ Type: (•) University       │        │  • GPA (number, x.xx)       │
│       ( ) Licensing board  │        │                             │
│       ( ) Employer         │        │ Number checks (1):          │
│                            │        │  • GPA: cutoff ≥ [3.00]     │
│ "Twice a year you'll       │        │            ≥ [3.50]  +add   │
│  upload a list. We handle  │        │                             │
│  everything else."         │        │ Record sets (1):            │
└────────────────────────────┘        │  • Courses: code, title,    │
                                      │    credits, grade           │
                                      │  Verify: (•) each course on │
                                      │   its own ( ) as one doc    │
                                      │  Max records: [100]         │
                                      └─────────────────────────────┘
```

- **Step 3 — Preview.** Human-readable summary ("Holders can share any fact,
  hide any fact, prove GPA cutoffs without showing GPA; employers verify in
  under a second, free") + the generated schema YAML as a downloadable detail.
  Nothing is deployed yet.
- **Step 4 — Validation (automatic).** Generator validator: size rule (no
  document bytes in circuits), uint-only metrics, maxItems ≤ 100, name
  collisions, scale sanity, both-set-modes coherence. Errors in plain English
  with fixes ("'GPA' has a number check, so its format must be numeric —
  picked x.xx for you"). Because v1 deploys the AUDITED TEMPLATE, the
  validation gate needs no compile step — that whole risk class (March's
  compiler wall) is absent from onboarding.
- **Step 5 — Dry run.** We generate 10 fictional holders, run a full batch on
  the dev network, and show: "10 credentials anchored in one update · 72
  seconds · your holders would now receive their links." The issuer watches a
  fictional credential verify.
- **Step 6 — Go live.** One click → template deployment with the issuer's
  authority sealed in-circuit (constructor, §14) → registry entry → console
  config written. Issuer sees: "Your verification service is live." (Behind
  the scenes: the runtime's operations wallet is created and pre-funded; the
  one-sentence blockchain exposure per ARCHITECTURE §2 stays in the service
  agreement, not the UI.)
- **Step 7 — Connect data.** Upload a real SIS CSV export → drag columns onto
  schema fields → live type/format validation → save the mapping (§6.3
  config). Ladder unchanged (§17): CSV → SIS connector → PDF never.
- **Step 8 — First batch + delivery.** Upload the real cohort → preview → Run
  batch → one anchor transaction → per-holder magic download links → done.
  Revocation tab and aggregate stats are now available. License-type issuers
  (from Step 1's type picker) get the prompt-revocation runtime profile and a
  "keep this server reachable" note instead (ARCHITECTURE §5).

---

## 10. Multi-credential verification, end to end (the doctor)

Dr. Amara holds: MD degree (Penn State, granular), physician license (State
Board, monolithic CE set + expiryDate metric), ACLS certificate (hospital,
value fields only). Three issuers, three contract deployments, three
descriptors — one holder app.

1. **Acquisition** — three magic links over time; each import fetches the
   descriptor (hash-checked), registry-checks the contract, stores by credId.
2. **Sharing to a hospital credentialing office** — "Share several together"
   → per-credential sheets: degree (GPA sealed, ≥3.50 proof, 4 key courses),
   license (everything shown), ACLS (everything shown) → review → one bundle
   → one QR.
3. **Verification** — office scans → portal fetches the 3-item bundle →
   verify-core runs 3 independent pipelines in parallel (three contracts via
   indexer, two descriptor fetches — cached — three registry checks, one
   predicate proof) → "3 of 3 VERIFIED" in ~0.2–0.3 s with per-item anchors
   and per-item disclosure respected. The office sees exactly what Dr. Amara
   chose, nothing more; nothing is phoned home to any issuer (MVP.md rule 2).
4. **Revocation asymmetry** — the Board later suspends the license: the same
   bundle link, re-fetched before expiry, now shows license REVOKED beside
   two still-valid credentials (revocation is always current-state, §15);
   after TTL expiry the office asks for a fresh share — fresh answers are
   always a tap away.

**Correlation caveat (stated to holders in plain words):** a bundle shows
these credentials were presented together — like handing over two documents
at once. Sharing them separately keeps them unlinked. Same-person binding
beyond co-presentation is the parked holder-binding question (§13).

---

## 11. The invisibility bar — UX vocabulary (normative)

Applies to holder app, verify portal, issuer console, wizard, emails, errors.

| Never say (user-facing) | Say instead |
|---|---|
| blockchain, chain, on-chain | "public anchor", "the issuer's tamper-evident registry" (trust details only) |
| wallet, gas, tokens, DUST, NIGHT | "operations balance" (issuer docs), nothing at all (holders/verifiers) |
| zero-knowledge, ZK, circuit, proof system | "proven without revealing", "checked privately" |
| hash, commitment, Merkle, salt | "seal", "tamper check", "fingerprint" (trust details only) |
| contract address | "issuer registry entry" (detail view), usually nothing |
| transaction | "update", "anchored in one update" |
| seed phrase, keys | (never occurs — holders have none) |

Allowed and encouraged: "anchored", "sealed", "expires in 15 minutes",
"verified in 0.1 seconds", "no account needed", "only you choose what to
share". The collapsible "How this works" details may use commitment/anchor
with one-line glosses — auditors need them; users never expand it.

---

## 12. Build-in-parts plan (each part checkable)

Starts from the WORKING single-credential apps (step1-degree portal) and ends
at multi-credential bundles verified through the portal. Parts land in order;
each keeps the portal green.

### Part 1 — cv-core format uplift (`credvault-package/1.0` + scheme registry)
Generalize canonical.ts into the versioned scheme registry (§4.2, incl.
set-name domain separation `canonical-setitem/v1`); package/presentation
v1.0 writers+readers; `credvault-degree/0.3` shim.
**Acceptance:** every existing Step-1/2 presentation (STU/MONO/GRA files)
still verifies through the unchanged endpoint; a v1.0 package round-trips
issue → present(subset, sealed metric) → verify on the current contract.

### Part 2 — Registry + descriptor service
Hand-write the college-degree descriptor (mirrors schemas/college-degree.yaml
→ Appendix A); registry endpoints; descriptor-hash verification in verify-core
and holder import.
**Acceptance:** GET /api/registry/schemas/college-degree/1.0.0 serves a
descriptor whose sha256 == the schemaRef.hash in packages; a byte-tampered
descriptor is rejected DESCRIPTOR_MISMATCH; /api/registry/issuers lists the
mock issuer with its contract + deploy capture.

### Part 3 — Schema-driven verify-core + universal range circuit
Replace hardcoded field/set logic with the descriptor-driven engine (§5.1);
add `verifyRange` to the contract template (superset of verifyMinGPA —
keep verifyMinGPA as a shim or migrate proofs); op→[min,max] mapping;
registry cross-check.
**Acceptance:** the full existing matrix passes descriptor-driven (valid /
revoked / tampered-1-char / subset / mixed-credential / monolithic / L2 ≥
thresholds); NEW: gpa <= 3.95 and gpa == 3.85 proofs verify; sealed-fullName
presentation verifies; a presentation anchored on an unregistered contract →
REGISTRY_MISMATCH.

### Part 4 — Descriptor-driven verify UI + holder share sheet (single cred)
verify.html renders from the descriptor render model (labels, pills, set
tables, display templates); holder share sheet generated from the descriptor;
store v2 (credId-keyed) with migration of existing imports.
**Acceptance:** existing degree packages share/verify with identical UX; a
second SYNTHETIC schema (hand-made "nursing license" descriptor + packages)
imports, shares (its own disclosure sheet: value fields, expiryDate metric,
CE granular set), and renders on the verify page — zero new app code;
phone test on LAN.

### Part 5 — Issuer console per-schema + second issuer
Console loads issuer config (column mapping, per-set modes, premint criteria);
batch/premint/revoke parameterized; "deploy new issuer" action (template
deploy + registry entry).
**Acceptance:** onboard a mock community college (monolithic set) entirely in
the console; its batch anchors on its OWN contract; its packages verify in
the portal with its registry identity; mock Penn State regression intact.

### Part 6 — Multi-credential bundles ★ (the finish line)
Bundle envelope; holder multi-select share flow; verify-core bundle dispatch;
bundle result page with per-item sections + overall verdict; drop accepts
bundles.
**Acceptance:** degree + license bundle (two contracts) → ONE QR → both
VERIFIED with per-item anchors and independent disclosure (GPA sealed in the
degree, license fully shown); tampered item → item TAMPERED, sibling
VERIFIED, overall PARTIAL; revoked license beside valid degree renders
per-item verdicts; single-credential links unchanged; bundleId differs per
share (unlinkability).

### Part 7 — Scale hardening
Drop byte caps + LRU + 128-bit tokens; 2 MB body cap; compact JSON + gzip;
100-item set pickers with search/all/none; package size table re-measured.
**Acceptance:** 3-credential bundle containing a 100-item granular set
round-trips through drop → QR → verify; drop eviction unit test; QR stays ≤
v10; 200-credential holder-store smoke (IndexedDB swap if quota trips).

### Part 8 — Onboarding wizard v1
Questionnaire UI (§9 steps 1–3) → schema builder → validator → devnet dry run
→ deploy → CSV mapping → first real batch — all in the console, all in
invisible-blockchain copy.
**Acceptance:** scripted wizard run with the Penn State answers (3 direct
vars; 1 conditional gpa ≥ 3.00 & ≥ 3.50, format x.xx; 1 set × 4 vars, both
modes exercised across two issuers) reaches an anchored batch + a verified
package with NO CLI and no crypto vocabulary (string audit over emitted
copy); generated descriptor hash-pins into packages end-to-end.

**Step-3 exit criterion: Part 6 green through the public portal, with Parts
1–5 as its foundation; Parts 7–8 harden and generalize.**

---

## 13. Open questions / parked seams (recorded, not built)

- **Same-person binding across bundle items** (invisible holder secret +
  nullifiers, ARCHITECTURE §10): v1 bundles prove co-presentation only.
  Trigger: first verifier who needs cryptographic same-holder proof.
- **Holder-mediated novel-proof requests at scale** (holder button → issuer
  proof service → push link): v1 is issuer-console-initiated.
- **Durable shares / holder-revocable links** (real store, holder auth): the
  TTL drop is deliberately dumb.
- **Encrypted holder backup** (passphrase-encrypted export), native wrapper.
- **§12 fees / R1 on-chain receipts**: bundle result page is where the
  paywall hook and receipt tier slot in — seams preserved, unbuilt.
- **Hidden string equality + composite predicates (March DSL AND/OR/NOT/
  THRESHOLD):** v2 generated circuits. The seam is already in the descriptor
  (`predicates.mechanism`, `contract.predicateSupport`) and in verify-core
  (per-circuit verifier-key lookup via deploy replay). THIS time the off-chain
  twin is designed first — preminting, presentation carriage, and
  verification are specified here — which was the March DSL's gap.
- **`!=` on metrics** = two range proofs; needs bundle semantics for "both
  proofs about one field" — v2.
- **Set-item predicate proofs** ("has a pharmacology course with grade ≥ B"
  without revealing which) — needs a membership+predicate circuit over item
  commitments; v2, license templates will pull it forward.
- **Registry decentralization** (signed entries, transparency log, auditors):
  v1 is CredVault-operated.

---

## Appendix A — college-degree App Descriptor (complete instance)

```json
{
  "descriptorType": "credvault-descriptor/1.0",
  "schemaId": "college-degree",
  "schemaVersion": "1.0.0",
  "displayName": "College Degree Verification",
  "issuerType": "university",
  "display": {
    "icon": "🎓",
    "cardTitle": "{{fields.degree}}",
    "cardSubtitle": "{{issuer.displayName}} · {{cohort}}",
    "verifyTitle": "{{fields.fullName}}",
    "verifySubtitle": "{{fields.degree}} — {{fields.university}}"
  },
  "fields": [
    { "name": "fullName", "label": "Name", "kind": "value", "type": "string",
      "scheme": "canonical-field/v1", "disclosable": ["reveal"], "defaultDisclosure": "reveal" },
    { "name": "university", "label": "University", "kind": "value", "type": "string",
      "scheme": "canonical-field/v1", "disclosable": ["reveal", "equality"], "defaultDisclosure": "reveal" },
    { "name": "degree", "label": "Degree", "kind": "value", "type": "string",
      "scheme": "canonical-field/v1", "disclosable": ["reveal", "equality"], "defaultDisclosure": "reveal" },
    { "name": "gpa", "label": "GPA", "kind": "metric", "type": "uint", "scale": 100, "format": "x.xx",
      "scheme": "compact-commit-uint64/v1", "disclosable": ["reveal", "threshold", "range"],
      "predicates": { "mechanism": "universal-range-v1", "operators": [">=", "<=", "=="],
                      "premint": [ {"op": ">=", "value": 300}, {"op": ">=", "value": 350} ] },
      "defaultDisclosure": "reveal" }
  ],
  "sets": [
    { "name": "courseGrades", "label": "Courses", "mode": "granular", "maxItems": 100,
      "itemScheme": "canonical-setitem/v1", "docScheme": "canonical-doc/v1",
      "canonicalSort": ["courseCode"],
      "itemFields": [
        { "name": "courseCode", "label": "Code", "type": "string" },
        { "name": "courseTitle", "label": "Title", "type": "string" },
        { "name": "credits", "label": "Cr", "type": "uint" },
        { "name": "grade", "label": "Grade", "type": "string" } ],
      "itemDisplay": "{{courseCode}} — {{courseTitle}} ({{grade}})" }
  ],
  "leafLayout": ["field:fullName", "field:university", "field:degree", "field:gpa", "set:courseGrades"],
  "issuerRuntime": { "mode": "batch", "revocationCadence": "batch", "novelProofs": "on-request" },
  "contract": { "template": "credvault-anchor-core/1", "predicateSupport": "universal-range-v1" },
  "fees": { "enabled": false }
}
```

(The mock medical-license descriptor used in Part 4's acceptance test is the
same shape: value fields fullName/licenseNumber/licenseType, metric
expiryDate uint-yyyymmdd with `>=` premints, one granular set
continuingEducation {courseCode, title, hours, year}.)

## Appendix B — file evolution map (where each current file goes)

| Today (step1-degree) | Step-3 evolution |
|---|---|
| src/canonical.ts | cv-core: versioned scheme registry (§4.2) + 0.3 shim |
| src/verify-core.ts | the pattern engine (§5.1) + bundle dispatch (§5.3) + registry checks |
| contracts/degree.compact | template `credvault-anchor-core/1`: + verifyRange (§5.2); per-issuer deployments |
| src/portal/server.ts | + /api/registry/*, /api/schemas/*, bundle accept, drop/body caps (§8) |
| src/portal/public/verify.html | descriptor-driven rendering + bundle sections (§6.1) |
| src/portal/public/holder.html | store v2, descriptor share sheets, multi-select share (§6.2) |
| src/portal/public/issuer.html | config-driven console + wizard (§6.3, §9) |
| src/runtime.ts, premint-l2.ts | descriptor-driven: N fields, M sets, premint criteria from config |
| packages/*.package.json (0.3) | credvault-package/1.0 (§4.1) via Part-1 shim |
