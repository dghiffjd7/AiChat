import assert from 'node:assert/strict';
import { requestAppLanguageRestart } from '../../src/scripts/i18n/app-language-restart.js';

assert.deepEqual(await requestAppLanguageRestart(), { ok: false, reason: 'invoke_unavailable' });
const calls = [];
assert.deepEqual(await requestAppLanguageRestart({
  safeInvokeFn: async (...args) => { calls.push(args); },
}), { ok: true, reason: 'restarting' });
assert.deepEqual(calls, [['restart_app', {}]]);
assert.equal((await requestAppLanguageRestart({
  safeInvokeFn: async () => { throw new Error('restart_not_supported_on_mobile'); },
})).reason, 'manual_restart_required');
assert.equal((await requestAppLanguageRestart({
  safeInvokeFn: async () => { throw new Error('ipc failed'); },
})).reason, 'restart_failed');

console.log('i18n-app-language-restart-tests passed');
