import assert from 'node:assert/strict';

import { themeStore, normalizeThemePreset } from '../../src/scripts/storage/theme-store.js';
import {
  parseThemeColor,
  resolveRpDialogueTextColor,
  themeContrastRatio,
} from '../../src/scripts/ui/theme-dialogue-color-utils.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

assert.deepEqual(parseThemeColor('#abc'), { rgb: [170, 187, 204], alpha: 1 });

for (const theme of themeStore.getBuiltinThemes()) {
  const resolved = resolveRpDialogueTextColor(theme.tokens, { mode: theme.mode });
  assert.ok(resolved.contrast >= 4.5, `${theme.id} dialogue contrast`);
}

const unsafeAccent = normalizeThemePreset({
  id: 'custom-light-dialogue-test',
  mode: 'light',
  tokens: {
    surface: { page: '#ffffff', card: '#ffffff' },
    text: { primary: '#111827', dialogue: '#f8fafc' },
    accent: { primary: '#f1f5f9', strong: '#f8fafc' },
  },
});
const fallback = resolveRpDialogueTextColor(unsafeAccent.tokens, { mode: unsafeAccent.mode });
assert.equal(fallback.source, 'primary');
assert.ok(fallback.contrast >= 4.5);

const customDialogue = normalizeThemePreset({
  id: 'custom-dark-dialogue-test',
  mode: 'dark',
  tokens: {
    surface: { page: '#101318', card: '#191e25' },
    text: { primary: '#f8fafc', dialogue: '#facc15' },
    bubble: { assistantAlt: 'rgba(25, 30, 37, 0.98)' },
  },
});
const retained = resolveRpDialogueTextColor(customDialogue.tokens, { mode: customDialogue.mode });
assert.equal(retained.color, '#facc15');
assert.ok(themeContrastRatio(retained.color, retained.background) >= 4.5);
assert.equal(customDialogue.tokens.text.dialogue, '#facc15');

const customBubbleFallback = resolveRpDialogueTextColor(customDialogue.tokens, {
  mode: 'dark',
  bubbleColor: '#f8fafc',
  primaryTextColor: '#111827',
});
assert.ok(customBubbleFallback.contrast >= 4.5);
assert.equal(customBubbleFallback.color, '#111827');

console.log('ok - RP dialogue text token remains theme-aware and meets WCAG contrast');
