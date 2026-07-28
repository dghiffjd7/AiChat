import assert from 'node:assert/strict';

import { listMaidIntentChips, matchMaidIntent } from '../../src/scripts/ui/maid-intent-presets.js';

assert.equal(matchMaidIntent('教我配置 API')?.flowId, 'setup-api');
assert.equal(matchMaidIntent('我想添加好友')?.flowId, 'add-friend');
assert.equal(matchMaidIntent('怎么发消息')?.flowId, 'first-chat');
assert.equal(matchMaidIntent('教我怎么用 Agent Center')?.flowId, 'meet-maid');
assert.equal(matchMaidIntent('新手教程')?.kind, 'catalog');
assert.equal(matchMaidIntent('新手引导')?.kind, 'catalog');
assert.equal(matchMaidIntent('请停止引导并教我配置 API')?.kind, 'skip', 'skip intent must take priority');
assert.equal(matchMaidIntent('帮我总结当前页面'), null);
assert.equal(matchMaidIntent('请引导我打开世界书'), null, 'feature-guide requests must reach the real maid, not the newbie catalog');
assert.equal(matchMaidIntent('带我去模型配置页面'), null, 'explicit reveal requests must not be reinterpreted as onboarding');
assert.equal(matchMaidIntent('带我看看 Agent Center'), null, 'viewing Agent Center is distinct from learning the maid workflow');
assert.equal(matchMaidIntent('列出所有联系人并告诉我数量'), null, 'ordinary contact reads must not start add-friend onboarding');
assert.equal(matchMaidIntent('创建联系人「小美」，不要打开聊天室'), null, 'ordinary contact creation must reach the real maid');
assert.equal(matchMaidIntent('给聊天室「小美」发消息「晚上好」'), null, 'ordinary message sending must not start first-chat onboarding');
assert.equal(matchMaidIntent('查看当前模型配置，只告诉我模型名称'), null, 'ordinary config reads must not start API onboarding');
assert.equal(matchMaidIntent('把聊天模型切换到 v4f'), null, 'ordinary model switching must reach the real maid');
assert.deepEqual(listMaidIntentChips().map(chip => chip.flowId), [
  'setup-api',
  'add-friend',
  'first-chat',
  'meet-maid',
]);
console.log('ok - maid offline intent parser prioritizes skip and maps all onboarding flows');
