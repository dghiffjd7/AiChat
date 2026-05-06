export const normalizeDialogueMessage = (
  message,
  { isUserSpeakerName = () => false } = {},
) => {
  const payload =
    message && typeof message === 'object'
      ? {
          speaker: String(message?.speaker || '').trim(),
          content: String(message?.content || '').trim(),
          time: String(message?.time || '').trim(),
        }
      : { speaker: '', content: String(message || '').trim(), time: '' };
  if (!payload.speaker && payload.content) {
    const match = payload.content.match(/^([^\s:：]{1,12})[:：]\s*(.+)$/);
    if (match && typeof isUserSpeakerName === 'function' && isUserSpeakerName(match[1])) {
      payload.speaker = match[1];
      payload.content = match[2].trim();
    }
  }
  return payload;
};
