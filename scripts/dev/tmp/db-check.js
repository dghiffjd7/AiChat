(async () => {
  const iframe = document.querySelector('iframe');
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  const probe = win.eval(`(async () => {
    const out = { Dexie: typeof Dexie, dbType: typeof db };
    try {
      if (typeof db !== 'undefined' && db) {
        out.dbOpen = db.isOpen ? db.isOpen() : 'n/a';
        out.tables = db.tables ? db.tables.map(t => t.name).join(',') : 'n/a';
        const n = await db.archives.count();
        out.archiveCount = n;
      }
    } catch (e) { out.dbErr = String(e && e.message || e).slice(0, 150); }
    return JSON.stringify(out);
  })()`);
  const result = await probe;
  // 同时看 map-list-container 现状
  const c = doc.getElementById('map-list-container');
  return { db: JSON.parse(result), container: c ? { children: c.children.length, text: (c.innerText || '').slice(0, 80) } : null };
})()
