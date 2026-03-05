export function mountNodeEditorImpl(context, args = {}) {
    if (!context || typeof context.mountNodeEditorCore !== 'function') return;
    return context.mountNodeEditorCore(args);
}
