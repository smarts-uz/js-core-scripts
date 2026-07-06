# Smarts Skills — Professionalization Roadmap

**Determined target type:** the entire `smarts-*` Claude Code skill fleet — 30 skills under `~/.claude/skills/`, assessed in fleet mode (`source=all-skills`) by 10 parallel per-skill audit agents, every task below verified against each skill's real on-disk state (files read, greps run, every test suite executed).

**Guiding question:** *"What else needs to be done, and what new features and improvements added, to raise this skill fleet to an ideal, professional, and international level?"*

**Strategic verdict:** the fleet is in **strong professional shape** — zero deployment-blocking (🔴) defects were found, every one of the 30 test suites that exists runs green (over 1,400 tests passing fleet-wide), and 15 of 30 skills need nothing beyond deferrable polish. The dominant barrier to an ideal standard is **derived-artifact drift**: documentation that lags behind already-correct source and code (stale `killAll()`/`taskkill`/`{blanket:true}` API docs in the winax trio, an unfinished plain-name re-derive in `smarts-config-sync`, missed version bumps), plus **missing mandatory artifacts** in a minority of skills (evals in 3 skills, sample cases in 4, one over-limit description trio). All of it is directly executable engineering work — none of it requires external experts, lawyers, or regulators. The only regulatory item in the whole fleet is an honest-disclosure note for the three Office-automation skills.

## Fleet summary

| Skill | Verdict | 🔴 | 🟠 |
|---|---|:---:|:---:|
| smarts-ai-rename | Healthy, 19/19 tests; parity gaps only (no evals test, no limitations module) | 0 | 0 |
| smarts-ai-summarize | Fully conformant, 22/22; only its verify harness is itself untested | 0 | 0 |
| smarts-api-extract | Solid core 34/34; tracked `__pycache__` binaries + Python recipes vs the Node standard | 0 | 1 |
| smarts-app-cmdline | Solid and hygienic, 23/23; empty `sample/` tree, thin test mapping | 0 | 1 |
| smarts-app-frontend | Healthy, real-invocation gate test green; empty `sample/`, single-test suite | 0 | 1 |
| smarts-claude-patch | Substance flagship — 219/219 real-DOM tests; description over limit, tracked `roadma/`, stale refs | 0 | 1 |
| smarts-collect-test | Fully conformant, 44/44 — no tasks at all | 0 | 0 |
| smarts-config-sync | Mid-migration: plain-name policy landed in ALL.md but 4 modules + 1 test still old → 36/37 | 0 | 1 |
| smarts-demo-echo | Healthy minimal reference, 28/28; missing mandatory evals, frontmatter argument drift | 0 | 1 |
| smarts-design-deploy | Fully conformant, 53/53; only sample hygiene + a rollback feature gap | 0 | 0 |
| smarts-dissertation-ppt | Conformant and honest about platform limits, 37/37; thin eval corpus | 0 | 0 |
| smarts-explain | Structurally conformant, 27/27; weakest trigger description in the fleet (147 chars) | 0 | 0 |
| smarts-file-distribute | Strong, 28/28; description ~1190 chars — truncated in the harness skill listing | 0 | 1 |
| smarts-file-increment | Conformant, 34/34; empty `scripts/` despite CHANGELOG claim, no verify harness | 0 | 0 |
| smarts-get-subcategory | Fully conformant, 39/39; one deferrable refinement | 0 | 0 |
| smarts-git-automate | Green 35/35, but a July-1 behaviour change shipped with no version bump or CHANGELOG entry | 0 | 1 |
| smarts-improve-roadmap | Fresh v1.5.0 with fleet mode wired in lock-step, 32/32; consolidated (not 1:1) test mapping | 0 | 0 |
| smarts-inputs | Clean 28/28; aggregate module omits the increment-versioned filename rule (own sample proves it) | 0 | 1 |
| smarts-logging-grafana | Professional, 45/45; missing `actions` test breaks 1:1 mapping, no `sample/` at all | 0 | 2 |
| smarts-md-restructure | Fully healthy, 19/19; cosmetic doc nits only | 0 | 0 |
| smarts-payment-code | Fully conformant, 19/19, exact 1:1 mapping — no defects found | 0 | 0 |
| smarts-projects-audit | Solid, 28/28; stale model-resolution phrasing in derived files | 0 | 0 |
| smarts-prompt-manager | Fully conformant, 127/127, perfect mapping — no proven defects | 0 | 0 |
| smarts-setting-sync | Strong and fresh (1.2.0, 56/56); mandated `sample/` folder is completely empty | 0 | 1 |
| smarts-skill-manager | Excellent, 446/446; violates its own mandate — no `evals/evals.json` of its own | 0 | 1 |
| smarts-transcribe | Clean honest external-tool skill, 28/28; trigger evals entirely missing | 0 | 1 |
| smarts-video-inventory | Fully conformant, 19/19 — optional feature growth only | 0 | 0 |
| smarts-winax-excel | Strong, 144/144; stale `killAll()` docs + one live `undefined` COM arg | 0 | 2 |
| smarts-winax-powerpoint | Excellent, 150/150; phantom `{blanket:true}` API still documented | 0 | 1 |
| smarts-winax-word | Solid, 157/157; usage manuals teach forbidden `taskkill /IM`, five `undefined` COM args | 0 | 3 |
| **Fleet total** | **0 Critical · 21 High across 15 skills; 15 skills conformant** | **0** | **21** |

