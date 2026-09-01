import assert from 'node:assert/strict';

import {
  canonicalizeOfficialPromptRecord,
  getLocalizedPromptText,
  localizeOfficialPromptRecord,
  setPromptLocale,
} from '../../src/scripts/i18n/prompt-locale.js';
import { buildAutoImagePromptInstruction } from '../../src/scripts/ui/chat/auto-image-prompt-utils.js';
import {
  DEFAULT_MAID_PROMPT,
  canonicalizeMaidPrompt,
  getLocalizedMaidOperationSafetyPrompt,
  getLocalizedMaidOutputLanguagePrompt,
  getLocalizedMaidPrompt,
} from '../../src/scripts/agent/maid-prompt-defaults.js';

globalThis.localStorage ||= {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
const {
  PresetStore,
  getCanonicalBuiltinPromptDefaults,
} = await import('../../src/scripts/storage/preset-store.js');

const defaults = getCanonicalBuiltinPromptDefaults();

setPromptLocale('en');
assert.match(getLocalizedPromptText('dialogue_rules', defaults.dialogue_rules), /Roleplay Core/);
assert.match(getLocalizedPromptText('phone_format_chat_rules', defaults.phone_format_chat_rules), /QQ Chat Format Guide/);
assert.match(getLocalizedPromptText('summary_rules', defaults.summary_rules), /summary must be written in English/);
assert.doesNotMatch(getLocalizedPromptText('summary_rules', defaults.summary_rules), /\p{Script=Han}/u);
assert.match(getLocalizedMaidPrompt(DEFAULT_MAID_PROMPT), /maid assistant inside this app/);
assert.match(getLocalizedMaidOperationSafetyPrompt(), /non-destructive actions/);
assert.match(getLocalizedMaidOutputLanguagePrompt(), /every user-visible response in English/);
assert.doesNotMatch(getLocalizedMaidOutputLanguagePrompt(), /\p{Script=Han}/u);
assert.match(getLocalizedPromptText('format_repair.fixed_preview'), /Fixed check instructions/);
assert.equal(canonicalizeMaidPrompt(getLocalizedMaidPrompt(DEFAULT_MAID_PROMPT)), DEFAULT_MAID_PROMPT);
assert.equal(getLocalizedMaidPrompt('Custom maid prompt'), 'Custom maid prompt');

const localized = localizeOfficialPromptRecord({
  dialogue_rules: defaults.dialogue_rules,
  group_rules: defaults.group_rules,
  custom: '用户自定义内容',
}, defaults);
assert.match(localized.dialogue_rules, /Roleplay Core/);
assert.match(localized.group_rules, /Group Chat Scenario Prompt/);
assert.equal(localized.custom, '用户自定义内容');

const customDialogue = `${defaults.dialogue_rules}\n用户追加规则`;
assert.equal(
  localizeOfficialPromptRecord({ dialogue_rules: customDialogue }, defaults).dialogue_rules,
  customDialogue,
  '只允许精确的官方默认值随语言切换',
);

const canonicalized = canonicalizeOfficialPromptRecord(localized, defaults);
assert.equal(canonicalized.dialogue_rules, defaults.dialogue_rules);
assert.equal(canonicalized.group_rules, defaults.group_rules);
assert.equal(canonicalized.custom, '用户自定义内容');

const store = Object.create(PresetStore.prototype);
store.state = {
  presets: {
    sysprompt: {
      default: { name: 'Default', dialogue_rules: defaults.dialogue_rules },
      custom: { name: 'Custom', dialogue_rules: customDialogue },
    },
  },
  active: { sysprompt: 'default' },
  builtinActive: { sysprompt: 'default' },
  enabled: { sysprompt: true },
  bindings: {},
};
assert.match(store.getActive('sysprompt').dialogue_rules, /Roleplay Core/);
assert.equal(store.list('sysprompt').find(item => item.id === 'custom').dialogue_rules, customDialogue);

const englishDefault = store.getActive('sysprompt');
const savedId = store.applyUpsert('sysprompt', {
  id: 'default',
  name: 'Default',
  data: englishDefault,
  makeActive: false,
});
assert.equal(savedId, 'default');
assert.equal(store.state.presets.sysprompt.default.dialogue_rules, defaults.dialogue_rules);

const imagePrompt = buildAutoImagePromptInstruction({
  uiMode: 'rp',
  modelHint: '',
  style: 'natural',
  decisionMode: 'standard',
});
assert.match(imagePrompt, /Creative Writing illustration/);
assert.match(imagePrompt, /Natural-language prompt/);
assert.match(imagePrompt, /Trigger policy: standard/);
assert.doesNotMatch(imagePrompt, /创意写作插图|自然语言提示词|触发策略/);
assert.match(imagePrompt, /<image_prompt>/);

setPromptLocale('zh-TW');
assert.match(getLocalizedPromptText('dialogue_rules', defaults.dialogue_rules), /角色扮演核心/);
assert.match(getLocalizedPromptText('dialogue_rules', defaults.dialogue_rules), /嚴格遵循/);
assert.match(getLocalizedPromptText('time_context.template'), /當前真實時間/);
assert.doesNotMatch(getLocalizedPromptText('time_context.template'), /真即/);

setPromptLocale('zh-CN');
assert.equal(getLocalizedPromptText('dialogue_rules', defaults.dialogue_rules), defaults.dialogue_rules);

console.log('prompt-locale-tests passed');
