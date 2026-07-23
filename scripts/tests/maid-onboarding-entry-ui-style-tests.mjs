import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/scripts/ui/maid-onboarding-entry-ui.js', import.meta.url), 'utf8');

assert.match(source, /maid-onboarding-hint/);
assert.match(source, /maid-onboarding-welcome/);
assert.match(source, /四项新手任务/);
assert.match(source, /长按约 0\.6 秒/);
assert.match(source, /min-height:\s*68px/);
assert.match(source, /maid-onboarding-welcome-progress-track/);
assert.match(source, /maid-onboarding-welcome-progress-bar/);
assert.match(source, /maid-onboarding-welcome-task-reward/);
assert.match(source, /成就·/);
assert.match(source, /maid-onboarding-welcome-task-action[\s\S]*?min-height:\s*40px/);
assert.match(source, /width:\s*min\(420px,/);
assert.match(source, /\.maid-command-input\[data-welcome-side=['"]bottom['"]\]\s+\.maid-onboarding-welcome/);
assert.match(source, /welcomeAnchorEl\.dataset\.welcomeSide = side/);
assert.doesNotMatch(source, /welcomeAnchorEl\.dataset\.bubbleSide/);
assert.match(source, /delete anchor\.dataset\.welcomeSide/);
assert.match(source, /visualViewport/);
assert.match(source, /maid-onboarding-toast/);
assert.match(source, /@keyframes maid-onboarding-entry-in/);
assert.match(source, /@keyframes maid-onboarding-welcome-in/);
assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(source, /body\[data-reduced-motion=['"]on['"]\]/);
assert.match(source, /var\(--app-accent-primary/);
assert.doesNotMatch(source, /animation[^;]*infinite/);
console.log('ok - onboarding hint, four-task welcome card, and completion toast are mobile-safe and reduced-motion-safe');
