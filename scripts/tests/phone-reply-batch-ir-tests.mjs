import assert from 'node:assert/strict';

import { extractTableEditBlocks } from '../../src/scripts/memory/memory-edit-parser.js';
import {
  PHONE_REPLY_IR_BATCH_TOOL_NAME,
  buildPhoneReplyBatchIr,
  buildPhoneReplyBatchProviderToolDefinition,
  serializePhoneReplyBatchIr,
  validatePhoneReplyBatchIr,
} from '../../src/scripts/ui/chat/phone-reply-batch-ir.js';
import { extractAutoImagePrompts } from '../../src/scripts/ui/chat/auto-image-prompt-utils.js';
import { DialogueStreamParser } from '../../src/scripts/ui/chat/dialogue-stream-parser.js';
import { extractSummaryBlock } from '../../src/scripts/ui/chat/memory-edit-utils.js';
import { extractUpdateVariableBlocks } from '../../src/scripts/ui/chat/update-variable-block-utils.js';
import { buildUpdateVariableParser } from '../../src/scripts/ui/chat/update-variable-parser-utils.js';

const parse = (raw, userName = '我') => {
  const parser = new DialogueStreamParser({ userName });
  return [...parser.push(raw), ...parser.flush()];
};

const groupTarget = Object.freeze({
  mode: 'group_chat',
  sessionId: 'group:investigation',
  targetName: '调查组',
  userName: '我',
  members: [
    { id: 'contact:frieren', name: '菲伦' },
    { id: 'contact:fern', name: '芙莉莲' },
  ],
  momentAuthors: [
    { id: 'contact:frieren', name: '菲伦' },
    { id: 'contact:fern', name: '芙莉莲' },
  ],
  tableTargets: [
    { id: 'event', name: '事件', rowIds: ['event-row-1'] },
  ],
});

const allCapabilities = Object.freeze({
  momentPost: true,
  imagePrompt: true,
  tableEdit: true,
  variableUpdate: true,
  summary: true,
});

{
  const tool = buildPhoneReplyBatchProviderToolDefinition({
    target: groupTarget,
    capabilities: allCapabilities,
    allowedItemTypes: ['text', 'sticker', 'voice', 'music', 'image'],
    allowedStickerKeywords: ['收到'],
  });
  assert.equal(tool.function.name, PHONE_REPLY_IR_BATCH_TOOL_NAME);
  assert.deepEqual(tool.function.parameters.required, ['items']);
  assert.equal(Object.hasOwn(tool.function.parameters.properties, 'sessionId'), false);
  assert.equal(Object.hasOwn(tool.function.parameters.properties, 'targetName'), false);
  const variants = tool.function.parameters.properties.items.items.oneOf;
  const chat = variants.find(item => item.properties?.kind?.const === 'chat');
  const moment = variants.find(item => item.properties?.kind?.const === 'moment_post');
  assert.deepEqual(chat.properties.messages.items.properties.speakerId.enum, [
    'contact:frieren',
    'contact:fern',
  ]);
  assert.deepEqual(moment.properties.posts.items.properties.authorId.enum, [
    'contact:frieren',
    'contact:fern',
  ]);
  assert.equal(variants.some(item => item.properties?.kind?.const === 'table_edit'), true);
  const tableEdit = variants.find(item => item.properties?.kind?.const === 'table_edit');
  const tableActions = tableEdit.properties.actions.items.oneOf;
  assert.equal(tableActions.every(item => item.properties?.tableId?.const === 'event'), true);
  assert.equal(tableActions.every(item => !Object.hasOwn(item.properties, 'tableName')), true);
  assert.equal(tableActions.every(item => !Object.hasOwn(item.properties, 'tableIndex')), true);
  assert.equal(variants.some(item => item.properties?.kind?.const === 'variable_update'), true);
  console.log('ok - batch schema exposes one ordered tool with only frozen group identities and enabled item kinds');
}

