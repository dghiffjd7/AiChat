(async () => {
  const bridge = window.appBridge;
  const config = bridge?.config?.get?.() || {};
  const base = {
    provider: String(config.provider || ''),
    model: String(config.model || ''),
    stream: Boolean(config.stream),
  };
  if (!bridge?.client?.streamChat || !bridge?.backgroundChat) {
    return { ok: false, reason: 'chat_client_runtime_missing', base };
  }

  const nonStream = {
    ok: false,
    response: '',
    error: '',
  };
  try {
    const response = await bridge.backgroundChat([
      { role: 'user', content: 'Reply with exactly: V4F_NONSTREAM_OK' },
    ], {
      presetContext: { sessionId: '娜美', uiMode: 'chat' },
      max_tokens: 128,
      reasoning_effort: 'low',
    });
    nonStream.ok = true;
    nonStream.response = String(response || '').slice(0, 1000);
  } catch (error) {
    nonStream.error = String(error?.message || error || '');
  }

  const streamProbe = {
    ok: false,
    content: '',
    reasoningLength: 0,
    chunkCount: 0,
    chunkShapes: [],
    error: '',
  };
  try {
    const stream = bridge.client.streamChat([
      { role: 'user', content: 'Reply with exactly: V4F_STREAM_OK' },
    ], {
      max_tokens: 128,
      reasoning_effort: 'low',
    });
    for await (const chunk of stream) {
      streamProbe.chunkCount += 1;
      if (typeof chunk === 'string') {
        streamProbe.content += chunk;
        if (streamProbe.chunkShapes.length < 8) streamProbe.chunkShapes.push('string');
        continue;
      }
      const kind = String(chunk?.type || chunk?.kind || '');
      const reasoning = String(chunk?.reasoning || chunk?.reasoning_content || chunk?.content || '');
      if (/reason/i.test(kind)) streamProbe.reasoningLength += reasoning.length;
      if (streamProbe.chunkShapes.length < 8) {
        streamProbe.chunkShapes.push({
          kind,
          keys: Object.keys(chunk || {}).sort(),
          textLength: reasoning.length,
        });
      }
    }
    streamProbe.ok = true;
    streamProbe.content = streamProbe.content.slice(0, 1000);
  } catch (error) {
    streamProbe.error = String(error?.message || error || '');
  }

  return {
    ok: nonStream.ok && streamProbe.ok,
    base,
    nonStream,
    streamProbe,
  };
})()
