import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  buildBuiltinCharacterWorldbookCopy,
  localizeBundledCharacterLibrary,
} from '../../src/scripts/i18n/builtin-character-locale.js';

const source = JSON.parse(await fs.readFile('src/assets/data/characters.json', 'utf8'));
const english = localizeBundledCharacterLibrary(source, 'en');
const han = /\p{Script=Han}/u;

assert.equal(english.characters.length, source.characters.length);
assert.equal(english.fixedTags.length, source.fixedTags.length);
for (const character of english.characters) {
  assert.doesNotMatch(character.name, han, `English built-in name must not contain Han: ${character.id}`);
  assert.doesNotMatch(character.source, han, `English built-in source must not contain Han: ${character.id}`);
  assert.equal(character.tags.length, character.originalTags.length, `English tags must be complete: ${character.id}`);
  character.tags.forEach(tag => assert.doesNotMatch(tag, han, `English built-in tag must not contain Han: ${character.id}`));
}

assert.equal(english.characters.find(item => item.id === 'nezha_classic_001')?.name, 'Nezha');
assert.equal(english.characters.find(item => item.id === 'tomoyo_daidouji_001')?.name, 'Tomoyo Daidouji');

const ganyu = source.characters.find(item => item.id === 'ganyu_001');
const copy = buildBuiltinCharacterWorldbookCopy(ganyu, 'en');
assert.equal(copy.name, 'Ganyu');
assert.equal(copy.source, 'Genshin Impact');
assert.equal(copy.content, 'You are Ganyu from “Genshin Impact.”');
assert.doesNotMatch(copy.content, han);

const chinese = localizeBundledCharacterLibrary(source, 'zh-CN');
assert.equal(chinese.characters.find(item => item.id === 'ganyu_001')?.name, '甘雨');

console.log('builtin-character-locale-tests passed');
