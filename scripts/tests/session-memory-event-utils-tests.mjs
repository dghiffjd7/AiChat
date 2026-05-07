import assert from 'node:assert/strict';

import {
  emitMemoryRowsUpdated,
  notifyMemoryEditsApplied,
  notifyMemoryEditsRolledBack,
} from '../../src/scripts/ui/session-memory-event-utils.js';

{
  const events = [];
  class FakeCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  const target = {
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
  };
  const result = emitMemoryRowsUpdated({
    target,
    sessionId: 'session-1',
    templateId: 'template-1',
    CustomEventCtor: FakeCustomEvent,
  });
  assert.equal(result, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'memory-rows-updated');
  assert.deepEqual(events[0].detail, { sessionId: 'session-1', templateId: 'template-1' });
  console.log('ok - emitMemoryRowsUpdated dispatches the shared memory rows updated event');
}

{
  const result = emitMemoryRowsUpdated({
    target: null,
    sessionId: 'session-1',
    templateId: 'template-1',
    CustomEventCtor: class {},
  });
  assert.equal(result, false);
  console.log('ok - emitMemoryRowsUpdated tolerates missing event targets');
}

{
  const events = [];
  const infos = [];
  class FakeCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  const target = {
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
  };
  const result = notifyMemoryEditsApplied({
    target,
    sessionId: 'session-2',
    templateId: 'template-2',
    inserted: 1,
    updated: 2,
    deleted: 0,
    toastr: { info: message => infos.push(message) },
    CustomEventCtor: FakeCustomEvent,
  });
  assert.deepEqual(result, ['新增1', '更新2']);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].detail, { sessionId: 'session-2', templateId: 'template-2' });
  assert.deepEqual(infos, ['记忆表格已更新：新增1 · 更新2']);
  console.log('ok - notifyMemoryEditsApplied emits shared event and summary toast');
}

{
  const events = [];
  const infos = [];
  class FakeCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  const target = {
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
  };
  const result = notifyMemoryEditsRolledBack({
    target,
    sessionId: 'session-3',
    templateId: 'template-3',
    toastr: { info: message => infos.push(message) },
    CustomEventCtor: FakeCustomEvent,
  });
  assert.equal(result, true);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].detail, { sessionId: 'session-3', templateId: 'template-3' });
  assert.deepEqual(infos, ['已回滚上一轮记忆表格写入']);
  console.log('ok - notifyMemoryEditsRolledBack emits shared event and rollback toast');
}
