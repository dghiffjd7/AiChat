(() => ({
  tauri: !!window.__TAURI__, core: !!window.__TAURI__?.core, invoke: typeof window.__TAURI__?.core?.invoke,
  tauriInvoke: typeof window.__TAURI__?.invoke,
  bridge: !!window.appBridge, chatStore: !!window.appBridge?.debugUiRegistry?.stores?.chatStore,
}))()
