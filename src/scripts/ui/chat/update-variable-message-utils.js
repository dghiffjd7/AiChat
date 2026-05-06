export const resolveUpdateVariableRawText = (message) =>
  (typeof message?.rawOriginal === 'string' && message.rawOriginal) ||
  (typeof message?.rawSource === 'string' && message.rawSource) ||
  (typeof message?.raw === 'string' && message.raw) ||
  (typeof message?.content === 'string' && message.content) ||
  '';

export const collectUpdateVariableCommandsFromRaw = (
  raw,
  {
    isTavernMvuSession = false,
    extractBlocks,
    parseCommands,
  } = {},
) => {
  const safeRaw = String(raw || '');
  const parsed = typeof extractBlocks === 'function'
    ? extractBlocks(safeRaw)
    : { blocks: [], cleaned: safeRaw };
  const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
  const outsideUpdateBlocks = String(parsed?.cleaned || '');
  const commands = [];

  blocks.forEach((block) => {
    const next = typeof parseCommands === 'function' ? parseCommands(block) : [];
    if (Array.isArray(next) && next.length) commands.push(...next);
  });

  if (outsideUpdateBlocks) {
    const hasOutsideProtocol =
      /<(json_?patch)\b/i.test(outsideUpdateBlocks) ||
      /_\.(set|insert|assign|remove|unset|delete|add)\(/i.test(outsideUpdateBlocks);
    if (hasOutsideProtocol) {
      const parsedOutside = typeof parseCommands === 'function' ? parseCommands(outsideUpdateBlocks) : [];
      if (Array.isArray(parsedOutside) && parsedOutside.length) commands.push(...parsedOutside);
    }
  }

  if (!blocks.length && isTavernMvuSession && !commands.length) {
    const fallback = typeof parseCommands === 'function' ? parseCommands(safeRaw) : [];
    if (Array.isArray(fallback) && fallback.length) commands.push(...fallback);
  }

  return {
    blocks,
    outsideUpdateBlocks,
    commands,
  };
};

export const buildUpdateVariableCommandPreview = (commands, { limit = 8 } = {}) =>
  (Array.isArray(commands) ? commands : [])
    .slice(0, limit)
    .map((cmd) => {
      const type = String(cmd?.type || '');
      const path = Array.isArray(cmd?.path) ? cmd.path.map(item => String(item)).join('.') : '';
      const from = Array.isArray(cmd?.from) ? cmd.from.map(item => String(item)).join('.') : '';
      if (type === 'move') return `move(${from}=>${path})`;
      if (type === 'add' || type === 'set') return `${type}(${path})=${String(cmd?.value ?? '')}`;
      if (type === 'insert') return `insert(${path},${String(cmd?.key ?? '-')})`;
      if (type === 'remove') return `remove(${path},${String(cmd?.key ?? '-')})`;
      if (type === 'delete') return `delete(${path})`;
      return type || 'unknown';
    })
    .join(' | ');
