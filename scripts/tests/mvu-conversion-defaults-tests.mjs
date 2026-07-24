import assert from 'node:assert/strict';

import { MVUConverter } from '../../src/scripts/import/mvu-converter.js';
import { parseMvuScript } from '../../src/scripts/import/mvu-schema-parser.js';

const assertSchemaDefaultsMatchVariables = (result, label) => {
  const entries = Object.entries(result.variables || {});
  assert.ok(entries.length > 0, `${label} should produce variables`);
  entries.forEach(([key, value]) => {
    const schema = result.schemas?.[key];
    assert.ok(schema, `${label} should produce schema for ${key}`);
    assert.notEqual(schema.default, undefined, `${label} should define schema.default for ${key}`);
    assert.deepEqual(schema.default, value, `${label} should keep default aligned for ${key}`);
  });
};

{
  const parsed = parseMvuScript(`
    export const Schema = z.object({
      stat_data: z.object({
        health: z.number(),
        affinity: z.number().min(0).max(100),
        alive: z.boolean(),
        title: z.string(),
        nickname: z.string().optional(),
        mood: z.enum(['平静', '紧张']),
        weather: z.enum(['晴', '雨']),
        tags: z.array(z.string()),
        inventory: z.array(z.string()),
        flags: z.record(z.string(), z.boolean()),
        counters: z.record(z.string(), z.number()),
        chapter: z.number().default(3),
        note: z.string().default('开场'),
      }),
    });
  `);

  assert.equal(parsed.error, null);
  assert.equal(Object.keys(parsed.variables).length, 13);
  assertSchemaDefaultsMatchVariables(parsed, 'zod conversion');
  assert.equal(parsed.schemas.chapter.default, 3);
  assert.equal(parsed.schemas.note.default, '开场');
  console.log('ok - zod conversion backfills schema defaults from typed fallback variables');
}

{
  const statData = {
    health: 84,
    affinity: 12,
    alive: false,
    title: '剑修',
    nickname: '',
    mood: '平静',
    weather: '雨',
    tags: ['主角'],
    inventory: [],
    flags: {},
    counters: { victories: 2 },
    chapter: 3,
    note: null,
  };
  const converted = MVUConverter.convert({
    data: {
      extensions: {
        mvu: { stat_data: statData },
      },
    },
  });

  assert.equal(Object.keys(converted.variables).length, 13);
  assertSchemaDefaultsMatchVariables(converted, 'stat_data conversion');
  assert.equal(converted.schemas.alive.default, false);
  assert.equal(converted.schemas.nickname.default, '');
  assert.equal(converted.schemas.note.default, null);
  console.log('ok - stat_data conversion preserves every source value as schema default');
}
