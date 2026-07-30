(async () => {
  const from = '星汐学园创作汇总·星汐验收-R2-0730 (2)';
  const to = '星汐学园创作汇总·星汐验收-R2-0730';
  await window.appBridge?.waitForWorldStoreReady?.();
  const fromExists = await window.appBridge?.worldInfoExists?.(from);
  const toExists = await window.appBridge?.worldInfoExists?.(to);
  if (!fromExists) return { ok: false, reason: 'source_missing', from, to };
  if (toExists) return { ok: false, reason: 'target_exists', from, to };
  const data = await window.appBridge?.getWorldInfo?.(from);
  await window.appBridge?.renameWorldInfo?.(from, to, {
    ...(data || {}),
    name: to,
  });
  return {
    ok: true,
    from,
    to,
    fromExistsAfter: await window.appBridge?.worldInfoExists?.(from),
    toExistsAfter: await window.appBridge?.worldInfoExists?.(to),
    rpWorldIds: await window.appBridge?.getWorldIdsForSession?.(
      'rp:persona_1785412620341_9yi8k',
    ) || [],
  };
})()
