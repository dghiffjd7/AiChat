const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const buildMaidRunResumePrompt = (run = {}) => {
  const metadata = run?.metadata || {};
  const runId = trim(run?.id);
  const goal = trim(metadata.goal || run?.title || run?.summary);
  const status = trim(metadata.maidStatus || run?.status);
  const reason = trim(metadata.reactStoppedReason || metadata.reason || run?.errorMessage);
  const continueHint = trim(metadata.continueHint);
  const lines = [
    '继续这条已中断的女仆任务。',
    runId ? `runId: ${runId}` : '',
    goal ? `目标：${goal}` : '',
    status ? `状态：${status}` : '',
    reason ? `原因：${reason}` : '',
    continueHint ? `继续提示：\n${continueHint}` : '',
    continueHint ? '' : '请基于这条 run 的历史继续执行、验证和修正，不要改成普通闲聊。',
  ].filter(Boolean);
  return lines.join('\n') || '继续';
};
