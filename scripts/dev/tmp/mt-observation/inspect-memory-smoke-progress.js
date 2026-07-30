(() => ({
  probe: globalThis.__maidLoopProbe || null,
  visibleButtons: [...document.querySelectorAll('button')]
    .filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .map(button => String(button.textContent || button.getAttribute('aria-label') || '').trim())
    .filter(Boolean)
    .slice(-20),
  runs: (window.appBridge?.debugUiRegistry?.stores?.agentRunStore?.listRuns?.({ limit: 5 }) || [])
    .map(run => ({
      id: run.id,
      status: run.status,
      title: run.title,
      updatedAt: run.updatedAt,
      error: run.errorMessage || '',
    })),
}))()
