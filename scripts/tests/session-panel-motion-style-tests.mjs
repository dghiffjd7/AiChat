import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [panelSource, feedbackSource, css] = await Promise.all([
  readFile(new URL('../../src/scripts/ui/session-panel.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/scripts/ui/session-add-friend-feedback-ui.js', import.meta.url), 'utf8'),
  readFile(new URL('../../src/assets/css/qq-legacy.css', import.meta.url), 'utf8'),
]);

assert.match(panelSource, /isSessionPanelMotionReduced/);
assert.match(panelSource, /classList\.add\('is-opening'\)/);
assert.match(panelSource, /classList\.add\('is-closing'\)/);
assert.match(panelSource, /is-session-view-leaving/);
assert.match(panelSource, /is-session-view-entering/);
assert.match(panelSource, /setRecommendMode\(false,\s*\{\s*immediate:\s*true\s*\}\)/);
assert.match(panelSource, /recommendBlurTimer/);
assert.match(panelSource, /recommendWheelReleaseTimer/);
assert.match(panelSource, /shouldCommitRecommendPullRefresh/);
assert.doesNotMatch(panelSource, /delta\s*>\s*32\)\s*onMaybeRefresh/);
assert.doesNotMatch(panelSource, /calculateStaggerDelay/);

assert.match(feedbackSource, /createSessionAddFriendFeedbackUi/);
assert.match(feedbackSource, /session-add-confirm-card/);
assert.match(feedbackSource, /确认后会自动创建专属聊天室/);
assert.match(feedbackSource, /session-add-success-toast/);
assert.match(feedbackSource, /去聊天/);

assert.match(css, /@keyframes session-panel-dialog-in/);
assert.match(css, /@keyframes session-panel-dialog-out/);
assert.match(css, /@keyframes session-recommend-view-in[\s\S]*?translateX\(26px\)/);
assert.match(css, /@keyframes session-contacts-view-in[\s\S]*?translateX\(-26px\)/);
assert.match(css, /\.session-recommend-row\.is-entering[\s\S]*?session-recommend-fade-in-up/);
assert.match(css, /\.session-recommend-row\s*\{[\s\S]*?border-radius:\s*20px/);
assert.match(css, /\.session-recommend-row:hover[\s\S]*?translateY\(-1px\)/);
assert.match(css, /\.session-recommend-add:hover[\s\S]*?linear-gradient/);
assert.match(css, /@keyframes session-add-confirm-card-in/);
assert.match(css, /@keyframes session-add-success-in/);
assert.match(css, /\.session-add-confirm-card[\s\S]*?border-radius:\s*26px/);
assert.match(css, /\.session-add-confirm-action[\s\S]*?min-height:\s*44px/);
assert.match(css, /\.session-add-success-action[\s\S]*?min-height:\s*40px/);
assert.match(css, /body\[data-reduced-motion='on'\][\s\S]*?\.session-panel-overlay/);
assert.match(css, /body\[data-reduced-motion='on'\][\s\S]*?\.session-add-confirm-overlay/);
assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.session-panel-overlay/);
assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.session-add-confirm-overlay/);

const avatarRule = css.match(/\.session-recommend-avatar\s*\{([\s\S]*?)\}/)?.[1] || '';
assert.match(avatarRule, /width:\s*48px/);
assert.match(avatarRule, /height:\s*48px/);
assert.match(avatarRule, /border-radius:\s*14px/);

const panelRule = css.match(/\.session-panel\s*\{([\s\S]*?)\}/)?.[1] || '';
const sharedPanelRule = css.match(/\.session-panel\.has-shared\s*\{([\s\S]*?)\}/)?.[1] || '';
assert.match(panelRule, /height:\s*min\(84vh,\s*640px\)/);
assert.match(panelRule, /min-height:\s*min\(420px,\s*92vh\)/);
assert.doesNotMatch(sharedPanelRule, /(?:^|;)\s*(?:min-)?height\s*:/);

console.log('ok - add-friend motion and recommendation styling follow the scoped desktop reference contract');
