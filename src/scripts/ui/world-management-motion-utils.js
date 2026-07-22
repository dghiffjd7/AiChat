const activeDisclosureAnimations = new WeakMap();

export const isWorldMotionReduced = ({
    documentRef = globalThis.document,
    matchMediaFn = globalThis.matchMedia,
} = {}) => {
    if (documentRef?.body?.dataset?.reducedMotion === 'on') return true;
    try {
        return Boolean(matchMediaFn?.('(prefers-reduced-motion: reduce)')?.matches);
    } catch {
        return false;
    }
};

export const setWorldDisclosureState = (element, expanded, {
    duration = 320,
    easing = 'cubic-bezier(0.32, 0.72, 0, 1)',
    display = 'block',
    onFinish = null,
} = {}) => {
    if (!element?.style) return null;

    const shouldExpand = Boolean(expanded);
    const previousAnimation = activeDisclosureAnimations.get(element);
    const currentHeight = element.style.display === 'none'
        ? 0
        : Math.max(0, Number(element.getBoundingClientRect?.().height || 0));
    if (previousAnimation) {
        activeDisclosureAnimations.delete(element);
        try { previousAnimation.cancel(); } catch {}
    }

    if (shouldExpand) element.style.display = display;

    let animation = null;
    const finish = () => {
        activeDisclosureAnimations.delete(element);
        if (animation) {
            try { animation.cancel(); } catch {}
        }
        element.classList?.remove?.('is-world-disclosing');
        element.style.height = '';
        element.style.opacity = '';
        element.style.overflow = '';
        element.style.boxSizing = '';
        element.style.display = shouldExpand ? display : 'none';
        if (typeof onFinish === 'function') onFinish();
    };

    if (isWorldMotionReduced() || typeof element.animate !== 'function') {
        finish();
        return null;
    }

    const startHeight = shouldExpand
        ? currentHeight
        : (currentHeight || Math.max(0, Number(element.scrollHeight || 0)));
    const endHeight = shouldExpand ? Math.max(0, Number(element.scrollHeight || 0)) : 0;
    const startOpacity = shouldExpand && startHeight <= 0 ? 0 : 1;

    element.classList?.add?.('is-world-disclosing');
    element.style.overflow = 'hidden';
    element.style.boxSizing = 'border-box';

    animation = element.animate([
        { height: `${Math.round(startHeight)}px`, opacity: startOpacity },
        { height: `${Math.round(endHeight)}px`, opacity: shouldExpand ? 1 : 0 },
    ], {
        duration,
        easing,
        fill: 'both',
    });
    activeDisclosureAnimations.set(element, animation);
    animation.finished.then(() => {
        if (activeDisclosureAnimations.get(element) !== animation) return;
        finish();
    }).catch(() => {});
    return animation;
};
