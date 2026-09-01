export const requestAppLanguageRestart = async ({ safeInvokeFn = null } = {}) => {
  if (typeof safeInvokeFn !== 'function') {
    return { ok: false, reason: 'invoke_unavailable' };
  }
  try {
    await safeInvokeFn('restart_app', {});
    return { ok: true, reason: 'restarting' };
  } catch (error) {
    const message = String(error?.message || error || '');
    return {
      ok: false,
      reason: /not_supported|unsupported|mobile/i.test(message) ? 'manual_restart_required' : 'restart_failed',
      message,
    };
  }
};
