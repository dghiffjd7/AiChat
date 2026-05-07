export const resolveMentionQueryContext = (text = '', cursorPos = 0) => {
  const source = String(text || '');
  const pos = Math.max(0, Number(cursorPos || 0));
  let atPos = -1;
  for (let i = pos - 1; i >= 0; i -= 1) {
    const ch = source[i];
    if (ch === '@') {
      atPos = i;
      break;
    }
    if (ch === ' ' || ch === '\n') break;
  }
  if (atPos < 0) return null;
  if (atPos > 0 && source[atPos - 1] !== ' ' && source[atPos - 1] !== '\n') return null;
  return {
    mentionStartPos: atPos,
    query: source.slice(atPos + 1, pos).toLowerCase(),
  };
};

export const resolveMentionKeyAction = ({
  key = '',
  shiftKey = false,
  selectedIndex = 0,
  itemCount = 0,
} = {}) => {
  const count = Math.max(0, Number(itemCount || 0));
  const index = Math.max(0, Number(selectedIndex || 0));
  if (count <= 0) return { type: 'noop', selectedIndex: index };
  if (key === 'ArrowDown') {
    return { type: 'move', selectedIndex: Math.min(index + 1, count - 1) };
  }
  if (key === 'ArrowUp') {
    return { type: 'move', selectedIndex: Math.max(index - 1, 0) };
  }
  if (key === 'Enter' && !shiftKey) {
    return { type: 'select', selectedIndex: index };
  }
  if (key === 'Escape') {
    return { type: 'hide', selectedIndex: index };
  }
  return { type: 'noop', selectedIndex: index };
};

export const hideMentionDropdownCore = (dropdown) => {
  if (dropdown) {
    dropdown.style.display = 'none';
  }
  return {
    mentionStartPos: -1,
    mentionQuery: '',
    mentionSelectedIndex: 0,
  };
};
