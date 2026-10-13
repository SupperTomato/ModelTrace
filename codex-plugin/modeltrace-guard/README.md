# ModelTrace Guard (English)

Original author: xqy2006. English edition maintained in [SupperTomato/ModelTrace](https://github.com/SupperTomato/ModelTrace).

Monitor Codex task fingerprints with English probes in disposable forks of frozen task snapshots. Normal results are saved silently; the original task does not wait for probes or receive their numeric arrays. Mismatches trigger notification and additional retries. The bundled ModelTrace bank scores samples locally. Generation uses Codex's configured account, model, and provider and consumes inference quota; no separate API key is needed.

## Install from GitHub

```sh
codex plugin marketplace add SupperTomato/ModelTrace
codex plugin add modeltrace-guard@modeltrace
```

Alternatively, download this fork and run from its repository root:

```sh
codex plugin marketplace add .
codex plugin add modeltrace-guard@modeltrace
```

The marketplace entry is `.agents/plugins/marketplace.json`. The plugin resides in `codex-plugin/modeltrace-guard/`, with its manifest in `.codex-plugin/plugin.json`.

Requires Node.js 18+ and a Codex App Server supporting native snapshot forks, ephemeral tasks, task deletion, and asynchronous hooks. Run `node scripts/guard.mjs doctor --fork true` from the plugin directory to check compatibility. If several runtimes are installed, set `MODELTRACE_CODEX_PATH` to the absolute path of the executable accompanying your Codex desktop app.

### Load and trust

1. Open a new Codex task after installation to load the plugin.
2. Start a compatible `codex` CLI and enter `/hooks` in its interactive input. This is not a shell command.
3. Find ModelTrace Guard and review and trust the required hooks: synchronous `PreToolUse`, and asynchronous `SessionStart`, `UserPromptSubmit`, and `PostToolUse`. Review again if an update changes the hook definitions.
4. Ask to enable monitoring in the intended task. The runner verifies that the blocking hook is enabled and trusted.

## Enable, configure, and stop

Example requests in the intended task:

> Use $modeltrace-guard to monitor this task every 16–32 work-tool calls, with 3 additional retries after a mismatch and English probes.

> Change the retry count to 5.

> Stop monitoring the current task.

Command examples from the plugin directory (`CODEX_THREAD_ID` must identify the intended task):

```sh
node scripts/guard.mjs doctor
node scripts/guard.mjs doctor --fork true
node scripts/guard.mjs start --tool-min 16 --tool-max 32 --retry-count 3 --languages en
node scripts/guard.mjs configure --retry-count 5
node scripts/guard.mjs status
node scripts/guard.mjs dashboard
node scripts/guard.mjs stop
```

`doctor --fork true` tests native forks, background hooks, and cleanup without inference. `start` queues the first check and returns immediately; background hooks execute it automatically. The agent does not need to run `probe` or poll. Starting from an external terminal queues work for the target task's next loaded, trusted hook; it does not wake an idle task.

Use `--expected <exact-model-label>` to select the comparison label, or `--expected auto` to follow Codex metadata. A missing expected label and an unlisted label are distinct outcomes. Historical samples retain the label known at sampling time.

| Setting | Default and meaning |
| --- | --- |
| `--tool-min N --tool-max M` | 16–32 observed work-tool completions; N=M fixes the interval |
| `--retry-count N` | Additional retries after the initial mismatch; default 3, range 1–100 |
| `--pending-seconds N` | Issuance-to-scoring deadline; default 180 seconds, not a sampling interval |
| `--languages en` | English only, for every new probe |

Historical language codes (`zh/en/ja/ko/fr/de/es/pt/ru/ar`) remain accepted for configuration compatibility and normalize to `en`. Upgrading interrupts unfinished non-English probes and retry batches before starting an English segment. Existing sample labels, alerts, counters, and task halts are preserved; old evidence is never relabeled as English.

There are no per-turn or task-total limits. Idle tasks do not start new samples; background checks already running may finish after the answer. At most one probe is in flight per task, even when several tools complete simultaneously. Configuration changes preserve history; an English retry batch retains the settings with which it began.

Existing tasks retain saved intervals. Change an enabled task through the dashboard or ask: "Set the sampling interval to 16–32 work-tool calls."

The dashboard separates tasks rather than merging by working directory. The first background snapshot reads the native task title; a custom name takes priority. If no title is available, the dashboard shows an unnamed task with workspace and time. Stopped tasks retain their history. Opening the page or selecting a task does not enable sampling.

## Background operation

`SessionStart`, `UserPromptSubmit`, and `PostToolUse` use native `async: true` command hooks. The worker forks, generates, scores, and cleans up. Normal checks do not inject instructions into the original task or block tools and final answers. Inspect `status` or the dashboard when needed.

Mismatches are saved immediately after scoring. An asynchronous hook delivers the alert at the next safe Codex boundary; synchronous `PreToolUse` also checks pending notifications. An already-running request or tool is not forcibly cancelled. Idle tasks are not automatically awakened; the alert waits for the next turn. A connected dashboard can receive live alerts independently.

Stopping monitoring, interrupting the task, compacting context, or ending the task invalidates the associated probe. Late results are excluded. Monitoring depends on task hooks, not on a permanently running dashboard server.

A sampling fork explicitly distinguishes itself from the original task. It answers one integer request without taking over the original `/goal` or plugin management. Valid output is one complete JSON integer array, optionally wrapped in one JSON or unmarked code block. Mixed prose, multiple arrays, and incomplete samples are rejected rather than repaired.

Failures appear in `forkHealth.diagnostic`, `fork_probe_failed` history events, and the dashboard. Diagnostics include stage, type, and available character/array counts, but omit raw failed responses, numbers, and task context. Invalid samples are coverage gaps and never count as mismatches. Queuing another check does not mean a check succeeded.

## Frozen snapshot and cleanup

1. Native `thread/fork` creates a persisted temporary baseline. It runs no model turn and accepts no later work.
2. The initial check and every retry independently fork that baseline with `ephemeral: true`, the same `lastTurnId`, and the original working directory. Only one explicit probe turn is allowed; extra automatic turns close the temporary process.
3. Each child returns one array; a trusted hook blocks tool calls. The runner reads the result, closes the temporary Codex process, and scores offline. Normal results remain local; a mismatch sends candidates, time, and notification instructions to the original task.
4. After the check or retry batch, a cleanup process verifies task ownership, turn boundaries, and persisted descendants (including archived descendants), then deletes the baseline using `thread/delete`. A used or altered baseline, or one with new persisted descendants, is retained with a cleanup diagnostic.

Temporary baselines may briefly appear in the task list; do not use them for work. Every retry reads the initial snapshot, excluding earlier probe numbers and later original-task messages. The original task's existing messages remain unchanged.

Snapshots inherit Codex's persisted context and compaction results. The plugin does not concatenate full historical messages into the prompt. `sha256Scope: turn_boundaries_v1` hashes turn boundaries, not complete message content. Unsaved in-flight content is absent; an active turn may include Codex's interruption marker.

For ChatGPT login with the default Codex service, probes reuse the original task's cache session while retaining independent task and turn IDs. Only the local probe connection's cache-session header is adjusted; context, compacted body, tools, model, and reasoning effort remain unchanged. `fork.cacheScope: source_session` records this behavior. `fork.usage.cachedInputTokens` is the count returned by Codex; `null` means no count was provided.

API-key login, custom endpoints, proxies, and custom CA settings use the native Codex connection (`fork.cacheScope: native_fork`). Cache expiry, compaction, or changed prefixes can require a fresh cache.

The model, provider, reasoning effort, and workspace come from Codex task metadata. Missing configuration causes an explicit failure; the plugin does not read local transcripts or fall back to global model defaults.

## Alerts and task stops

The first candidate mismatch creates an alert: tell the user the expected label, leading fingerprint candidate, and time, then acknowledge notification. The background worker runs the configured N additional retries without the normal interval or nested batches. Original work pauses during retries. The returned `wait --confirmation <ID>` command observes progress for up to 30 seconds without generating a probe.

Notify and acknowledge every mismatching retry. Compatible retries advance automatically. Only N valid mismatches trigger a task halt; any compatible retry prevents a halt from that batch, while preserving the initial anomaly. Missing, invalid, expired, or interrupted samples never count as mismatches.

After a halt, `PreToolUse` denies supported subsequent work tools. Direct plugin status, notification acknowledgment, stopping, and explicitly authorized resumption commands remain available. The agent must stop work and summarize all retry candidates. Already-running commands, hosted tools, and paths that do not pass through this hook are outside its complete blocking scope.

Only after the user explicitly asks to resume may the agent run `resume --halt <current-halt-ID>`. Stopping monitoring, acknowledging an alert, changing settings, or switching models does not release the halt.

The dashboard receives alerts through an authenticated event stream. Enable desktop alerts and grant browser permission for system notifications. Keep the page connected; browser and OS settings can limit delivery. Without permission, page alerts and agent notifications remain available. The full local URL contains an access credential; keep it private.

## Restart, storage, and cleanup state

Settings use a stable data directory: `~/.codex/modeltrace-guard`, overridden with `MODELTRACE_GUARD_DATA`. Reopening the task triggers self-checks through startup/resume hooks; runtime verification requires newly observed work-tool activity. The dashboard server and task monitoring are independent. Closing the page does not stop monitoring.

State files retain recent records; `_history` stores full samples, events, and acknowledged alerts for dashboard pagination. Schema migration preserves history. A state lock is reclaimed only after confirming its owning process has exited. Unverifiable locks produce an error requiring inspection.

`_fork_cleanup/<baseline-ID>.json` tracks `active`, `pending`, `deleted`, or `blocked` cleanup. Startup/resume scans old cleanup records. Manual cleanup:

```sh
node scripts/fork-cleanup.mjs <data-directory>
```

Blocked items are skipped by default. After inspecting their cause, add `--retry-blocked` to recheck. Cleanup deletes only verified temporary baselines, never unrelated tasks; failures retain target information and errors.

## Fingerprints, calibration, and validation

The plugin bundles root `data/unified_bank.json`, `static/fingerprint-core.js`, and `static/styles.css`. Source paths and checksums appear in `assets/provenance.json`. Nothing is automatically downloaded or updated at runtime.

Results compare output characteristics within the bank; they do not authenticate earlier original-task backend requests. Long contexts, prompt language, and output channels can change distributions; shared-snapshot retries may be correlated. English probes and shared-context thresholds have not been independently recalibrated. This fork preserves the upstream numeric banks; translated historical metadata is documented in the [root README](../../README.md).

Offline evaluation:

```sh
node scripts/evaluate-calibration.mjs <independent-holdout.jsonl>
```

Records require `split: holdout`, `mode: ephemeral_fork`, a controlled true-model label, expected label, candidate, language, snapshot ID, sample ID, bank hash, and retry index. Evaluation groups by snapshot and measures observed false-alert and stop rates; it does not assume three correlated retries have the cube of a single-check error rate. With no dataset it explicitly reports no independent validation; it does not collect data, fit thresholds, or modify the bank.

## Build and test

From the repository root:

```sh
node codex-plugin/build-plugin.mjs
node codex-plugin/validate-distribution.mjs
node codex-plugin/validate-reference-data.mjs
node --test --test-concurrency=1 codex-plugin/modeltrace-guard/tests/*.test.mjs
node codex-plugin/verify-parity.mjs
```

Tests cover protocols, concurrency, silent normal checks, cancellation, late results, same-snapshot retries, cleanup boundaries, migration, pagination, alerts, and synchronous blocking. Score parity uses existing reference samples. Attribution accuracy requires an independent validation dataset.
