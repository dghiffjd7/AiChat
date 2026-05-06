const stripSystemMessagePrefix = (content) =>
  String(content || '')
    .replace(/^系统消息[:：]?\s*/i, '')
    .trim();

const splitSystemNames = (segment = '') => {
  const cleaned = String(segment || '')
    .replace(/[。.!！？]+/g, '')
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/[、，,]+/)
    .map(name => name.trim())
    .filter(Boolean);
};

export const parseGroupSystemOps = (content) => {
  const text = stripSystemMessagePrefix(content).replace(/\s+/g, ' ').trim();
  if (!text) return [];

  const ops = [];
  const inviteNames = new Set();
  const inviteRe = /邀请(.+?)加入群聊/g;
  let match = null;
  while ((match = inviteRe.exec(text))) {
    splitSystemNames(match[1]).forEach(name => inviteNames.add(name));
  }
  if (inviteNames.size > 0) {
    ops.push({ type: 'invite', names: [...inviteNames] });
  }

  const removeNames = new Set();
  const removePatterns = [
    /将(.+?)(?:移出|移除|踢出)群聊/g,
    /把(.+?)(?:移出|移除|踢出)群聊/g,
    /(?:移出|移除|踢出)(.+?)(?:群聊|本群)/g,
  ];
  removePatterns.forEach((re) => {
    let removeMatch = null;
    while ((removeMatch = re.exec(text))) {
      splitSystemNames(removeMatch[1]).forEach(name => removeNames.add(name));
    }
  });
  if (removeNames.size > 0) {
    ops.push({ type: 'remove', names: [...removeNames] });
  }

  if (!text.includes('邀请')) {
    const joinNames = new Set();
    const joinRe = /(.+?)加入群聊/g;
    let joinMatch = null;
    while ((joinMatch = joinRe.exec(text))) {
      splitSystemNames(joinMatch[1]).forEach(name => joinNames.add(name));
    }
    if (joinNames.size > 0) {
      ops.push({ type: 'join', names: [...joinNames] });
    }
  }

  return ops;
};
