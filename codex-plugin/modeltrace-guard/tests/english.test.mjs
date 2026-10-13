import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LANGUAGES, LEGACY_LANGUAGES, localizedPrompt, forkPrompt } from '../scripts/prompts.mjs';
import { issue, newState, readState, sessionPath, validateConfig, withState } from '../scripts/state.mjs';

const foreign = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u3000-\u303f\uff01-\uff65]/u;

test('all supported legacy configurations produce English probes with direct-generation constraints', () => {
  assert.deepEqual(LANGUAGES, ['en']);
  for (const language of LEGACY_LANGUAGES) {
    assert.deepEqual(validateConfig({ languages: [language] }).languages, ['en']);
    for (const prompt of [localizedPrompt(language, 310, 'fixture-submit'), forkPrompt(language, 310)]) {
      assert.doesNotMatch(prompt, foreign);
      assert.match(prompt, /310 integers from 1 through 355/);
      assert.match(prompt, /Allow repeats/);
      assert.match(prompt, /Do not (?:sort|call tools)/);
    }
    assert.equal(forkPrompt(language, 310), forkPrompt('en', 310));
    const state = newState('english-fixture');
    state.enabled = true; state.forceProbe = true; state.config = validateConfig({ languages: [language] });
    assert.equal(issue(state, Date.now()).language, 'en');
  }
  assert.throws(() => forkPrompt('unknown', 310), /Unsupported probe language/);
});

test('upgrading an unfinished non-English retry batch preserves evidence and halts across restart', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'modeltrace-english-migration-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const state = newState('legacy-task', 1000);
  state.enabled = true; state.config.languages = ['zh', 'en'];
  state.samples = [{ challenge: 'old', at: 2000, language: 'zh', text: 'historical metadata', numbers: [1, 2, 3] }];
  state.alerts = [{ id: 'old-alert', at: 2000, language: 'zh' }];
  state.pending = { id: 'pending', language: 'zh', confirmationId: 'batch' };
  state.confirmation = { id: 'batch', status: 'active', language: 'zh', results: [] };
  state.taskHalt = { id: 'existing-halt', at: 2000 };
  state.issued = 5;
  await writeFile(sessionPath(dir, state.session), JSON.stringify(state));
  await withState(dir, state.session, () => {});
  const migrated = await readState(dir, state.session);
  assert.deepEqual(migrated.config.languages, ['en']);
  assert.deepEqual(migrated.samples, state.samples);
  assert.deepEqual(migrated.alerts, state.alerts);
  assert.deepEqual(migrated.taskHalt, state.taskHalt);
  assert.equal(migrated.issued, 5);
  assert.equal(migrated.pending, null);
  assert.equal(migrated.confirmation.status, 'interrupted');
  assert.equal(migrated.confirmation.reason, 'probe_language_changed');
  assert.equal(migrated.epoch, 1);
  await withState(dir, state.session, () => {});
  const restarted = await readState(dir, state.session);
  assert.equal(restarted.epoch, 1);
  assert.equal(restarted.events.filter((e) => e.type === 'configuration_migrated').length, 1);
  assert.deepEqual(restarted.samples, state.samples);
});