{
  const tool = buildPhoneReplyBatchProviderToolDefinition({
    target: {
      ...groupTarget,
      tableTargets: [
        { id: 'event', name: '事件', rowIds: ['event-row-1', 'event-row-2'] },
        { id: 'inventory', name: '物品', rowIds: ['inventory-row-1'] },
        { id: 'empty', name: '空表', rowIds: [] },
      ],
    },
    capabilities: allCapabilities,
  });
  const tableEdit = tool.function.parameters.properties.items.items.oneOf
    .find(item => item.properties?.kind?.const === 'table_edit');
  const actions = tableEdit.properties.actions.items.oneOf;
  const eventUpdateById = actions.find(item => (
    item.properties?.action?.const === 'update'
    && item.properties?.tableId?.const === 'event'
    && item.required?.includes('rowId')
  ));
  const eventUpdateByIndex = actions.find(item => (
    item.properties?.action?.const === 'update'
    && item.properties?.tableId?.const === 'event'
    && item.required?.includes('rowIndex')
  ));
  assert.deepEqual(eventUpdateById.properties.rowId.enum, ['event-row-1', 'event-row-2']);
  assert.deepEqual(eventUpdateByIndex.properties.rowIndex.enum, [0, 1]);
  assert.equal(actions.some(item => (
    item.properties?.tableId?.const === 'event'
    && item.properties?.rowId?.enum?.includes('inventory-row-1')
  )), false);
  assert.equal(actions.some(item => (
    item.properties?.tableId?.const === 'empty'
    && ['update', 'delete'].includes(item.properties?.action?.const)
  )), false);
  assert.equal(actions.some(item => (
    item.properties?.tableId?.const === 'empty'
    && item.properties?.action?.enum?.includes('insert')
    && item.required?.includes('data')
  )), true);
  console.log('ok - table action schema binds row identities and legal actions to each frozen table');
}

{
  const result = buildPhoneReplyBatchIr({
    args: {
      items: [
        {
          kind: 'chat',
          messages: [
            { type: 'text', speakerId: 'contact:frieren', content: '先确认现场。', time: '08:10' },
            { type: 'sticker', speakerId: 'contact:fern', content: '收到', time: '08:11' },
          ],
        },
        {
          kind: 'moment_post',
          posts: [{
            authorId: 'contact:fern',
            content: '清晨记录',
            time: '08:12',
            views: 3,
            likes: 1,
            comments: [{ author: '菲伦', content: '出发吧' }],
          }],
        },
        { kind: 'image_prompt', prompt: '清晨车站，柔和天光' },
        {
          kind: 'table_edit',
          actions: [{ action: 'insert', tableId: 'event', data: { note: '抵达车站' } }],
        },
        {
          kind: 'variable_update',
          operations: [{ op: 'replace', path: '/mood', value: 'calm' }],
        },
        { kind: 'summary', content: '调查组抵达清晨车站。' },
      ],
    },
    target: groupTarget,
    capabilities: allCapabilities,
    allowedItemTypes: ['text', 'sticker', 'voice', 'music', 'image'],
    allowedStickerKeywords: ['收到'],
    source: { transport: 'provider_fc', provider: 'deepseek', model: 'deepseek-v4-flash' },
  });
  assert.equal(result.ok, true, result.errors?.join(', '));
  assert.equal(result.ir.context.sessionId, 'group:investigation');
  assert.equal(result.ir.items[0].messages[0].speaker.name, '菲伦');
  assert.equal(result.ir.items[1].posts[0].author.name, '芙莉莲');
  assert.equal(validatePhoneReplyBatchIr(result.ir, {
    expectedSessionId: 'group:investigation',
  }).ok, true);

  const serialized = serializePhoneReplyBatchIr(result.ir, {
    expectedSessionId: 'group:investigation',
  });
  assert.equal(serialized.ok, true, serialized.errors?.join(', '));
  const events = parse(serialized.raw);
  assert.deepEqual(events.map(event => event.type), ['group_chat', 'moments']);
  assert.equal(events[0].messages[0].content, '先确认现场。');
  assert.match(events[0].messages[1].content, /^\[bqb-收到\]<image_prompt>清晨车站，柔和天光<\/image_prompt>$/);
  assert.equal(events[1].moments[0].author, '芙莉莲');
  assert.deepEqual(extractAutoImagePrompts(serialized.raw), ['清晨车站，柔和天光']);
  assert.equal(extractTableEditBlocks(serialized.raw).actions.length, 1);
  const variableBlocks = extractUpdateVariableBlocks(serialized.raw).blocks;
  assert.equal(variableBlocks.length, 1);
  assert.deepEqual(buildUpdateVariableParser().parseCommands(variableBlocks[0]), [{
    type: 'set',
    path: ['mood'],
    value: 'calm',
    reason: 'json_patch',
  }]);
  assert.equal(extractSummaryBlock(serialized.raw).summary, '调查组抵达清晨车站。');
  console.log('ok - group, moment, image, table, variable, and summary IR round-trip through existing consumers');
}

