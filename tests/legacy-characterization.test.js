'use strict';
// Characterization tests: the CURRENT app code must keep producing exactly the recorded golden output until the
// refactor deliberately replaces it. Golden files are recorded from the legacy code by tests/tools/generate-golden.js.
// A failure here means legacy behaviour changed (intended? then run `npm run golden:update` and review the diff).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { compute } = require('./fixtures/compute-golden');

const goldenDir = path.join(__dirname, 'golden');
const actual = compute();

for (const key of Object.keys(actual)) {
  test(`legacy golden: ${key}`, () => {
    const expected = JSON.parse(fs.readFileSync(path.join(goldenDir, key + '.json'), 'utf8'));
    assert.deepStrictEqual(actual[key], expected);
  });
}

test('legacy share links: every recorded link still decodes to the recorded state', () => {
  const { loadLegacyBE } = require('./helpers/legacy');
  const be = loadLegacyBE();
  const links = JSON.parse(fs.readFileSync(path.join(goldenDir, 'links.json'), 'utf8'));
  for (const l of links.beCompact) assert.deepStrictEqual(be.decodeCompact(l.link), l.decoded, `compact link ${l.name}`);
  for (const l of links.beLegacyData) assert.deepStrictEqual(be.decodeLegacyData(l.payload), l.decoded, `?data= link ${l.name}`);
});
