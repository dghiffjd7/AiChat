import assert from 'node:assert/strict';

globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = () => 0;
const { __chatStoreStorageInternals: storage } = await import('../../src/scripts/storage/chat-store.js');
globalThis.setTimeout = realSetTimeout;

{
  const content = `<div>${'x'.repeat(storage.MAX_PERSIST_FIELD_INLINE_CHARS + 25_000)}</div>`;
  const rawSource = `<thinking>${'source '.repeat(1000)}</thinking><p>body</p>`;
  const out = storage.sanitizeMessageForPersist(
    {
      id: 'm-rich',
      role: 'assistant',
      content,
      raw: rawSource,
      rawSource,
      meta: { renderRich: true },
    },
    { preserveLargeFields: true },
  );

  assert.equal(out.rawSource, rawSource);
  assert.equal(out.raw, rawSource);
  assert.ok(out.content.length <= storage.PERSIST_FIELD_PREVIEW_CHARS + 1);
  assert.equal(out.meta.contentPersistMode, 'derived-preview');
  assert.equal(out.meta.contentOriginalLength, content.length);
}

{
  const content = 'a'.repeat(storage.MAX_PERSIST_FIELD_INLINE_CHARS + 100);
  const out = storage.sanitizeMessageForPersist({ id: 'm-local', role: 'assistant', content });
  assert.equal(out.content.length, storage.MAX_PERSIST_FIELD_INLINE_CHARS + 1);
}

{
  const content = 'b'.repeat(storage.MAX_PERSIST_FIELD_INLINE_CHARS + 100);
  const out = storage.sanitizeMessageForPersist(
    { id: 'm-v2', role: 'assistant', content },
    { preserveLargeFields: true },
  );
  assert.equal(out.content.length, content.length);
}

{
  const text = 'c'.repeat(storage.V2_SIDECAR_FIELD_CHUNK_CHARS * 2 + 17);
  const chunks = storage.splitPersistFieldChunks(text);
  assert.deepEqual(chunks.map(item => item.length), [
    storage.V2_SIDECAR_FIELD_CHUNK_CHARS,
    storage.V2_SIDECAR_FIELD_CHUNK_CHARS,
    17,
  ]);
  assert.equal(chunks.join(''), text);
}

console.log('chat-store-large-field-tests passed');
