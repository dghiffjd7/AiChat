export const bindBackdropActivation = (
  backdrop,
  {
    documentLike = backdrop?.ownerDocument || null,
    onActivate = null,
  } = {},
) => {
  if (!backdrop?.addEventListener || !documentLike?.addEventListener) return () => {};

  let activePointerId = null;
  let startedOnBackdrop = false;
  let endedOnBackdrop = false;
  const reset = () => {
    activePointerId = null;
    startedOnBackdrop = false;
    endedOnBackdrop = false;
  };
  const matchesActivePointer = event => (
    activePointerId == null
    || event?.pointerId == null
    || event.pointerId === activePointerId
  );
  const handlePointerDown = event => {
    activePointerId = event?.pointerId ?? null;
    startedOnBackdrop = event?.target === backdrop;
    endedOnBackdrop = false;
  };
  const handlePointerUp = event => {
    if (!matchesActivePointer(event)) return;
    endedOnBackdrop = event?.target === backdrop;
  };
  const handlePointerCancel = event => {
    if (matchesActivePointer(event)) reset();
  };
  const handleClick = event => {
    const shouldActivate = (
      startedOnBackdrop
      && endedOnBackdrop
      && event?.target === backdrop
    );
    reset();
    if (shouldActivate) onActivate?.(event);
  };

  documentLike.addEventListener('pointerdown', handlePointerDown, true);
  documentLike.addEventListener('pointerup', handlePointerUp, true);
  documentLike.addEventListener('pointercancel', handlePointerCancel, true);
  backdrop.addEventListener('click', handleClick);

  return () => {
    documentLike.removeEventListener?.('pointerdown', handlePointerDown, true);
    documentLike.removeEventListener?.('pointerup', handlePointerUp, true);
    documentLike.removeEventListener?.('pointercancel', handlePointerCancel, true);
    backdrop.removeEventListener?.('click', handleClick);
    reset();
  };
};
