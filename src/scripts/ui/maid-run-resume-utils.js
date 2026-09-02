import { getLocalizedPromptText } from '../i18n/prompt-locale.js';

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
  const prompt = (key, fallback, value = '') => getLocalizedPromptText(`maid.resume.${key}`, fallback)
    .replaceAll('{value}', String(value ?? ''));
  const lines = [
    prompt('start', '继续这条已中断的女仆任务。'),
    runId ? `runId: ${runId}` : '',
    goal ? prompt('goal', '目标：{value}', goal) : '',
    status ? prompt('status', '状态：{value}', status) : '',
    reason ? prompt('reason', '原因：{value}', reason) : '',
    continueHint ? prompt('hint', '继续提示：\n{value}', continueHint) : '',
    continueHint ? '' : prompt('instruction', '请基于这条 run 的历史继续执行、验证和修正，不要改成普通闲聊。'),
  ].filter(Boolean);
  return lines.join('\n') || prompt('fallback', '继续');
};