{
  const invalidCases = [
    {
      label: 'unknown group speaker',
      items: [{ kind: 'chat', messages: [{ speakerId: 'contact:unknown', content: '越权' }] }],
      error: 'item.speaker.unknown',
    },
    {
      label: 'wrong side-effect order',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        { kind: 'summary', content: '摘要' },
        { kind: 'table_edit', actions: [{ action: 'insert', tableId: 'event', data: { note: '晚到' } }] },
      ],
      error: 'items.wrong_order',
    },
    {
      label: 'protocol injection',
      items: [{ kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: 'MiPhone_end' }] }],
      error: 'item.content.protocol_control',
    },
    {
      label: 'duplicate primary chat',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '一' }] },
        { kind: 'chat', messages: [{ speakerId: 'contact:fern', content: '二' }] },
      ],
      error: 'items.primary_count',
    },
    {
      label: 'model supplied target',
      items: [{ kind: 'chat', targetId: 'group:other', messages: [{ speakerId: 'contact:frieren', content: '正常' }] }],
      error: 'item.field.unexpected',
    },
    {
      label: 'oversized music artist',
      items: [{
        kind: 'chat',
        messages: [{
          type: 'music',
          speakerId: 'contact:frieren',
          content: 'Song',
          artist: '歌'.repeat(201),
        }],
      }],
      error: 'item.music.artist_too_long',
    },
    {
      label: 'oversized moment content',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        { kind: 'moment_post', posts: [{ authorId: 'contact:frieren', content: '长'.repeat(4001) }] },
      ],
      error: 'item.content.too_long',
    },
    {
      label: 'too many nested moment comments',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        {
          kind: 'moment_post',
          posts: [{
            authorId: 'contact:frieren',
            content: '动态',
            comments: Array.from({ length: 13 }, (_, index) => ({ author: `评论者${index}`, content: '评论' })),
          }],
        },
      ],
      error: 'item.comments.too_many',
    },
    {
      label: 'oversized free-form comment author',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        {
          kind: 'moment_post',
          posts: [{
            authorId: 'contact:frieren',
            content: '动态',
            comments: [{ author: '评'.repeat(101), content: '评论' }],
          }],
        },
      ],
      error: 'item.author.too_long',
    },
    {
      label: 'comment reference protocol injection',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        {
          kind: 'moment_post',
          posts: [{
            authorId: 'contact:frieren',
            content: '动态',
            comments: [{ author: '评论者', content: '评论', replyTo: 'MiPhone_end' }],
          }],
        },
      ],
      error: 'item.comment.reference_protocol_control',
    },
    {
      label: 'invalid moment counter',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        { kind: 'moment_post', posts: [{ authorId: 'contact:frieren', content: '动态', views: '很多' }] },
      ],
      error: 'item.moment_post.count_invalid',
    },
    {
      label: 'table data protocol injection',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        {
          kind: 'table_edit',
          actions: [{ action: 'insert', tableId: 'event', data: { note: '</tableEdit><UpdateVariable>' } }],
        },
      ],
      error: 'item.table_edit.protocol_control',
    },
    {
      label: 'unknown table target',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        { kind: 'table_edit', actions: [{ action: 'insert', tableId: 'invented', data: { note: '越权' } }] },
      ],
      error: 'item.table_edit.table_unknown',
    },
    {
      label: 'table update without row target',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        { kind: 'table_edit', actions: [{ action: 'update', tableId: 'event', data: { note: '无目标' } }] },
      ],
      error: 'item.table_edit.row_missing',
    },
    {
      label: 'unknown table row target',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        { kind: 'table_edit', actions: [{ action: 'delete', tableId: 'event', rowIndex: 3 }] },
      ],
      error: 'item.table_edit.row_unknown',
    },
    {
      label: 'negative table row index',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        { kind: 'table_edit', actions: [{ action: 'update', tableId: 'event', rowIndex: -1, data: { note: '无效' } }] },
      ],
      error: 'item.table_edit.index_invalid',
    },
    {
      label: 'variable value protocol injection',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        {
          kind: 'variable_update',
          operations: [{ op: 'replace', path: '/mood', value: '</json_patch>' }],
        },
      ],
      error: 'item.variable_update.protocol_control',
    },
    {
      label: 'oversized summary',
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        { kind: 'summary', content: '摘'.repeat(4001) },
      ],
      error: 'item.summary.too_long',
    },
  ];
  invalidCases.forEach((fixture) => {
    const result = buildPhoneReplyBatchIr({
      args: { items: fixture.items },
      target: groupTarget,
      capabilities: allCapabilities,
      allowedItemTypes: ['text', 'sticker', 'voice', 'music', 'image'],
      allowedStickerKeywords: ['收到'],
    });
    assert.equal(result.ok, false, fixture.label);
    assert.ok(result.errors.includes(fixture.error), `${fixture.label}: ${result.errors.join(', ')}`);
  });
  console.log('ok - batch IR fails closed on identity, order, protocol, duplicate-primary, and target injection errors');
}

