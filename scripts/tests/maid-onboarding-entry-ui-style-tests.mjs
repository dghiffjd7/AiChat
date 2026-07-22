import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/scripts/ui/maid-onboarding-entry-ui.js', import.meta.url), 'utf8');

assert.match(source, /maid-onboarding-hint/);
assert.match(source, /maid-onboarding-toast/);
assert.match(source, /@keyframes maid-onboarding-entry-in/);
assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(source, /body\[data-reduced-motion=['"]on['"]\]/);
assert.match(source, /var\(--app-accent-primary/);
assert.doesNotMatch(source, /animation[^;]*infinite/);
console.log('ok - onboarding hint and completion toast use tokenized, reduced-motion-safe styling');
