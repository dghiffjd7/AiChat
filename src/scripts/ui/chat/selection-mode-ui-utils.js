export const createSelectionModeUiRuntime = ({
  documentLike,
  getSelectionMode,
  getSelectedMessageIds,
  onExitSelectionMode,
  onDeleteSelected,
  onToggleMessageSelection,
  toastInfo,
} = {}) => ({
  ensureSelectionBar(existingBar) {
    if (existingBar) return existingBar;
    const bar = documentLike.createElement('div');
    bar.id = 'chat-batch-delete-bar';
    bar.style.cssText = `
            display:none;
            position: fixed;
            left: 12px;
            right: 12px;
            top: calc(56px + env(safe-area-inset-top, 0px) + 8px);
            z-index: 22000;
            background: var(--app-surface-card);
            border: 1px solid rgba(0,0,0,0.08);
            border-radius: 14px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.18);
            padding: 10px;
            display:flex;
            align-items:center;
            gap: 10px;
            box-sizing: border-box;
        `;
    const cancelBtn = documentLike.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.dataset.role = 'cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText =
      'border:1px solid rgba(0,0,0,0.10); background:var(--app-surface-card); border-radius:12px; padding:8px 12px;';
    const countEl = documentLike.createElement('div');
    countEl.dataset.role = 'count';
    countEl.textContent = '已选择 0 条';
    countEl.style.cssText = 'flex:1; font-weight:800; color:var(--app-text-primary);';
    const deleteBtn = documentLike.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.dataset.role = 'delete';
    deleteBtn.textContent = '删除';
    deleteBtn.style.cssText =
      'border:none; background:#ef4444; color:var(--app-text-inverse); border-radius:12px; padding:8px 14px; font-weight:800;';
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onExitSelectionMode?.();
    });
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ids = [...(getSelectedMessageIds?.() || [])];
      if (!ids.length) {
        toastInfo?.('请选择要删除的消息');
        return;
      }
      onDeleteSelected?.(ids);
      onExitSelectionMode?.();
    });
    bar.appendChild(cancelBtn);
    bar.appendChild(countEl);
    bar.appendChild(deleteBtn);
    bar.__chatappCountEl = countEl;
    bar.__chatappDeleteEl = deleteBtn;
    documentLike.body.appendChild(bar);
    return bar;
  },
  setSelectionBarVisible(selectionBar, visible, selectedMessageIds) {
    if (!selectionBar) return;
    selectionBar.style.display = visible ? 'flex' : 'none';
    if (!visible) return;
    const countEl = selectionBar.__chatappCountEl || null;
    const deleteBtn = selectionBar.__chatappDeleteEl || null;
    const count = selectedMessageIds instanceof Set ? selectedMessageIds.size : 0;
    if (countEl) countEl.textContent = `已选择 ${count} 条`;
    if (deleteBtn) deleteBtn.disabled = count === 0;
    if (deleteBtn) deleteBtn.style.opacity = count === 0 ? '0.6' : '1';
  },
  updateWrapperSelectionState(wrapper, msgId, selectedMessageIds) {
    const selected = selectedMessageIds instanceof Set ? selectedMessageIds.has(msgId) : false;
    const dot = wrapper?.__chatappSelectDot;
    if (!dot) return;
    if (selected) {
      dot.style.background = '#2563eb';
      dot.style.borderColor = '#2563eb';
      dot.textContent = '✓';
    } else {
      dot.style.background = 'var(--app-surface-card)';
      dot.style.borderColor = 'rgba(0,0,0,0.22)';
      dot.textContent = '';
    }
    wrapper.style.paddingLeft = '30px';
  },
  markWrapperSelectable(wrapper, msgId) {
    if (!wrapper || !msgId) return;
    const role = String(wrapper.dataset?.role || '');
    if (!role || role === 'system') return;
    wrapper.style.position = 'relative';
    wrapper.classList.add('chat-selectable');

    if (!wrapper.__chatappSelectDot) {
      const dot = documentLike.createElement('div');
      dot.className = 'chat-select-dot';
      dot.style.cssText = `
                position:absolute;
                left: 6px;
                top: 50%;
                transform: translateY(-50%);
                width: 22px;
                height: 22px;
                border-radius: 999px;
                border: 2px solid rgba(0,0,0,0.22);
                background: var(--app-surface-card);
                display:flex;
                align-items:center;
                justify-content:center;
                font-size: 14px;
                color: var(--app-text-inverse);
                pointer-events: none;
                box-sizing: border-box;
            `;
      wrapper.appendChild(dot);
      wrapper.__chatappSelectDot = dot;
    }

    if (!wrapper.__chatappSelectClick) {
      const handler = (e) => {
        if (!getSelectionMode?.()) return;
        try {
          e.preventDefault();
        } catch {}
        try {
          e.stopPropagation();
        } catch {}
        onToggleMessageSelection?.(msgId);
      };
      wrapper.__chatappSelectClick = handler;
      wrapper.addEventListener('click', handler, true);
    }

    this.updateWrapperSelectionState(wrapper, msgId, getSelectedMessageIds?.());
  },
  enterSelectionMode({
    initialMsgId = '',
    scrollEl = null,
    setSelectionMode = null,
    setSelectedMessageIds = null,
    setSelectionBarVisible = null,
    markWrapperSelectable = null,
  } = {}) {
    setSelectionMode?.(true);
    const nextSelected = new Set();
    if (initialMsgId) nextSelected.add(String(initialMsgId));
    setSelectedMessageIds?.(nextSelected);
    setSelectionBarVisible?.(true);

    const wrappers = scrollEl?.querySelectorAll?.('[data-msg-id][data-role]') || [];
    wrappers.forEach(wrapper => {
      const id = String(wrapper?.dataset?.msgId || '');
      if (!id) return;
      markWrapperSelectable?.(wrapper, id);
    });
    setSelectionBarVisible?.(true);
  },
  exitSelectionMode({
    scrollEl = null,
    setSelectionMode = null,
    setSelectedMessageIds = null,
    setSelectionBarVisible = null,
  } = {}) {
    setSelectionMode?.(false);
    setSelectedMessageIds?.(new Set());
    setSelectionBarVisible?.(false);
    const wrappers = scrollEl?.querySelectorAll?.('[data-msg-id].chat-selectable') || [];
    wrappers.forEach(wrapper => {
      try {
        wrapper.classList.remove('chat-selectable');
      } catch {}
      try {
        wrapper.style.paddingLeft = '';
      } catch {}
      try {
        if (wrapper.__chatappSelectClick) {
          wrapper.removeEventListener('click', wrapper.__chatappSelectClick, true);
        }
      } catch {}
      wrapper.__chatappSelectClick = null;
      try {
        wrapper.__chatappSelectDot?.remove?.();
      } catch {}
      wrapper.__chatappSelectDot = null;
    });
  },
  toggleMessageSelection({
    msgId = '',
    selectedMessageIds = null,
    scrollEl = null,
    updateWrapperSelectionState = null,
    setSelectionBarVisible = null,
  } = {}) {
    const id = String(msgId || '');
    if (!id || !(selectedMessageIds instanceof Set)) return;
    if (selectedMessageIds.has(id)) selectedMessageIds.delete(id);
    else selectedMessageIds.add(id);
    const wrapper = scrollEl?.querySelector?.(`[data-msg-id="${id}"][data-role]`);
    if (wrapper) updateWrapperSelectionState?.(wrapper, id);
    setSelectionBarVisible?.(true);
  },
});
