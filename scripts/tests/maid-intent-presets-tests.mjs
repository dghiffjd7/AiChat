import assert from 'node:assert/strict';

import { listMaidIntentChips, matchMaidIntent } from '../../src/scripts/ui/maid-intent-presets.js';

assert.equal(matchMaidIntent('教我配置 API')?.flowId, 'setup-api');
assert.equal(matchMaidIntent('我想添加好友')?.flowId, 'add-friend');
assert.equal(matchMaidIntent('怎么发消息')?.flowId, 'first-chat');
assert.equal(matchMaidIntent('带我看看 Agent Center')?.flowId, 'meet-maid');
assert.equal(matchMaidIntent('新手教程')?.kind, 'catalog');
assert.equal(matchMaidIntent('新手引导')?.kind, 'catalog');
assert.equal(matchMaidIntent('请停止引导并教我配置 API')?.kind, 'skip', 'skip intent must take priority');
assert.equal(matchMaidIntent('帮我总结当前页面'), null);
assert.equal(matchMaidIntent('请引导我打开世界书'), null, 'feature-guide requests must reach the real maid, not the newbie catalog');
assert.deepEqual(listMaidIntentChips().map(chip => chip.flowId), [
  'setup-api',
  'add-friend',
  'first-chat',
  'meet-maid',
]);
console.log('ok - maid offline intent parser prioritizes skip and maps all onboarding flows');
