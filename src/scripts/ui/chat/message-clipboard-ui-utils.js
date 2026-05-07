export const createMessageClipboardUiRuntime = ({
  documentLike,
  navigatorLike,
  execCopyCommand,
} = {}) => ({
  getPoint(event) {
    if (event?.touches?.[0]) return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    if (event?.changedTouches?.[0]) return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    return { x: event?.clientX ?? 0, y: event?.clientY ?? 0 };
  },
  async copyToClipboard(text) {
    const value = String(text ?? '');
    try {
      if (navigatorLike?.clipboard?.writeText) {
        await navigatorLike.clipboard.writeText(value);
        return true;
      }
    } catch {}
    try {
      const ta = documentLike.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.setAttribute('readonly', 'true');
      documentLike.body.appendChild(ta);
      ta.select?.();
      const ok = execCopyCommand?.('copy') === true;
      ta.remove?.();
      return ok;
    } catch {
      return false;
    }
  },
  getBubbleCopyText(wrapper) {
    if (!wrapper || typeof wrapper.querySelector !== 'function') return '';
    const bubble = wrapper.querySelector('.QQ_chat_msgdiv');
    if (!bubble?.cloneNode) return '';
    const clone = bubble.cloneNode(true);
    try {
      clone.querySelectorAll?.('.chat-codeblock, iframe, details, summary, script, style').forEach(node => node.remove());
    } catch {}
    const raw = clone.innerText ?? clone.textContent ?? '';
    return String(raw || '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  },
});
