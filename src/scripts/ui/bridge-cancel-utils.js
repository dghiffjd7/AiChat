export const isBridgeAbortError = (error) => {
  const name = String(error?.name || '');
  if (name === 'AbortError') return true;
  const message = String(error?.message || error || '').trim().toLowerCase();
  return message === 'aborted' || message.includes('aborterror');
};

export const resolveBridgeCancellationReason = ({ signal = null, abortReason = '' } = {}) => {
  const explicit = String(abortReason || '').trim();
  if (explicit) return explicit;
  const signalReason = signal?.reason;
  if (typeof signalReason === 'string' && signalReason.trim()) return signalReason.trim();
  return 'user';
};

export const shouldTreatBridgeStreamErrorAsCancellation = (error, { signal = null, abortReason = '' } = {}) => {
  if (!isBridgeAbortError(error)) return false;
  if (signal) return signal.aborted === true;
  return String(abortReason || '').trim().length > 0;
};
