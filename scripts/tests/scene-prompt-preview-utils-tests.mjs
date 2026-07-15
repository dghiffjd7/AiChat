import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

const {
  createScenePresetAccess,
  evaluateScenePreviewMacro,
} = await import('../../src/scripts/ui/scene-prompt-preview-utils.js');

{
  const calls = [];
  const access = createScenePresetAccess({
    appBridge: { id: 'bridge' },
    sessionId: 'session-a',
    uiMode: 'rp',
    resolvePreset: (bridge, type, context) => {
      calls.push({ bridge, type, context });
      return { type, uiMode: context.uiMode };
    },
  });
  assert.deepEqual(access.context, { sessionId: 'session-a', uiMode: 'rp' });
  assert.deepEqual(access.getOpenAIPreset(), { type: 'openai', uiMode: 'rp' });
  assert.deepEqual(access.getReasoningPreset(), { type: 'reasoning', uiMode: 'rp' });
  assert.ok(calls.every(call => call.context === access.context), '同一请求的预设解析必须共享场景 context');
  console.log('ok - 场景预览以指定 uiMode 解析全部绑定预设');
}

{
  let called = false;
  const result = evaluateScenePreviewMacro('{{setvar：：hover_probe：：mutated}}', {
    processTextMacros: () => { called = true; return ''; },
  });
  assert.equal(result.kind, 'effect');
  assert.match(result.text, /hover_probe/);
  assert.equal(called, false, '全角分隔符的写宏必须在调用宏引擎前拦截');
  console.log('ok - 悬停写宏识别全角分隔符且不执行');
}

{
  let receivedContext = null;
  const result = evaluateScenePreviewMacro('{{getvar::safe}}', {
    context: { sessionId: 's1', uiMode: 'chat' },
    processTextMacros: (_token, context) => {
      receivedContext = context;
      return 'value';
    },
  });
  assert.equal(result.kind, 'value');
  assert.equal(result.text, 'value');
  assert.ok(receivedContext.macroVariableState instanceof Map, '悬停求值必须使用隔离变量状态');
  console.log('ok - 悬停只读宏在隔离状态中求值');
}

{
  let called = false;
  const result = evaluateScenePreviewMacro('<% setVariable("x", 1) %>', {
    processTextMacros: () => { called = true; return ''; },
  });
  assert.equal(result.kind, 'script');
  assert.equal(called, false);
  console.log('ok - EJS 悬停不执行');
}

{
  const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const appSource = await readFile(path.join(repoRoot, 'src/scripts/ui/app.js'), 'utf8');
  const handleSendStart = appSource.indexOf('const handleSend = async');
  const handleSendEnd = appSource.indexOf('const sendMessageFromPlugin', handleSendStart);
  assert.ok(handleSendStart >= 0 && handleSendEnd > handleSendStart, '应能定位 handleSend 实现');
  const handleSendSource = appSource.slice(handleSendStart, handleSendEnd);
  assert.doesNotMatch(
    handleSendSource,
    /\bpresetContext\b/,
    'handleSend 不得引用预设上下文重构前的旧变量 presetContext',
  );
  assert.match(
    handleSendSource,
    /getResolvedActiveId\?\.\('openai', requestPresetContext\)\?\.presetId/,
    '创意写作执行记录应使用本次场景实际解析的 OpenAI 预设 ID',
  );
  console.log('ok - handleSend 使用场景预设上下文记录实际预设 ID');
}
