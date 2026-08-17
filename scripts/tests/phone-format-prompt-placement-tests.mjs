import assert from 'node:assert/strict';

import {
  PHONE_FORMAT_PROMPT_DEFAULT_DEPTH,
  PHONE_FORMAT_PROMPT_DEFAULT_POSITION,
  PHONE_FORMAT_PROMPT_MAX_DEPTH,
  PHONE_FORMAT_PROMPT_POSITIONS,
  normalizePhoneFormatPromptDepth,
  normalizePhoneFormatPromptPosition,
} from '../../src/scripts/utils/phone-format-prompt-placement.js';
import { resolvePhoneFormatTransportLayers } from '../../src/scripts/ui/chat/chat-semantic-snapshot-utils.js';

assert.deepEqual(PHONE_FORMAT_PROMPT_POSITIONS, [
  'after_persona',
  'system_end',
  'history_before',
  'history_depth',
]);
assert.equal(normalizePhoneFormatPromptPosition('system_end'), 'system_end');
assert.equal(normalizePhoneFormatPromptPosition(' HISTORY_DEPTH '), 'history_depth');
assert.equal(normalizePhoneFormatPromptPosition('unknown'), PHONE_FORMAT_PROMPT_DEFAULT_POSITION);
assert.equal(normalizePhoneFormatPromptPosition(undefined), PHONE_FORMAT_PROMPT_DEFAULT_POSITION);

assert.equal(normalizePhoneFormatPromptDepth(undefined), PHONE_FORMAT_PROMPT_DEFAULT_DEPTH);
assert.equal(normalizePhoneFormatPromptDepth('7.9'), 7);
assert.equal(normalizePhoneFormatPromptDepth(-3), 0);
assert.equal(normalizePhoneFormatPromptDepth(999), PHONE_FORMAT_PROMPT_MAX_DEPTH);

assert.deepEqual(resolvePhoneFormatTransportLayers({
  phoneFormatPromptLayers: [
    { id: 'phone_format_intro', content: ' intro ' },
    { id: 'phone_format_chat', content: ' chat ' },
    { id: 'phone_format_moment', content: '' },
    { id: 'phone_format_footer', content: ' footer ' },
  ],
  phoneFormatPromptContent: 'legacy combined content',
}), [
  { id: 'phone_format_intro', content: 'intro' },
  { id: 'phone_format_chat', content: 'chat' },
  { id: 'phone_format_footer', content: 'footer' },
]);
assert.deepEqual(resolvePhoneFormatTransportLayers({
  phoneFormatPromptContent: ' legacy combined content ',
}), [{ id: 'phone_format', content: 'legacy combined content' }]);

console.log('ok - phone format placement normalizes old presets and exposes independent FC transport layers');
