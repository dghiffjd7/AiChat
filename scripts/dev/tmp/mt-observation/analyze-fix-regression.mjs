import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: analyze-fix-regression.mjs RESULTS.jsonl [...]');
  process.exit(2);
}

const readTasks = file => {
  const latest = new Map();
  for (const [index, line] of readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).entries()) {
    let record = null;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`${file}:${index + 1}: ${error.message}`);
    }
    if (record.recordType === 'task_result' && record.taskId) latest.set(record.taskId, record);
  }
  return [...latest.values()];
};

const WRITE_TOOLS = new Set([
  'chat.optimize_message',
  'chat.repair_message_format',
  'chat.save_format_profile',
  'chat.send_message',
  'config.switch_profile',
  'contact.avatar.set',
  'media.prepare_image',
  'moments.publish',
  'persona.avatar.set',
  'persona.create',
  'persona.switch',
  'session.create',
  'session.wallpaper.set',
  'ui.click_element',
  'user.avatar.set',
  'user.create',
  'user.switch',
  'worldbook.bind_session',
  'worldbook.create',
  'worldbook.delete_entries',
  'worldbook.generate_entries',
  'worldbook.update_entries',
]);

const hasText = (task, pattern) => (
  (task.result?.steps || []).some(step => pattern.test(String(step.output || ''))) ||
  pattern.test(String(task.result?.message || ''))
);

const reports = files.map((file) => {
  const tasks = readTasks(file);
  const checks = tasks.map((task) => {
    const number = Number(String(task.taskId || '').split('-').at(-1));
    const tools = task.observed?.selectedTools || [];
    const allowOnceEvents = (task.permissionEvents || [])
      .filter(event => event.button === '允许一次');
    const reasons = [];

    if (number >= 1 && number <= 8) {
      const writes = tools.filter(tool => WRITE_TOOLS.has(tool));
      if (writes.length) reasons.push(`read_only_write:${writes.join(',')}`);
      if (allowOnceEvents.length) reasons.push(`unexpected_allow_once:${allowOnceEvents.length}`);
    } else if (number >= 9 && number <= 11) {
      if (!tools.includes('session.create')) reasons.push('session_create_missing');
      if (allowOnceEvents.length) reasons.push(`intent_escalation:${allowOnceEvents.length}`);
      if (task.result?.ok === false) reasons.push(`task_failed:${task.result?.failureCode || task.result?.reason || '-'}`);
    } else if (number === 12 || number === 13) {
      if (!tools.includes('session.open_config')) reasons.push('session_open_config_missing');
      if (!hasText(task, /"opened":true/)) reasons.push('session_config_not_opened');
    } else if (number === 14) {
      if (!tools.includes('session.open_config')) reasons.push('session_open_config_missing');
      if (!hasText(task, /session_not_found/)) reasons.push('session_not_found_missing');
      if (hasText(task, /"opened":true/)) reasons.push('ghost_session_config_opened');
    } else if (number === 15) {
      if (!tools.includes('chat.repair_message_format')) reasons.push('format_repair_missing');
      if (hasText(task, /"applied":true/)) reasons.push('format_repair_wrote_back');
      if (!hasText(task, /cancelled|取消|no_changes|无需修改|model_cannot_repair/)) {
        reasons.push('format_repair_terminal_state_unclear');
      }
    }

    return {
      taskId: task.taskId,
      status: task.result?.status || (task.timeout ? 'timeout' : 'unknown'),
      tools,
      allowOnceCount: allowOnceEvents.length,
      semanticPass: reasons.length === 0,
      reasons,
    };
  });

  const cohorts = new Map();
  for (const task of tasks) {
    for (const snapshot of task.snapshots || []) {
      const provider = String(snapshot.cohort?.provider || '');
      const model = String(snapshot.cohort?.model || '');
      const key = `${provider}/${model}`;
      cohorts.set(key, (cohorts.get(key) || 0) + 1);
    }
  }

  return {
    file: basename(file),
    taskCount: tasks.length,
    semanticPassed: checks.filter(check => check.semanticPass).length,
    semanticFailed: checks.filter(check => !check.semanticPass),
    cohorts: Object.fromEntries(cohorts),
    checks,
  };
});

console.log(JSON.stringify(reports, null, 2));
process.exit(reports.some(report => report.semanticFailed.length) ? 1 : 0);
