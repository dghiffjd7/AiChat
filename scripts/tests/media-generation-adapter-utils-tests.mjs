import assert from 'node:assert/strict';
import {
  buildGeneratedImageMessagePatch,
  buildGeneratedImageToken,
  buildMomentContentWithGeneratedImages,
  collectGeneratedImageAssetsFromMessages,
} from '../../src/scripts/ui/media-generation-adapter-utils.js';

const asset = {
  id: 'image:1',
  provider: 'openai',
  model: 'gpt-image',
  prompt: 'a cat',
  output: { path: 'D:\\assets\\cat.png', mime: 'image/png', bytes: 12 },
  createdAt: 1000,
};

assert.equal(buildGeneratedImageToken(asset), '[img-D:\\assets\\cat.png]');
assert.equal(
  buildMomentContentWithGeneratedImages('hello', [asset]),
  'hello\n[img-D:\\assets\\cat.png]',
);

const patch = buildGeneratedImageMessagePatch(asset, {
  sourceMessageId: 'm1',
  surface: 'writing',
  targetId: 'rp:p1',
  now: () => 2000,
});
assert.equal(patch.type, 'image');
assert.equal(patch.content, '[binary omitted]');
assert.equal(patch.meta.localPath, 'D:\\assets\\cat.png');
assert.equal(patch.meta.generatedMedia.surface, 'writing');
assert.equal(patch.meta.generatedMedia.sourceMessageId, 'm1');

const collected = collectGeneratedImageAssetsFromMessages([
  { id: 'pending', meta: { generatedMedia: { kind: 'image', status: 'running' } } },
  { id: 'ok', sessionId: 'rp:p1', meta: patch.meta },
], { surface: 'writing' });
assert.equal(collected.length, 1);
assert.equal(collected[0].prompt, 'a cat');
assert.equal(collected[0].scope.targetId, 'rp:p1');

console.log('media-generation-adapter-utils tests passed');
