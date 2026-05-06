import assert from 'node:assert/strict';

import {
  appendDebugLog,
  formatVisibleDebugLogsText,
  getVisibleDebugLogs,
  renderDebugLogHtml,
} from '../../src/scripts/ui/debug-panel-log-utils.js';

{
  const logs = [
    { message: 'hello world', prefix: '✓', timestamp: '10:00:00', color: '#00ff00' },
    { message: 'warn case', prefix: '⚠️', timestamp: '10:00:01', color: '#ffaa00' },
  ];
  const result = getVisibleDebugLogs({ logs, filterText: 'warn' });
  assert.deepEqual(result, [logs[1]]);
  console.log('ok - getVisibleDebugLogs filters by lowercase message match');
}

{
  const logs = [];
  const seenMessages = new Set();
  const first = appendDebugLog({
    logs,
    seenMessages,
    message: 'boot',
    type: 'info',
    maxLogs: 1,
    timestamp: '10:00:00',
  });
  const second = appendDebugLog({
    logs,
    seenMessages,
    message: 'boot',
    type: 'info',
    maxLogs: 1,
    timestamp: '10:00:01',
  });
  const third = appendDebugLog({
    logs,
    seenMessages,
    message: 'warn',
    type: 'warn',
    maxLogs: 1,
    timestamp: '10:00:02',
  });
  assert.equal(first.appended, true);
  assert.equal(second.appended, false);
  assert.equal(third.appended, true);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, 'warn');
  assert.equal(logs[0].prefix, '⚠️');
  console.log('ok - appendDebugLog deduplicates messages and trims the log buffer');
}

{
  const logs = [
    { prefix: '✓', timestamp: '10:00:00', message: 'hello', color: '#00ff00' },
    { prefix: '❌', timestamp: '10:00:01', message: 'bad', color: '#ff0000' },
  ];
  assert.equal(
    renderDebugLogHtml(logs),
    '<div style="color: #00ff00; margin-bottom: 2px;">✓ [10:00:00] hello</div><div style="color: #ff0000; margin-bottom: 2px;">❌ [10:00:01] bad</div>',
  );
  assert.equal(
    formatVisibleDebugLogsText(logs),
    '✓ [10:00:00] hello\n❌ [10:00:01] bad',
  );
  console.log('ok - debug log render and copy helpers produce stable html and plain-text output');
}
