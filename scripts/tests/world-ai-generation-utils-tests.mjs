import assert from 'node:assert/strict';

import {
  DEFAULT_WORLD_AI_TEMPLATE,
  WORLD_AI_TEMPLATE_STORAGE_KEY,
  buildWorldAiMessages,
  buildWorldbookEntryGenerationPrompt,
  readWorldAiGenerationSettings,
  saveWorldAiTemplate,
} from '../../src/scripts/utils/world-ai-generation.js';

const createStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
};

{
  const storage = createStorage();
  const settings = readWorldAiGenerationSettings(storage);
  assert.equal(settings.template, DEFAULT_WORLD_AI_TEMPLATE);
  assert.equal(settings.hasCustomTemplate, false);
  assert.equal(settings.templateStorageKey, WORLD_AI_TEMPLATE_STORAGE_KEY);
  saveWorldAiTemplate('name: "自定义"', storage);
  assert.deepEqual(readWorldAiGenerationSettings(storage), {
    templateStorageKey: WORLD_AI_TEMPLATE_STORAGE_KEY,
    hasCustomTemplate: true,
    template: 'name: "自定义"',
  });
  console.log('ok - 世界书编辑器与女仆可读取同一份 AI 模板设置');
}

{
  const messages = buildWorldAiMessages('name: ""', '银发女仆');
  assert.equal(messages.length, 1);
  assert.match(messages[0].content, /<template>\nname: ""\n<\/template>/);
  assert.match(messages[0].content, /<input>\n银发女仆\n<\/input>/);
  console.log('ok - 世界书编辑器模板消息保持既有格式');
}

{
  const templated = buildWorldbookEntryGenerationPrompt({
    worldbookName: '角色设定',
    title: '基础资料',
    outline: '银发女仆，性格温柔',
    length: 180,
    template: 'name: ""\npersonality: ""',
    useAiTemplate: true,
  });
  assert.match(templated, /<ai_generation_template>/);
  assert.match(templated, /name: ""/);
  assert.match(templated, /按模板结构输出 YAML/);

  const plain = buildWorldbookEntryGenerationPrompt({
    worldbookName: '城市设定',
    title: '地理',
    outline: '沿海城市',
    template: 'name: ""',
    useAiTemplate: false,
  });
  assert.doesNotMatch(plain, /<ai_generation_template>/);
  assert.match(plain, /只输出条目正文本身/);
  console.log('ok - 女仆可按本轮选项套用或跳过角色世界书模板');
}

console.log('world-ai-generation-utils-tests passed');
