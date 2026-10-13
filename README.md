# ModelTrace (English)

An English edition of [xqy2006/ModelTrace](https://github.com/xqy2006/ModelTrace), a local model fingerprint attribution tool. Three independent integer-generation challenges produce output fingerprints that are compared with a unified reference bank to rank model families and versions.

The web interface, generated challenges, API messages, ModelTrace Guard plugin, and documentation are in English. The upstream author is xqy2006; this fork maintains the English conversion.

## Run locally

Requires Python 3.10 or later.

```sh
python -m venv .venv
# Linux/macOS:
. .venv/bin/activate
# Windows PowerShell instead:
# .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python start.py
```

Open `http://127.0.0.1:7860/`.

## GitHub Pages

The [browser-only edition](https://suppertomato.github.io/ModelTrace/) supports manual tests without a backend. Challenge generation, fingerprint bank loading, and scoring run locally in the browser. The included GitHub Actions workflow deploys `static/` to GitHub Pages.

To serve it locally from the repository root:

```sh
python -m http.server 7860 --directory static
```

Open `http://127.0.0.1:7860/`. API testing and fingerprint collection require the Python app.

## Use

- **Manual testing:** Copy the three challenges, send each separately to the same model, and paste each complete response.
- **Automatic API testing:** Supply the base URL, API key, and model name. The app tries OpenAI Chat Completions and Anthropic Messages formats and aims to collect three usable responses.
- **Fingerprint management:** Create a bank or collect fingerprints for additional models through an API.

API keys are used for requests from the current page and are not written to disk. Collection stores the actual user prompt, base prompt, system prompt, and user prefix in the corresponding `*_reference.jsonl`. Fitted `*_bank.json` and `unified_bank.json` files store statistical fingerprints and calibration parameters.

## ModelTrace Guard for Codex

[ModelTrace Guard](codex-plugin/modeltrace-guard/README.md) monitors a Codex task at configurable work-tool intervals. It generates English probes in disposable forks of frozen task snapshots, scores them locally, and cleans up temporary branches. Normal results are saved silently; original work does not wait for normal probes.

Configure the tool interval, additional mismatch retries (default 3), and submission deadline. There are no per-turn or task-total probe limits. The dashboard provides paginated history and live alerts. An initial mismatch requires notification and a pause; if all additional retries mismatch, the task must stop and supported subsequent work tools are blocked. Probe generation uses the configured Codex account and consumes inference quota. Refreshing the dashboard does not call a model.

Installation does not enable monitoring. Review and trust the plugin hooks in the Codex CLI's `/hooks`, then enable monitoring in the intended task. See the [plugin guide](codex-plugin/modeltrace-guard/README.md) for installation, configuration, and interpretation.

## Fingerprint method

Every model uses the same global feature space, features, and weights:

```text
0.75 × Hellinger centroid similarity after removing environment directions
+ 0.25 × ordered-block numerical sequence features
```

Bank construction estimates nuisance directions from average offsets across shared environments. Attribution projects those directions out of the numerical distribution and ordered features, then compares against all model centroids. The three responses are scored separately and averaged. A query-count-specific calibrated temperature converts scores to closed-set weights.

One global softmax gives model weights; family weights sum their member model weights:

```text
P(model) = softmax(beta × global model score)
P(family) = sum of P(model) for that family's models
```

These weights assume a uniform prior over the current bank. An unlisted model is still assigned to the closest listed candidate.

## Reference data and English localization

The supplied bank contains two families and 18 model labels:

```text
gpt-5.4
gpt-5.5
gpt-5.6-luna
gpt-5.6-terra
gpt-5.6-sol
gpt-6-astra
gpt-6-sol
gpt-6-luna
claude-haiku-4-5-20251001
claude-haiku-5-5
claude-sonnet-4-6
claude-sonnet-5
claude-sonnet-5-5
claude-opus-4-6
claude-opus-4-7
claude-opus-4-8
claude-opus-5
claude-opus-5-5
```

According to the upstream collection metadata, GPT samples were collected through a Codex subscription and Claude samples through [OAIPro](https://api.oaipro.com/). These are reference labels, not independent verification of provider routing or current model availability.

Historical non-English prompt metadata and response explanations are translated to English. Each changed field has `localization` metadata identifying its source language, source SHA-256, and representation. These records are translations of historical collection, **not newly collected English samples**. Original fields are available in the upstream Git history at the revision recorded in [data/localization.json](data/localization.json).

Every parsed numeric sequence and all fitted banks are preserved. The localization manifest records bank hashes and sequence hashes; tests check them. New English prompts preserve the count, range, and direct-generation constraints, but language can affect output distributions. This fork does not claim independent recalibration or an accuracy guarantee for English prompts.

## Limitations

Results are reference-bank similarity evidence, not decisive proof of backend identity, model replacement, reduced capability, or provider cheating. Any result is possible for models absent from the bank.

System prompts can substantially affect numerical preferences. Upstream reports significant bias in Claude Code and recommends avoiding tests there. Long contexts and shared-context retries can also change distributions or correlate results.

## Project layout

```text
app.py                   Web API
fingerprint.py           Fingerprint extraction and attribution
bank_builder.py          Bank construction and calibration
challenge_suite.py       English enrollment challenges
enrollment.py            API requests and fingerprint collection
rebuild_unified_bank.py   Unified bank rebuild
data/                    Reference data, banks, localization provenance
static/                  Browser edition and shared assets
templates/               Python web templates
codex-plugin/            ModelTrace Guard plugin and tests
tests/                   English and reference-integrity checks
```

## Build and verify

```sh
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
node codex-plugin/build-plugin.mjs
node codex-plugin/validate-distribution.mjs
node codex-plugin/validate-reference-data.mjs
node --test --test-concurrency=1 codex-plugin/modeltrace-guard/tests/*.test.mjs
node codex-plugin/verify-parity.mjs
```

## Acknowledgments

Thanks to [hanlinwenyuan/hlwy-ai-checker](https://github.com/hanlinwenyuan/hlwy-ai-checker), an early use of language-model numerical generation bias for third-party API consistency checks, and the [LINUX DO](https://linux.do/) community.
