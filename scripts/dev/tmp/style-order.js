(() => {
  const doc = document.querySelector('iframe')?.contentDocument;
  if (!doc) return { err: 'no doc' };
  const styles = [...doc.querySelectorAll('style')].map((s, i) => ({
    i, id: s.id || '', head: (s.textContent || '').slice(0, 60).replace(/\n/g, ' '),
    inHead: s.closest('head') !== null,
  }));
  const baseIdx = styles.findIndex(s => s.id === '__chatapp_base');
  const panelIdx = styles.findIndex(s => /body\s*\{/.test(s.head) && s.id !== '__chatapp_base');
  return { styleCount: styles.length, baseIdx, first6: styles.slice(0, 6), last3: styles.slice(-3) };
})()