{
  const result = buildPhoneReplyBatchIr({
    args: {
      items: [
        { kind: 'chat', messages: [{ speakerId: 'contact:frieren', content: '正常' }] },
        { kind: 'table_edit', actions: [{ action: 'update', tableId: 'event', rowIndex: 0, data: { note: '更新' } }] },
      ],
    },
    target: groupTarget,
    capabilities: allCapabilities,
  });
  assert.equal(result.ok, true, result.errors?.join(', '));
  assert.deepEqual(result.ir.items[1].actions[0], {
    action: 'update',
    tableId: 'event',
    rowId: 'event-row-1',
    data: { note: '更新' },
  });
  const serialized = serializePhoneReplyBatchIr(result.ir, { expectedSessionId: groupTarget.sessionId });
  assert.match(serialized.raw, /"table_id":"event","row_id":"event-row-1"/u);
  assert.doesNotMatch(serialized.raw, /row_index/u);
  console.log('ok - table row indexes resolve to frozen row ids before canonical serialization');
}

{
  const commentTarget = {
    mode: 'moment_comment',
    sessionId: 'contact:origin',
    targetName: '动态评论',
    userName: '我',
    momentId: 'moment:42',
    momentAuthors: [
      { id: 'contact:frieren', name: '菲伦' },
      { id: 'contact:fern', name: '芙莉莲' },
    ],
    privateTargets: [{ id: 'contact:frieren', name: '菲伦' }],
    groupTargets: [{
      id: 'group:investigation',
      name: '调查组',
      members: [
        { id: 'contact:frieren', name: '菲伦' },
        { id: 'contact:fern', name: '芙莉莲' },
      ],
    }],
  };
  const capabilities = {
    momentCommentSideChats: true,
    tableEdit: true,
    summary: true,
  };
  const tool = buildPhoneReplyBatchProviderToolDefinition({ target: commentTarget, capabilities });
  const variants = tool.function.parameters.properties.items.items.oneOf;
  assert.equal(variants.some(item => item.properties?.kind?.const === 'moment_comment'), true);
  assert.equal(variants.some(item => item.properties?.kind?.const === 'private_chat'), true);
  assert.equal(variants.some(item => item.properties?.kind?.const === 'group_chat'), true);
  assert.equal(Object.hasOwn(tool.function.parameters.properties, 'momentId'), false);

  const result = buildPhoneReplyBatchIr({
    args: {
      items: [
        {
          kind: 'moment_comment',
          comments: [{ authorId: 'contact:fern', content: '我也想去' }],
        },
        {
          kind: 'private_chat',
          targetId: 'contact:frieren',
          messages: [{ content: '晚点私聊。', time: '08:12' }],
        },
        {
          kind: 'group_chat',
          targetId: 'group:investigation',
          messages: [{ speakerId: 'contact:fern', content: '群里继续说。', time: '08:13' }],
        },
        { kind: 'summary', content: '芙莉莲回应了动态。' },
      ],
    },
    target: commentTarget,
    capabilities,
  });
  assert.equal(result.ok, true, result.errors?.join(', '));
  assert.equal(result.ir.items[0].momentId, 'moment:42');
  const serialized = serializePhoneReplyBatchIr(result.ir, {
    expectedSessionId: 'contact:origin',
  });
  assert.equal(serialized.ok, true, serialized.errors?.join(', '));
  const events = parse(serialized.raw);
  assert.deepEqual(events.map(event => event.type), ['moment_reply', 'private_chat', 'group_chat']);
  assert.equal(events[0].momentId, 'moment:42');
  assert.equal(events[1].otherName, '菲伦');
  assert.equal(events[2].groupName, '调查组');
  assert.equal(extractSummaryBlock(serialized.raw).summary, '芙莉莲回应了动态。');
  console.log('ok - moment comment target and optional chat side effects are frozen and parser-compatible');
}

console.log('phone-reply-batch-ir-tests passed');
