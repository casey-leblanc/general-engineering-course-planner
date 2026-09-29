'use strict';
// Regenerates tests/golden/*.json from the current legacy code. Run only when legacy behaviour is
// intentionally changed (`npm run golden:update`); review the git diff of tests/golden before committing.
const fs = require('fs');
const path = require('path');
const { compute } = require('../fixtures/compute-golden');

const dir = path.resolve(__dirname, '..', 'golden');
fs.mkdirSync(dir, { recursive: true });
const data = compute();
for (const [name, value] of Object.entries(data)) {
  const file = path.join(dir, name + '.json');
  fs.writeFileSync(file, JSON.stringify(value, null, 1) + '\n');
  console.log('wrote', path.relative(process.cwd(), file));
}
