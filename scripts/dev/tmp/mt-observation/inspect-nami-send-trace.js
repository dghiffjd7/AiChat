(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const timeline = registry.stores?.traceTimeline;
  const events = typeof timeline?.snapshot === 'function'
    ? timeline.snapshot({ sessionId: '娜美', limit: 80 })
    : [];
  return events
    .filter(event => Number(event?.startedAt || 0) >= 1785463200000)
    .map(event => ({
      eventId: event.eventId,
      category: event.category,
      phase: event.phase,
      status: event.status,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      durationMs: event.durationMs,
      summary: event.summary,
      details: event.details,
      relatedIds: event.relatedIds,
    }));
})()