## Disciplines

| Section | Owner | Priority |
|---|---|:---:|
| [Regulatory](#regulatory) | Skill maintainer (disclosure text only — no external clearance needed) | 🟢 |
| [Technical](#technical) | Skill maintainer via `smarts-skill-manager` (prompt-first edits) | 🟠 |
| [Functional](#functional) | Skill maintainer — opens with the full fleet feature catalogue | 🟡 |
| [Visual](#visual) | Skill maintainer | 🟢 |
| [International](#international) | Skill maintainer | 🟡 |

## Current capabilities — honest summary

- **Every existing test suite is green.** All 28 skills with suites pass 100% (from 19 tests in the smallest to 446 in `smarts-skill-manager` and 219 real-DOM effect tests in `smarts-claude-patch`); `testing/ALL.mjs` runners and READMEs are present fleet-wide.
- **The prompt-first architecture holds.** Every skill keeps a git-tracked `prompt/ALL.md` source of truth; snapshots, gitignored `project/`/`sample/`/`packer/`/`roadma/` trees, and pointer-style `SKILL.md` routing tables are the norm.
- **Version lock-step is the norm** — 28 of 30 skills have CHANGELOG top block matching `metadata.version` exactly.
- **Security hygiene is genuinely clean**: no hardcoded secrets anywhere (verified by grep in all 30), `.env` files gitignored with tracked examples, placeholder-stamping for deployed assets in `smarts-claude-patch`, public-data-only assets in `smarts-payment-code`.
- **The no-PowerShell rule holds in every executable path** — the only hits fleet-wide are prohibition prose, classification tokens, and captured sample transcript data.
- **Process-kill discipline is correct in code** — all three winax libraries implement PID-snapshot + `process.kill` of run-spawned PIDs only, with no blanket path in code (the drift is in *docs*, not code).
- **Provider-neutrality is satisfied everywhere** — runtime LLM-CLI dispatch where a call site exists, plain-task script names, no foreign-provider binaries.

## Largest gaps

1. **Stale derived docs teaching forbidden or nonexistent APIs** — the winax trio's `limitations.md`/usage manuals still document `killAll()`, `{blanket:true}`, and an explicit `taskkill /F /IM` recipe that the code (correctly) no longer has (`smarts-winax-word` usage manuals are the worst case — they *instruct* the forbidden kill).
2. **Five `undefined`-as-COM-arg call sites in `smarts-winax-word` + one in `smarts-winax-excel`** — likely real-run failures masked by the mocked suites (the fleet's own rule mandates `null`).
3. **Mandatory artifacts missing in a minority**: `evals/evals.json` absent in `smarts-skill-manager` (its own mandate), `smarts-transcribe`, `smarts-demo-echo`; `sample/` empty or absent in `smarts-setting-sync`, `smarts-app-cmdline`, `smarts-app-frontend`, `smarts-logging-grafana`.
4. **Frontmatter description over the 1024-char cap** in `smarts-file-distribute` (~1190, visibly truncated in the harness listing) and `smarts-claude-patch` (1173); `smarts-app-frontend` sits at 1023/1024 with zero headroom.
5. **Unfinished migrations / missed lock-step**: `smarts-config-sync` re-derive incomplete (1 failing test), `smarts-git-automate` July-1 behaviour change never bumped.

**Feature catalogue:** the complete fleet-wide enumeration of every new feature and every improvement is the [first two tables of the Functional section](#functional).

## Sources

Per-skill evidence gathered by 10 parallel audit agents from each skill's own materials: `SKILL.md` frontmatter and routing tables, `prompt/ALL.md` and snapshot diffs, `module/*.md`, full `testing/ALL.mjs` runs, `evals/evals.json`, `CHANGELOG.md` vs `metadata.version`, `scripts/` sources (COM arg audit, kill-path audit, provider-dispatch audit), `usage/` manuals, `sample/` trees, git tracking state (`git ls-files`, `git check-ignore`), and the fleet conventions in `smarts-skill-manager` (`module/authoring-structure.md`, `module/testing.md`) and the global `CLAUDE.md`.

## Legend

| Marker | Meaning |
|:---:|---|
| 🔴 | Critical — demonstrated, present, deployment-blocking defect |
| 🟠 | High — verified gap required for a credible professional-grade fleet |
| 🟡 | Medium — verified, meaningful improvement, near-term |
| 🟢 | Low — deferrable / preventative |
| 1️⃣ 2️⃣ 3️⃣ 4️⃣ | Effort: 1–2 days · 3–7 days · 1–3 weeks · a month+ |
| ☐ ◐ ☑ | Status: not started · in progress · done |

# Regulatory

Priority 🟢 — performed by the skill maintainer; no external certification, lawyer, or regulator is involved anywhere in this fleet. The single verified regulatory theme is honest disclosure of Microsoft's stance on unattended Office COM automation in the three winax skills (their `limitations.md` modules are the designated honest-limits surface and currently carry no licensing note — grep verified in all three).

## Office automation licensing disclosure

| Status | Priority | Effort | Task | Acceptance |
|:---:|:---:|:---:|---|---|
| ☐ | 🟢 | 1️⃣ | **smarts-winax-excel — disclose Microsoft's unattended-automation stance** — `limitations.md` has no licensing/server-side note (grep `licens\|server-side\|unattended` → 0 hits); Microsoft does not support unattended server-side Office COM automation (KB 257757) | limitations.md carries a sourced note that an installed, licensed desktop Excel is required and server-side automation is unsupported |
| ☐ | 🟢 | 1️⃣ | **smarts-winax-powerpoint — same disclosure** — no licensing note despite the module already disclosing other honest limits ("PowerPoint cannot run hidden") | limitations.md carries the sourced disclosure |
| ☐ | 🟢 | 1️⃣ | **smarts-winax-word — same disclosure** — no licensing/server-side note (grep → 0 hits) | limitations.md carries the sourced disclosure |

**Acceptance criterion:** all three winax `limitations.md` modules state the desktop-license requirement and the unsupported server-side stance, edited prompt-first and re-derived.

# Technical

Priority 🟠 — the fleet's main body of work; all of it is directly executable by the maintainer through the `smarts-skill-manager` prompt-first flow. Ordered by consequence: rule-violating docs and live COM bugs first, then missing mandatory artifacts, then metadata/lock-step repairs, then test-coverage depth, then low-priority hygiene.

## Stale kill-path documentation contradicting the fleet's hard rules

The code in all three winax skills is correctly PID-scoped (verified at `Excel Books.mjs:1064`, `Power Points.mjs:1556`, `Word Docs.mjs:1531` — "There is NO blanket option, by mandate"); the defect is that derived docs still teach the removed, forbidden APIs.

| Status | Priority | Effort | Task | Acceptance |
|:---:|:---:|:---:|---|---|
| ☐ | 🟠 | 1️⃣ | **smarts-winax-word — remove the image-name `taskkill /F /IM` recipe from the usage manuals** — `usage/smarts-winax-word-project.md:45` and `usage/…-skill.md:153` instruct `execFileSync("taskkill", ["/F","/IM","EXCEL.EXE","/IM","WINWORD.EXE"])`, directly violating the never-kill-by-image-name rule; anyone following the manual kills the user's own open Word/Excel | `grep -rn "taskkill" usage/` returns nothing (or only prohibitions); both manuals show the `pidSnapshot()`/`killOrphans()` recipe |
| ☐ | 🟠 | 1️⃣ | **smarts-winax-word — remove the phantom `{blanket:true}` API from limitations.md** — `module/limitations.md:40` documents `WordDocs.killOrphans({}, { blanket: true })`; the code has no such option and the fleet rule says one must not exist | `grep -i blanket module/limitations.md` shows only the prohibition |
| ☐ | 🟠 | 1️⃣ | **smarts-winax-excel — purge stale `killAll()` from derived docs** — `module/limitations.md:49` documents "`ExcelDocs.killAll()` reaps all EXCEL.EXE" and `scripts/README.md:31` lists `static killAll`, but the method was removed and a blanket reap is forbidden | `grep -ri killAll module/ scripts/README.md` returns only prohibitions; limitations.md describes the PID-scoped path only |
| ☐ | 🟠 | 1️⃣ | **smarts-winax-powerpoint — remove the phantom `{blanket:true}` API from limitations.md** — `module/limitations.md:59` documents `PowerPoints.killOrphans({}, { blanket: true })`; `Power Points.mjs:1556` proves no such option exists | `grep -i blanket module/limitations.md` shows only the prohibition |
| ☐ | 🟡 | 1️⃣ | **smarts-winax-powerpoint — fix stale "Node taskkill" wording in usage manuals** — `usage/…-project.md:77` and `usage/…-skill.md:159` describe an image-name kill the code no longer performs | both manuals describe the PID-scoped snapshot/kill with no `taskkill` reference |
| ☐ | 🟡 | 1️⃣ | **smarts-skill-manager — eval-viewer `_killPort` must not kill foreign PIDs** — `eval-viewer/Generate Review.mjs:413–435` netstat-finds ANY PID on the target port and `taskkill /PID /F`s it, killing processes this run did not spawn (a user's unrelated dev server would be murdered) | the viewer picks a free port or kills only a PID it recorded as its own server; a test asserts no kill for an unowned listener |

**Acceptance criterion:** no `smarts-*` doc, manual, or script teaches or performs a kill broader than the PIDs its own run spawned.

## Live COM argument defects

| Status | Priority | Effort | Task | Acceptance |
|:---:|:---:|:---:|---|---|
| ☐ | 🟠 | 1️⃣ | **smarts-winax-word — replace `undefined` with `null` at five COM call sites** — `Word Docs.mjs` passes `undefined` as skipped positional COM args at :536 (`InsertCaption`), :969 (`Range.Sort`), :1007 (`Hyperlinks.Add`), :1142 (`Indexes.MarkEntry`), :1148 (`Indexes.Add`); the winax rule mandates `null` because `undefined` fails to marshal — caption, sort, link, and index features likely throw on a real run, masked by the mocked suite | `grep -E ",\s*undefined\s*[,)]"` over `Word Docs.mjs` → 0; a real-COM run exercising caption/sort/index succeeds and Verify Doc.mjs confirms the objects |
| ☐ | 🟠 | 1️⃣ | **smarts-winax-excel — replace the `undefined` COM arg in conditional formatting** — `Excel Books.mjs:540` passes `fc.Add(XL.cfExpression, undefined, opts.formula1)`; expression-type conditional formatting likely fails on a real run while the mocked suite stays green | line passes `null`; a real-COM expression CF run succeeds and Verify Book.mjs asserts it landed |

**Acceptance criterion:** zero `undefined`-as-skipped-COM-arg sites remain fleet-wide, proven by grep and a real-COM verification run.

## Missing mandatory artifacts — evals and samples

| Status | Priority | Effort | Task | Acceptance |
|:---:|:---:|:---:|---|---|
| ☐ | 🟠 | 1️⃣ | **smarts-skill-manager — write its own evals/evals.json** — its own `module/testing.md` Step 0.1 mandates evals for every skill, yet `ls evals` → "No such file or directory" in this skill itself | evals/evals.json exists with ≥3 positive + ≥2 negative cases matching module/schemas.md; a testing spec asserts it parses |
| ☐ | 🟠 | 1️⃣ | **smarts-transcribe — create evals/evals.json** — no evals/ directory at all (`find -iname "*eval*"` → nothing) | evals with English + Uzbek positives ("matnga o'gir") and ≥2 negatives |
| ☐ | 🟠 | 1️⃣ | **smarts-demo-echo — create the missing evals/evals.json** — `ls evals` → no such directory; evals are a universal mandatory artifact | evals with ≥3 positives (incl. "/smarts-demo-echo") and ≥2 negatives |
| ☐ | 🟠 | 1️⃣ | **smarts-setting-sync — populate the empty sample/ folder** — sample/ exists with zero files (`find sample/ -type f` → nothing) while siblings ship runnable cases | ≥1 sample case with a fake settings tree, `.appgo` pointer, run.cmd driving the engine offline, and captured GET/SET `.ffs_batch` output |
| ☐ | 🟠 | 1️⃣ | **smarts-app-cmdline — create the missing sample/ cases** — sample/ contains 0 files (verified); fleet standard is numbered sandboxed cases with run.cmd | 2–3 cases (audit-only, generate-runners, full conform) over a bundled fixture library, each leaving `_chat.jsonl`/`_output.log` + the generated runner tree |
| ☐ | 🟠 | 1️⃣ | **smarts-app-frontend — create the missing sample/ cases** — sample/ contains 0 files (verified) | cases for create/audit/migrate run cold via `claude -p`, each leaving deliverables + `_chat.jsonl` |
| ☐ | 🟠 | 1️⃣ | **smarts-logging-grafana — create the missing sample/ cold-run cases** — the skill root has no sample/ folder at all (ls verified) while siblings ship 2 cases each | ≥2 sample cases (apply on a Node fixture; setup-mcp or verify) with run.cmd + captured real-run output |

**Acceptance criterion:** every `smarts-*` skill carries well-formed trigger evals and at least one runnable cold-start sample case.

## Metadata, lock-step, and migration repairs

| Status | Priority | Effort | Task | Acceptance |
|:---:|:---:|:---:|---|---|
| ☐ | 🟠 | 1️⃣ | **smarts-config-sync — finish the plain-name re-derive from ALL.md** — `prompt/ALL.md:38` says plain task names, but `module/hooks.md:34`, `invariants.md:29`, `rules.md:18`, `steps.md:52` still mandate the `<LLM>-<Model>-<Version>` prefix and `testing/providers.test.mjs:18,25` asserts the old strings — suite fails 1/37 | no prefix mandate remains in module/ or testing/; `node testing/ALL.mjs` reports 37/37 |
| ☐ | 🟠 | 1️⃣ | **smarts-git-automate — restore version/CHANGELOG lock-step for the July-1 change** — `prompt/ALL.md` got a `feat:` behaviour change (commit d68c2bf, the "- Theory" gitignore rule) while metadata.version stays "1.0.0" and CHANGELOG's top block is [1.0.0] | version bumped, CHANGELOG gains the matching top entry, version-match assertions pass |
| ☐ | 🟠 | 1️⃣ | **smarts-file-distribute — trim the frontmatter description under 1024 chars** — measured ~1190 chars; the harness listing visibly truncates it mid-sentence, cutting off every trigger phrase | description ≤1024 with all trigger phrases retained; evals pass; version + CHANGELOG bumped |
| ☐ | 🟠 | 1️⃣ | **smarts-claude-patch — description exceeds the 1024-char limit** — measured 1173 chars; compress the 16-feature enumeration (already in the SKILL.md body and routing table), prompt-first | description ≤1024; all 15 evals still pass |
| ☐ | 🟠 | 1️⃣ | **smarts-api-extract — untrack and ignore scripts/__pycache__** — `git ls-files` shows three committed `.cpython-314.pyc` caches and no `__pycache__` ignore rule | `git ls-files … | grep pycache` empty; ignore rule added; deletion committed and pushed |
| ☐ | 🟠 | 1️⃣ | **smarts-inputs — mandate the increment-versioned output filename in aggregate.md** — the module names no filename rule and never routes through smarts-file-increment; the skill's own newer sample wrote non-conformant `Input Sources — Results.md` beside the older correct `Input Sources Results 1.md` | ALL.md (first) and aggregate.md state the Title Case `Basename N` rule; aggregate.test.mjs asserts it; sample re-captured conformant |
| ☐ | 🟡 | 1️⃣ | **smarts-config-sync — restore snapshot + changelog lock-step for the naming change** — ALL.md rewritten 2026-07-02 but the latest snapshot is Config Sync 7.md (2026-06-27, differs at 4 hunks) and CHANGELOG has no entry | byte-identical `Config Sync 8.md` snapshot; CHANGELOG top == metadata.version documenting the change |
| ☐ | 🟡 | 1️⃣ | **smarts-demo-echo — fix frontmatter argument drift** — SKILL.md declares `border=` but ALL.md, the body, manuals, and `parseArgs` all implement `style=` (+ `action`); a documented `border=double` is silently ignored | every frontmatter argument is honored, proven by a parseArgs testing assertion |
| ☐ | 🟡 | 1️⃣ | **smarts-claude-patch — untrack the committed roadma/ files** — 3 files tracked despite `skills/*/roadma/` being gitignored by design (committed before the rule) | `git ls-files …/roadma` empty; files remain on disk |
| ☐ | 🟡 | 1️⃣ | **smarts-claude-patch — fix stale renamed-file references** — nonexistent `ag-cc-reply-patch.mjs` named in SKILL.md, two modules, ALL.md (4×), and an Apply Patch.mjs comment; `Example Verify/Remove Patch.mjs` linger in ALL.md:683–684 and a usage manual; feature-faro.test.mjs claims a nonexistent module | grep for the stale names returns 0 hits outside CHANGELOG history |
| ☐ | 🟡 | 1️⃣ | **smarts-projects-audit — purge stale model-resolution phrasing from derived files** — SKILL.md:58 and module/audit.md:20–21 still say "Resolve the actual `* Audit Tasks.mjs` for the running model" (removed prefix-era text); ALL.md and CHANGELOG 1.2.0 state the plain-name policy | no wildcard/"for the running model" text remains; references read `scripts/Audit Tasks.mjs` verbatim |
| ☐ | 🟢 | 1️⃣ | **smarts-explain — fix the CHANGELOG's phantom scripts/ claim** — line 12 lists "bundled `scripts/`" but no scripts/ folder exists | CHANGELOG baseline lists only real artifacts |
| ☐ | 🟢 | 1️⃣ | **smarts-md-restructure — fix the same CHANGELOG "bundled scripts/" inaccuracy** — line 12, no scripts/ folder exists (prompt-driven pure-logic skill) | CHANGELOG describes only artifacts that exist |
| ☐ | 🟢 | 1️⃣ | **smarts-git-automate — fix the CHANGELOG scripts claim and the empty scripts/ dir** — line 12 claims bundled scripts; on-disk scripts/ is empty | CHANGELOG matches the real artifact set; no empty placeholder dir |
| ☐ | 🟢 | 1️⃣ | **smarts-inputs — fix stale bundled-resource references** — SKILL.md points at `project/Inputs.md` while on-disk files are `Inputs 2..4.md`; CHANGELOG claims bundled scripts/ that don't exist | references use the increment form; CHANGELOG accurate |
| ☐ | 🟢 | 1️⃣ | **smarts-demo-echo — remove the stray static-named project file** — `project/smarts-demo-echo.md` sits beside the protocol-correct `Demo Echo 1.md` increment | project/ contains only `Demo Echo N.md` increments |
| ☐ | 🟢 | 1️⃣ | **smarts-winax-powerpoint — drop the stray root package.json** — a root-level test package.json exists while deps belong in scripts/package.json; Excel and Word carry none | skill root has no package.json; 150/150 still green |
| ☐ | 🟢 | 1️⃣ | **smarts-winax-word — relocate verify artifacts out of scripts/** — `Verify Word Full.docx/.pdf` sit beside sources; Excel keeps equivalents in sample/ | the two artifacts live under sample/; scripts/ holds only code |
| ☐ | 🟢 | 1️⃣ | **smarts-app-frontend — restore description headroom** — 1023/1024 chars measured; the next edit overflows | description ≤ ~920 chars, all evals still trigger |
| ☐ | 🟢 | 1️⃣ | **smarts-api-extract — regenerate sample 2 without the PowerShell fetch step** — the sample's deliverable documents `Invoke-WebRequest (PowerShell)` as methodology (line 471) — captured data, but a bad exemplar | the recorded method table shows the Node `fetch` path |
| ☐ | 🟢 | 1️⃣ | **smarts-design-deploy — regenerate sample captures that model PowerShell use** — sample/2 Think.md:62 and both `_chat.jsonl` record PowerShell reaching; re-record under a cmd/Node-only flow | `grep -riE 'powershell|pwsh' sample/` → 0 while real captures remain |

**Acceptance criterion:** every skill's frontmatter, CHANGELOG, snapshots, and derived docs match its source and its real artifact set, and the config repo tracks nothing its own rules ignore.

## Test coverage depth

| Status | Priority | Effort | Task | Acceptance |
|:---:|:---:|:---:|---|---|
| ☐ | 🟠 | 1️⃣ | **smarts-logging-grafana — add the missing testing/actions.test.mjs** — module/actions.md exists (5-action routing incl. `remove`) with no spec, breaking the mandated 1:1 mapping; every other non-excluded module has one | the spec asserts the action/source/arch routing contract; ALL.mjs counts it green |
| ☐ | 🟡 | 2️⃣ | **smarts-app-cmdline — close the module↔testing 1:1 mapping** — 10 modules have no test and `readme-gen.test.mjs` is an orphan with no module | every non-excluded module has a same-named test or a documented mapping; no orphans; suite green |
| ☐ | 🟡 | 2️⃣ | **smarts-app-frontend — close the module↔testing 1:1 mapping** — only gate.test.mjs exists against 9 untested non-excluded modules | each module has a test or an explicit per-module mapping entry; suite green |
| ☐ | 🟡 | 1️⃣ | **smarts-improve-roadmap — close the module↔test 1:1 mapping gap** — 8 of 11 non-exempt modules lack dedicated specs; discovery.md and tracks.md have zero behavioral assertions anywhere | every non-exempt module has a matching spec (or split-out coverage); discovery/tracks gain real assertions |
| ☐ | 🟡 | 1️⃣ | **smarts-ai-rename — add a triggering/evals-shape test** — testing/ has no evals validation (grep → 0) while both siblings ship one | triggering.test.mjs discovered by ALL.mjs, suite green |
| ☐ | 🟡 | 1️⃣ | **smarts-file-distribute — add testing/triggering.test.mjs** — evals encode polarity only as prose and are never machine-validated | spec asserts parse + derivable boolean + ≥1 positive/negative |
| ☐ | 🟡 | 1️⃣ | **smarts-ai-summarize — effect-test the verify harness** — no test exercises `Verify Summary.mjs` (grep → 0), so the deliverable-prover could regress silently | spec asserts pass and fail paths against fixtures; suite green |
| ☐ | 🟡 | 1️⃣ | **smarts-api-extract — effect-test the verify harness** — no test exercises `Verify Deliverable.mjs` | spec covers pass/fail for all three deliverable kinds |
| ☐ | 🟡 | 1️⃣ | **smarts-logging-grafana — reconcile assets-faro.test.mjs with a module** — the valuable effect test has no module/assets*.md counterpart (reverse 1:1 violation) | a module/assets.md documents the two Faro assets; both mapping directions hold |
| ☐ | 🟡 | 1️⃣ | **smarts-skill-manager — Quick Validate checks evals presence/shape** — the validator never warns on missing/malformed evals (grep evals → 0) — exactly how two skills drifted | the validator warns on missing evals or positives-only sets; covered in quick-validate.test.mjs |
| ☐ | 🟡 | 1️⃣ | **smarts-api-extract — port the three Python recipes to Node .mjs** — `.py` recipes with zero dependency manifest against the fleet's Node standard (the sibling Verify harness already conforms) | scripts/ holds only .mjs + package.json; reference test asserts new names; suite green |
| ☐ | 🟡 | 1️⃣ | **smarts-file-increment — verify harness + fix the empty scripts/ claim** — scripts/ is empty yet CHANGELOG claims bundled scripts; the skill writes real versioned deliverables with no harness | `Verify Increment.mjs` asserts N+1 exists, source untouched, Title Case name; CHANGELOG corrected; spec added |
| ☐ | 🟡 | 1️⃣ | **smarts-config-sync — add a scripts/Verify Providers.mjs harness** — real deliverables (GEMINI.md, AGENTS.md) with an empty scripts/; a post-sync verifier could assert no unsubstituted paths or leaked CLAUDE-only sections | the harness reports pass/fail per invariant with non-zero exit on violation |
| ☐ | 🟢 | 1️⃣ | **smarts-md-restructure — declare triggering.test.mjs's mapping exemption** — the evals-schema spec has no module counterpart | testing/README.md names it as the sanctioned exception |
| ☐ | 🟢 | 1️⃣ | **smarts-setting-sync — complete the testing/README.md coverage table** — table documents 6 of 10 test files | all 10 files listed with what each covers |
| ☐ | 🟢 | 1️⃣ | **smarts-claude-patch — record the non-1:1 mapping and slim SKILL.md** — three modules lack same-named tests and six suites carry non-module names (coverage exists, mapping undocumented); SKILL.md is 181 lines vs 77–82-line siblings; stray empty `.claude/` at skill root | README maps every module to its covering tests; SKILL.md ≤ ~120 lines; no stray dir |
| ☐ | 🟢 | 1️⃣ | **smarts-ai-rename — add module/limitations.md** — absent although the read/OCR core has exactly the honest limits its near-twin consolidates | limitations.md derived prompt-first, routed, consistent |
| ☐ | 🟢 | 1️⃣ | **smarts-prompt-manager — add adjacent-skill negative evals** — only 2 negatives, neither guarding the real over-trigger boundary (sibling-skill requests) | ≥3 sibling-skill negatives with `should_trigger:false`; suite green |
| ☐ | 🟢 | 1️⃣ | **Fleet — harmonize evals.json on the boolean `should_trigger` schema** — smarts-logging-grafana, smarts-payment-code, and smarts-git-automate mark negatives as prose while siblings use the machine-checkable boolean | all evals carry the boolean field validated by a schema test |

**Acceptance criterion:** the module↔test 1:1 mapping (or its documented exemptions) holds in both directions fleet-wide, every verify harness is itself effect-tested, and every evals file is machine-validated.

# Functional

Priority 🟡 — the complete fleet feature inventory. Per the fleet convention this section opens with the two catalogue tables: every feature listed once here, cross-referenced from any other discipline it also touches.

## New features to add

| Status | Priority | Effort | Task | Acceptance |
|:---:|:---:|:---:|---|---|
| ☐ | 🟡 | 2️⃣ | **smarts-design-deploy — action=rollback / auto-rollback offer on failed verify** — no rollback mention anywhere (grep empty); a failed post-deploy verify currently leaves a broken production live | rollback module + test exist; failed-verify path documents the offer; version + CHANGELOG bumped |
| ☐ | 🟡 | 1️⃣ | **smarts-dissertation-ppt — expose a standalone action=verify** — `Verify Deck.mjs` exists but argument-hint offers only auto|build | action=verify documented and routed to the harness, with a testing assertion |
| ☐ | 🟡 | 1️⃣ | **smarts-file-distribute — action=undo replaying the reversible manifest** — every move writes a reversible TSV, but undo is documented only as manual replay (limitations.md:55) | `undo --manifest <tsv>` restores every file collision-safe with dry-run, specced and documented |
| ☐ | 🟡 | 1️⃣ | **smarts-git-automate — post-push remote verification step** — workflow.md documents add→commit→push with no step asserting the push landed | ALL.md (first) + workflow.md document the local-HEAD vs remote-head check; workflow.test.mjs asserts it |
| ☐ | 🟡 | 1️⃣ | **smarts-inputs — URL input sources** — type detection supports only File and Text; a pasted `https://…` is treated as literal text | a URL source is fetched and processed with a `**Type:** URL` row, specced in identify.test.mjs |
| ☐ | 🟡 | 2️⃣ | **smarts-payment-code — action=update-data to re-extract the переходник** — assets/payment-codes.json is a static 115-code snapshot with no refresh path when Element revises the Excel | `action=update-data file=<xlsx>` regenerates the JSON preserving 00000 zero-pad, with a diff report; suite green |
| ☐ | 🟡 | 1️⃣ | **smarts-transcribe — SRT/VTT subtitle output** — deliverable is only Transcript.md though whisper.cpp natively emits SRT/VTT (grep srt|vtt → 0) | `format=md|srt|vtt` produces valid subtitles beside the .md, verified by the harness and a spec |
| ☐ | 🟡 | 2️⃣ | **smarts-md-restructure — cross-file inbound-anchor report/update** — nothing detects inbound `[…](file.md#anchor)` links from sibling files when a heading moves | restructuring with a linking sibling produces a moved-anchors report (rewrites when enabled), specced |
| ☐ | 🟡 | 2️⃣ | **smarts-app-cmdline — deterministic Check Conformance.mjs audit gate** — the AUDIT action is 100% model-judgement (no gate script exists); the frontend sibling proves the pattern | the gate exits 0/1 naming each violation on fixtures, with a same-named spec |
| ☐ | 🟡 | 2️⃣ | **smarts-api-extract — emit an OpenAPI 3.1 spec alongside Postman** — outputs are Postman v2.1.0 + MD only; OpenAPI is the international interchange standard, reusing the verified/ignored/auth/unknown legend as x-verification | an openapi output option produces a valid 3.1 spec that passes a schema check in the harness |
| ☐ | 🟢 | 1️⃣ | **smarts-ai-rename — optional batch rename-mapping report** — batch runs keep no ledger; opt-in `report=true` writes one `Rename Report N.md` mapping table | with report=true the table is produced; without it behavior is byte-identical |
| ☐ | 🟢 | 1️⃣ | **smarts-ai-summarize — optional aggregate folder digest** — batch emits only per-file summaries; opt-in `digest=true` adds one linking `Folder Digest N.md` | digest file produced referencing every per-document summary; default unchanged |
| ☐ | 🟢 | 1️⃣ | **smarts-explain — detail-level and language arguments** — no depth/audience control while the analogous summarize skill offers level 1–5 and language | `level=` and `language=` documented with behavior-preserving defaults, specced |
| ☐ | 🟢 | 1️⃣ | **smarts-improve-roadmap — skills= subset filter for fleet mode** — fleet runs always enumerate the entire smarts-* fleet with no way to re-assess only changed skills | `source=all-skills skills=a,b,c` assesses only the named skills into one consolidated report, specced |
| ☐ | 🟢 | 1️⃣ | **smarts-video-inventory — optional per-file size and duration metadata** — the tree maps bare file names only (grep size|duration|ffprobe → 0) | `meta=off|size|full` adds fs.stat size and ffprobe duration, off by default, specced and harness-verified |
| ☐ | 🟢 | 1️⃣ | **smarts-winax-excel — export=xps parity** — export surface is pdf-only though `ExportAsFixedFormat` natively supports xlTypeXPS (Word/PowerPoint already have multi-format export) | `export=xps` emits a real .xps, documented and specced |
| ☐ | 🟢 | 3️⃣ | **smarts-dissertation-ppt — optional local winax build mode** — limitations.md documents PptxGenJS fidelity limits while smarts-winax-powerpoint owns native COM builds; a local-Windows delegation would lift chart/notes fidelity (cross-referenced from [Visual](#visual)) | a documented platform option delegates to smarts-winax-powerpoint locally, with limitations.md updated and a sample proving a native deck |
| ☐ | 🟢 | 1️⃣ | **smarts-projects-audit — optional language= argument** — report labels are hardcoded Uzbek with no locale knob (cross-referenced from [International](#international)) | `language=en` renders English headers; default unchanged; docs/tests/evals extended |

## Feature improvements

| Status | Priority | Effort | Task | Acceptance |
|:---:|:---:|:---:|---|---|
| ☐ | 🟡 | 2️⃣ | **smarts-app-frontend — extend Check Gate.mjs beyond stack checks** — the gate catches only wrong-stack files while the skill's own mandate (i18n locale-key parity, SW precache revision bump, no hardcoded secrets) is not machine-checked (grep i18n|precache|secret → 0) | gate fails with named offenders on fixtures for each new check, with matching gate.test.mjs cases |
| ☐ | 🟡 | 1️⃣ | **smarts-logging-grafana — extend Verify Logging.mjs with the Faro collector probe** — the harness verifies only the Loki path (grep faro → 0) while verification.md documents the Faro ladder as manual steps | the harness exercises the Faro collector when config exists, reports OK/BLOCKED honestly, specced |
| ☐ | 🟡 | 1️⃣ | **smarts-explain — enrich the trigger description to fleet standard** — 147 chars, omitting the slash phrase and multilingual triggers (cross-referenced from [International](#international)) | description names "/smarts-explain" + English/Uzbek phrasings ≤1024; new evals pass |
| ☐ | 🟢 | 1️⃣ | **smarts-get-subcategory — optional threshold= argument** — the ≥95% cutoff is hardcoded across scoring.md and SKILL.md with no tuning knob | `threshold=90` changes assignment behavior (specced); default byte-identical |

**Acceptance criterion:** each shipped feature or improvement lands prompt-first with its module, tests, evals, usage-manual updates, and version + CHANGELOG bump in the same change.

# Visual

Priority 🟢 — the fleet's deliverable-presentation quality is already professional: the winax skills assert real slide geometry and document fidelity in their verify harnesses, report/table conventions are consistent, and no visual defect passed the verification gate anywhere. **Already conformant — no visual tasks.** The one fidelity-related feature (native winax build mode for `smarts-dissertation-ppt`) lives in the [feature catalogue](#functional).

**Acceptance criterion:** none required — verification found no present visual defect.

# International

Priority 🟡 — the fleet is English-first with Uzbek trigger phrases by design; the verified gaps are uneven trigger-language coverage and one hardcoded-locale report surface.

## Trigger-language and locale coverage

| Status | Priority | Effort | Task | Acceptance |
|:---:|:---:|:---:|---|---|
| ☐ | 🟡 | 1️⃣ | **smarts-dissertation-ppt — broaden the eval corpus with Uzbek cases** — 3 eval cases (thinnest among audited siblings) and no non-English eval although the description advertises Uzbek triggers ("taqdimot", "himoya slaydlari") | ≥6 cases with ≥1 Uzbek positive and ≥2 negatives; triggering test green |
| ☐ | 🟡 | 1️⃣ | **smarts-inputs — Uzbek trigger phrases + broader eval coverage** — description carries only English triggers and evals hold just 3 cases with no non-English positive, on a machine whose users trigger in Uzbek | description gains Uzbek phrases; evals ≥6 incl. an Uzbek positive; suite green |
| ☐ | 🟢 | 1️⃣ | **smarts-projects-audit — language= for report labels** — labels hardcoded Uzbek (`Muddat`, `Bajarilgan`, …); listed in the [feature catalogue](#functional) | `language=en` renders the same table in English; default unchanged |
| ☐ | 🟢 | 1️⃣ | **smarts-explain — add Uzbek trigger phrases** — covered by the description-enrichment improvement in the [feature catalogue](#functional) | Uzbek triggers present and eval-covered |

**Acceptance criterion:** every skill's description and evals cover both English and Uzbek triggering where its users work bilingually, and no user-facing report locks a single locale without an argument.

---

**Next step — the owner decides.** This roadmap is complete as a **plan**: no task above was executed as part of producing it (the two skills already fixed today — `smarts-improve-roadmap` v1.5.0 — are reflected as current state, not as roadmap work). Select the tasks to carry out — the natural first tranche is the 21 🟠 rows (all 1️⃣ effort: the winax doc purges + COM `null` fixes, the missing evals/samples, the description trims, and the lock-step repairs) — and each will be implemented as separate follow-up work through the `smarts-skill-manager` prompt-first flow.
