(async () => {
  const tauriMod = await import("/scripts/utils/tauri.js");
  const invoke = (cmd, args) => tauriMod.safeInvoke(cmd, args);
  const reg = window.appBridge?.debugUiRegistry;
  const chatStore = reg?.stores?.chatStore;
  if (!invoke || !chatStore) return { err: 'missing invoke or chatStore' };
  const msgs = chatStore.getMessages('雷姆') || [];
  const target = [...msgs].reverse().find(m => m.type === 'image' && /^https?:\/\//.test(String(m.content || '')));
  if (!target) return { err: 'no remote image message found' };
  const url = String(target.content);
  const resp = await invoke('http_request', {
    url, method: 'GET',
    headers: { accept: 'image/*', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    body: null, responseBase64: true, response_base64: true,
  });
  const status = Number(resp?.status || 0);
  const base64 = String(resp?.body || '').trim();
  if (status < 200 || status >= 300 || !base64) return { err: `download failed HTTP ${status}` };
  const headers = resp?.headers || {};
  const mime = String(headers['content-type'] || headers['Content-Type'] || 'image/jpeg').split(';')[0].trim();
  const ext = /png/.test(mime) ? 'png' : (/webp/.test(mime) ? 'webp' : 'jpg');
  const start = await invoke('save_attachment_stream_start', {
    sessionId: '雷姆', fileName: `generated_image_repair_${Date.now()}.${ext}`, mimeType: mime,
  });
  const uploadId = start?.upload_id || start?.uploadId;
  if (!uploadId) return { err: 'no upload id' };
  const chunkSize = 262144 - (262144 % 4);
  for (let offset = 0; offset < base64.length; offset += chunkSize) {
    await invoke('save_attachment_stream_chunk', { uploadId, chunk: base64.slice(offset, offset + chunkSize) });
  }
  const fin = await invoke('save_attachment_stream_finish', { uploadId });
  const path = String(fin?.path || start?.path || '').trim();
  if (!path) return { err: 'save failed' };
  chatStore.updateMessage(target.id, {
    content: '[binary omitted]',
    meta: { ...(target.meta || {}), localPath: path, savedAt: Date.now() },
  }, '雷姆');
  return { ok: true, bytes: Math.floor(base64.length * 3 / 4), path: path.slice(-60) };
})()
