(async () => {
  const stores = window.appBridge.debugUiRegistry.stores;
  const ss = stores.scriptStore;
  await ss?.load?.();
  const scopes = ss.listScopes();
  const charScripts = {};
  for (const id of scopes.character || []) {
    const items = (ss.getScripts('character', id) || []).filter(s => s.enabled !== false);
    if (items.length) charScripts[id] = items.map(s => ({
      name: String(s.name || '').slice(0, 36), authorized: s.authorized,
      size: String(s.content || '').length,
    }));
  }
  const cards = stores.personaStore?.getAll?.() || [];
  const cardInfo = cards.map(c => {
    const raw = JSON.stringify(c);
    return {
      id: String(c.id || '').slice(0, 30), name: c.name, size: raw.length,
      html: /<div|<style|<script|class=/i.test(raw),
      iframe: /<iframe|srcdoc/i.test(raw),
      mvu: /_\.(set|get)\(|stat_data/i.test(raw),
      regexCount: Array.isArray(c.regexScripts) ? c.regexScripts.length : (Array.isArray(c.regex) ? c.regex.length : 0),
    };
  }).filter(c => c.size > 5000 || c.html);
  return { charScripts, cards: cardInfo };
})()
