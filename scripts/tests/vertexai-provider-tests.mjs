import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { VertexAIProvider } from '../../src/scripts/api/providers/vertexai.js';

const originalInvoke = globalThis.__TAURI_INVOKE__;

const createServiceAccountProvider = () => {
  const provider = new VertexAIProvider({
    model: 'gemini-2.5-flash',
    vertexaiAuthMode: 'service_account',
    vertexaiRegion: 'global',
    vertexaiServiceAccount: JSON.stringify({
      project_id: 'vertex-project',
      client_email: 'vertex@example.com',
      private_key: 'unused-in-test',
    }),
  });
  provider.getAccessToken = async () => 'test-token';
  return provider;
};

try {
  {
    const requests = [];
    globalThis.__TAURI_INVOKE__ = async (_command, args) => {
      requests.push(args);
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          publisherModels: [
            { name: 'publishers/google/models/gemini-3.5-flash' },
            { name: 'publishers/google/models/gemini-2.5-pro' },
          ],
        }),
        headers: {},
      };
    };

    const models = await createServiceAccountProvider().listModels();
    assert.deepEqual(models, ['gemini-3.5-flash', 'gemini-2.5-pro']);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /^https:\/\/aiplatform\.googleapis\.com\/v1beta1\/publishers\/google\/models\?/);
    assert.doesNotMatch(requests[0].url, /projects\/vertex-project|locations\/global/);
    assert.equal(new URL(requests[0].url).searchParams.get('pageSize'), '300');
    assert.equal(requests[0].headers.Authorization, 'Bearer test-token');
  }

  {
    let requestArgs = null;
    globalThis.__TAURI_INVOKE__ = async (_command, args) => {
      requestArgs = args;
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] } }],
        }),
        headers: {},
      };
    };

    const provider = new VertexAIProvider({
      apiKey: 'vertex-express-key',
      model: 'gemini-2.5-flash',
      vertexaiAuthMode: 'express',
      vertexaiRegion: 'us-central1',
    });
    assert.equal(await provider.chat([{ role: 'user', content: 'hello' }]), 'ok');
    assert.equal(
      requestArgs.url,
      'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent',
    );
    assert.equal(requestArgs.headers['x-goog-api-key'], 'vertex-express-key');
    assert.equal(Object.prototype.hasOwnProperty.call(requestArgs.headers, 'Authorization'), false);
  }

  {
    globalThis.__TAURI_INVOKE__ = async () => ({
      ok: false,
      status: 403,
      body: JSON.stringify({ error: { message: 'permission denied' } }),
      headers: {},
    });
    const provider = createServiceAccountProvider();
    await assert.rejects(
      () => provider.listModels(),
      (error) => {
        assert.match(error.message, /403.*permission denied/);
        assert.ok(Array.isArray(error.fallbackModels));
        assert.ok(error.fallbackModels.includes('gemini-3.5-flash'));
        assert.equal(error.fallbackModels.includes('gemini-1.0-pro'), false);
        return true;
      },
    );
  }

  {
    let requestCount = 0;
    globalThis.__TAURI_INVOKE__ = async () => {
      requestCount += 1;
      throw new Error('Express mode must not call the unsupported model-list endpoint');
    };
    const provider = new VertexAIProvider({
      apiKey: 'vertex-express-key',
      vertexaiAuthMode: 'express',
    });
    await assert.rejects(
      () => provider.listModels(),
      (error) => {
        assert.match(error.message, /Express.*模型目录/);
        assert.ok(error.fallbackModels.includes('gemini-3.5-flash'));
        return true;
      },
    );
    assert.equal(requestCount, 0);
  }

  {
    const commands = [];
    let readCount = 0;
    globalThis.__TAURI_INVOKE__ = async (command, args) => {
      commands.push({ command, args });
      if (command === 'http_stream_request_start') return true;
      if (command === 'http_stream_request_read') {
        readCount += 1;
        if (readCount === 1) {
          return {
            ok: true,
            status: 200,
            chunks: ['data: {"candidates":[{"content":{"parts":[{"text":"first"}]}}]}\n\n'],
            done: false,
            error: null,
          };
        }
        return {
          ok: true,
          status: 200,
          chunks: ['data: {"candidates":[{"content":{"parts":[{"text":"second"}]}}]}\n\n'],
          done: true,
          error: null,
        };
      }
      if (command === 'http_stream_request_close') return true;
      throw new Error(`Unexpected command: ${command}`);
    };

    const iterator = createServiceAccountProvider().streamChat([
      { role: 'user', content: 'hello' },
    ]);
    assert.deepEqual(await iterator.next(), { value: 'first', done: false });
    assert.equal(readCount, 1, 'first delta must be yielded before the next native read');
    assert.deepEqual(await iterator.next(), { value: 'second', done: false });
    assert.deepEqual(await iterator.next(), { value: undefined, done: true });
    await Promise.resolve();
    assert.deepEqual(commands.map(item => item.command), [
      'http_stream_request_start',
      'http_stream_request_read',
      'http_stream_request_read',
      'http_stream_request_close',
    ]);
    assert.equal(commands.some(item => item.command === 'http_request'), false);
  }

  {
    const panelSource = await readFile(new URL('../../src/scripts/ui/config-panel.js', import.meta.url), 'utf8');
    assert.match(panelSource, /id="config-vertex-auth-mode"/);
    assert.match(panelSource, /option value="global"/);
    assert.match(panelSource, /vertexaiAuthMode/);
    assert.match(panelSource, /model: isImage \? 'gemini-3\.1-flash-image' : 'gemini-3\.5-flash'/);
    assert.match(panelSource, /'gemini-3\.1-flash-lite-image'/);
    assert.doesNotMatch(panelSource, /saInput\.dataset\.originalKey\s*=\s*config\.vertexaiServiceAccount/);
    assert.doesNotMatch(panelSource, /imagen-4\.0-generate-preview-06-06/);
    assert.doesNotMatch(panelSource, /imagen-4\.0-(?:generate|fast-generate|ultra-generate)-001/);
  }

  console.log('vertexai-provider-tests passed');
} finally {
  if (originalInvoke === undefined) delete globalThis.__TAURI_INVOKE__;
  else globalThis.__TAURI_INVOKE__ = originalInvoke;
}
