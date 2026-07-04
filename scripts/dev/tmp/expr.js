(async () => {
  const mod = await import('/scripts/utils/tauri.js');
  const allowKv = await mod.safeInvoke('load_kv', { name: 'agent_tool_safety_allow_rules_v1' }).catch(e => ({ err: String(e) }));
  return { type: typeof allowKv, keys: allowKv && typeof allowKv === 'object' ? Object.keys(allowKv) : null, value: allowKv };
})()
