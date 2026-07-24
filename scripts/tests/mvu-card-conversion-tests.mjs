import assert from 'node:assert/strict';

import {
  buildCharacterCardMvuConversion,
  extractMvuTavernHelperScripts,
} from '../../src/scripts/import/mvu-card-conversion-utils.js';

const makeScript = (content) => ({
  name: '变量 Schema',
  content,
});

{
  const scripts = extractMvuTavernHelperScripts({
    extensions: {
      tavern_helper: {
        scripts: [
          makeScript('export const Schema = z.object({ hp: z.number() });'),
        ],
      },
    },
  });
  assert.equal(scripts.length, 1);
  console.log('ok - character-card MVU conversion reads TavernHelper scripts');
}

{
  const card = {
    extensions: {
      tavern_helper: {
        scripts: [
          makeScript(`
            export const Schema = z.object({
              stat_data: z.object({
                hp: z.number(),
                affinity: z.number().default(7),
                alive: z.boolean(),
                title: z.string(),
              }),
            });
          `),
        ],
      },
    },
  };
  const rawCard = {
    data: {
      extensions: {
        mvu: {
          stat_data: {
            hp: 84,
            affinity: 12,
            alive: false,
            title: '剑修',
            inventory: ['木剑'],
          },
        },
      },
    },
  };

  const result = buildCharacterCardMvuConversion({ card, rawCard });

  assert.equal(result.source, 'zod_script+stat_data');
  assert.deepEqual(result.variables, {
    hp: 84,
    affinity: 12,
    alive: false,
    title: '剑修',
    inventory: ['木剑'],
  });
  assert.equal(result.schemas.hp.default, 84);
  assert.equal(result.schemas.affinity.default, 7);
  assert.equal(result.schemas.alive.default, false);
  assert.equal(result.schemas.title.default, '剑修');
  assert.deepEqual(result.schemas.inventory.default, ['木剑']);
  console.log('ok - stat_data replaces implicit Zod fallbacks but preserves explicit Zod defaults');
}

{
  const rawCard = {
    data: {
      extensions: {
        mvu: {
          stat_data: {
            hp: 42,
          },
        },
      },
    },
  };
  const result = buildCharacterCardMvuConversion({ card: {}, rawCard });
  assert.equal(result.source, 'stat_data');
  assert.equal(result.variables.hp, 42);
  assert.equal(result.schemas.hp.default, 42);
  console.log('ok - character-card MVU conversion supports stat_data-only cards');
}
