export const emitMemoryRowsUpdated = ({
  target = null,
  sessionId = '',
  templateId = '',
  CustomEventCtor = globalThis?.CustomEvent,
} = {}) => {
  if (!target || typeof target.dispatchEvent !== 'function' || typeof CustomEventCtor !== 'function') {
    return false;
  }
  target.dispatchEvent(
    new CustomEventCtor('memory-rows-updated', {
      detail: { sessionId, templateId },
    }),
  );
  return true;
};

export const notifyMemoryEditsApplied = ({
  target = null,
  sessionId = '',
  templateId = '',
  inserted = 0,
  updated = 0,
  deleted = 0,
  toastr = globalThis?.window?.toastr,
  CustomEventCtor = globalThis?.CustomEvent,
} = {}) => {
  emitMemoryRowsUpdated({
    target,
    sessionId,
    templateId,
    CustomEventCtor,
  });
  const parts = [];
  if (inserted) parts.push(`新增${inserted}`);
  if (updated) parts.push(`更新${updated}`);
  if (deleted) parts.push(`删除${deleted}`);
  if (parts.length) {
    toastr?.info?.(`记忆表格已更新：${parts.join(' · ')}`);
  }
  return parts;
};

export const notifyMemoryEditsRolledBack = ({
  target = null,
  sessionId = '',
  templateId = '',
  toastr = globalThis?.window?.toastr,
  CustomEventCtor = globalThis?.CustomEvent,
} = {}) => {
  emitMemoryRowsUpdated({
    target,
    sessionId,
    templateId,
    CustomEventCtor,
  });
  toastr?.info?.('已回滚上一轮记忆表格写入');
  return true;
};
