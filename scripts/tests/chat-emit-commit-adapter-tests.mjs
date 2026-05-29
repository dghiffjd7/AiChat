import assert from 'node:assert/strict';

import { buildChatEmitCommitContract } from '../../src/scripts/agent/tools/chat-emit-commit-contract.js';
import {
  commitChatEmitContract,
  undoChatEmitCommit,
} from '../../src/scripts/ui/chat/chat-emit-commit-adapter.js';

const clone = value => JSON.parse(JSON.stringify(value));

const createChatRuntime = () => {
  const sessions = new Map();
  let nextId = 1;
  const ensureSession = (sessionId) => {
    const sid = String(sessionId || '').trim();
    if (!sessions.has(sid)) sessions.set(sid, []);
    return sessions.get(sid);
  };
  return {
    sessions,
    resolveTargetSessionId: name => `contact:${String(name || '').trim()}`,
    appendMessage: (message, sessionId) => {
      const saved = { ...message, id: message.id || `msg-${nextId++}` };
      ensureSession(sessionId).push(saved);
      return saved;
    },
    deleteMessage: (messageId, sessionId) => {
      const list = ensureSession(sessionId);
      const before = list.length;
      const target = String(messageId || '').trim();
      sessions.set(String(sessionId || '').trim(), list.filter(item => String(item.id || '') !== target));
      return sessions.get(String(sessionId || '').trim()).length !== before;
    },
    buildAssistantMessageFromText: async (content, options = {}) => ({
      role: 'assistant',
      content,
      time: options.time || '',
      name: options.name || '',
    }),
    buildUserMessageFromAI: (content, time = '') => ({
      role: 'user',
      content,
      time,
    }),
  };
};

const createMomentsStore = (initial = []) => {
  const moments = new Map(initial.map(item => [item.id, clone(item)]));
  let nextMoment = 1;
  let nextComment = 1;
  const api = {
    list: () => Array.from(moments.values()).map(clone),
    get: id => {
      const found = moments.get(String(id || '').trim());
      return found ? clone(found) : null;
    },
    upsert: (moment) => {
      const id = String(moment?.id || '').trim() || `moment-${nextMoment++}`;
      const saved = {
        ...(moments.get(id) || {}),
        ...clone(moment || {}),
        id,
        signature: String(moment?.signature || '').trim()
          || `${String(moment?.author || '').trim()}\u0000${String(moment?.content || '')}\u0000${String(moment?.time || '')}`,
        comments: Array.isArray(moment?.comments) ? clone(moment.comments) : clone(moments.get(id)?.comments || []),
      };
      moments.set(id, saved);
      return clone(saved);
    },
    addMany: (items = []) => (Array.isArray(items) ? items : []).map((item) => {
      const incoming = clone(item || {});
      const signature = String(incoming.signature || '').trim()
        || `${String(incoming.author || '').trim()}\u0000${String(incoming.content || '')}\u0000${String(incoming.time || '')}`;
      const existing = Array.from(moments.values()).find(moment => String(moment.signature || '') === signature);
      return api.upsert({ ...incoming, id: incoming.id || existing?.id || '', signature });
    }),
    addComments: (momentId, comments = []) => {
      const id = String(momentId || '').trim();
      const moment = moments.get(id);
      if (!moment) return null;
      const next = clone(moment);
      next.comments = Array.isArray(next.comments) ? next.comments : [];
      (Array.isArray(comments) ? comments : []).forEach((comment) => {
        next.comments.push({
          ...clone(comment || {}),
          id: comment?.id || `comment-${nextComment++}`,
        });
      });
      next.comments = next.comments.slice(-2);
      moments.set(id, next);
      return clone(next);
    },
    remove: (momentId) => moments.delete(String(momentId || '').trim()),
    removeComment: (momentId, commentId) => {
      const id = String(momentId || '').trim();
      const moment = moments.get(id);
      if (!moment) return false;
      const before = Array.isArray(moment.comments) ? moment.comments.length : 0;
      moment.comments = (Array.isArray(moment.comments) ? moment.comments : [])
        .filter(comment => String(comment.id || '') !== String(commentId || '').trim());
      moments.set(id, moment);
      return moment.comments.length !== before;
    },
  };
  return api;
};

