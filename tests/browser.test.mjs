import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
// Supply the browser API on Node versions without a global Web Crypto object.
globalThis.crypto ??= webcrypto;
// Import browser-native ES module without depending on Node's .js module detection.
const source = await readFile(new URL('../static/challenge-browser.js', import.meta.url), 'utf8');
const { generateChallenges } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const foreign = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u3000-\u303f\uff01-\uff65]/u;

test('browser challenges are English and retain the original independent count range', () => {
  for (let i = 0; i < 50; i++) {
    const challenges = generateChallenges();
    assert.equal(new Set(challenges.map((c) => c.expected_count)).size, 3);
    for (const challenge of challenges) {
      assert.doesNotMatch(challenge.prompt, foreign);
      assert.ok(challenge.expected_count >= 292 && challenge.expected_count <= 332);
      assert.match(challenge.prompt, new RegExp(`${challenge.expected_count} integers from 1 through 355`));
      assert.match(challenge.prompt, /current language model/);
    }
  }
});