{
  const runtime = createChatRuntime();
  const contract = buildChatEmitCommitContract({
    toolName: 'chat.emit_private',
    args: {
      targetName: '菲伦',
      speakerName: '菲伦',
      content: '今晚别一个人走。',
      time: '22:12',
    },
  });
  const blocked = await commitChatEmitContract({ contract, runtime });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.reason, 'confirmation_required');
  assert.equal(runtime.sessions.size, 0);

  const committed = await commitChatEmitContract({ contract, runtime, confirmed: true });
  assert.equal(committed.status, 'committed');
  assert.equal(committed.writesChat, true);
  assert.deepEqual(committed.refs.createdMessageIds, ['msg-1']);
  assert.equal(runtime.sessions.get('contact:菲伦')[0].content, '今晚别一个人走。');

  const undoBlocked = await undoChatEmitCommit({ commitResult: committed, runtime });
  assert.equal(undoBlocked.status, 'blocked');
  assert.equal(runtime.sessions.get('contact:菲伦').length, 1);

  const undone = await undoChatEmitCommit({ commitResult: committed, runtime, confirmed: true });
  assert.equal(undone.status, 'undone');
  assert.equal(runtime.sessions.get('contact:菲伦').length, 0);
  console.log('ok - chat emit commit adapter appends and undoes private chat messages only after confirmation');
}

{
  const runtime = {
    ...createChatRuntime(),
    resolveTargetSessionId: () => '',
  };
  const contract = buildChatEmitCommitContract({
    toolName: 'chat.emit_private',
    args: {
      targetName: '不存在',
      speakerName: '菲伦',
      content: '今晚别一个人走。',
    },
  });
  const skipped = await commitChatEmitContract({ contract, runtime, confirmed: true });
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.reason, 'target_session_not_found');
  assert.equal(skipped.writesChat, false);
  console.log('ok - chat emit commit adapter reports skipped chat commits with a reason');
}

{
  const momentsStore = createMomentsStore([{
    id: 'moment-1',
    author: '雪',
    content: '旧动态',
    time: '21:00',
    signature: 'old',
    comments: [
      { id: 'old-1', author: '我', content: '第一条' },
      { id: 'old-2', author: '雪', content: '第二条' },
    ],
  }]);
  const contract = buildChatEmitCommitContract({
    toolName: 'chat.emit_moment_comment',
    args: {
      momentId: 'moment-1',
      author: '菲伦',
      content: '我会在楼下等你',
    },
  });
  const committed = await commitChatEmitContract({
    contract,
    runtime: { momentsStore },
    confirmed: true,
  });
  assert.equal(committed.status, 'committed');
  assert.equal(committed.refs.createdCommentIds.length, 1);
  assert.deepEqual(momentsStore.get('moment-1').comments.map(item => item.id), ['old-2', 'comment-1']);

  const undone = await undoChatEmitCommit({
    commitResult: committed,
    runtime: { momentsStore },
    confirmed: true,
  });
  assert.equal(undone.status, 'undone');
  assert.deepEqual(momentsStore.get('moment-1').comments.map(item => item.id), ['old-1', 'old-2']);
  console.log('ok - chat emit commit adapter restores moment comment snapshots on undo');
}

{
  const momentsStore = createMomentsStore([{
    id: 'moment-2',
    author: '雪',
    content: '原内容',
    time: '20:00',
    signature: '雪\u0000同一签名\u000020:00',
    likes: 0,
    comments: [],
  }]);
  const updateContract = buildChatEmitCommitContract({
    toolName: 'chat.emit_moment_post',
    args: {
      author: '雪',
      content: '同一签名',
      time: '20:00',
      likes: 3,
    },
  });
  const updated = await commitChatEmitContract({
    contract: updateContract,
    runtime: { momentsStore },
    confirmed: true,
  });
  assert.equal(updated.status, 'committed');
  assert.equal(momentsStore.get('moment-2').likes, 3);
  await undoChatEmitCommit({ commitResult: updated, runtime: { momentsStore }, confirmed: true });
  assert.equal(momentsStore.get('moment-2').content, '原内容');
  assert.equal(momentsStore.get('moment-2').likes, 0);

  const createContract = buildChatEmitCommitContract({
    toolName: 'chat.emit_moment_post',
    args: {
      author: '菲伦',
      content: '新动态',
      time: '22:00',
    },
  });
  const created = await commitChatEmitContract({
    contract: createContract,
    runtime: { momentsStore },
    confirmed: true,
  });
  assert.equal(created.status, 'committed');
  assert.equal(momentsStore.get(created.refs.createdMomentIds[0]).content, '新动态');
  await undoChatEmitCommit({ commitResult: created, runtime: { momentsStore }, confirmed: true });
  assert.equal(momentsStore.get(created.refs.createdMomentIds[0]), null);
  console.log('ok - chat emit commit adapter restores or removes moment posts on undo');
}
