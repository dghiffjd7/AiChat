import assert from 'node:assert/strict';

import { createImageDirectorAgent } from '../../src/scripts/agent/image-director-agent.js';
import { createAgentTaskRuntime } from '../../src/scripts/agent/agent-task-runtime.js';
import { AgentRunStore } from '../../src/scripts/storage/agent-run-store.js';

{
  const runtime = createAgentTaskRuntime({
    store: new AgentRunStore(),
    logger: { warn: () => {} },
  });
  const agent = createImageDirectorAgent({
    agentTaskRuntime: runtime,
    mediaGenerationService: {
      generateImage: async () => ({ status: 'succeeded' }),
    },
  });
  const result = await agent.runImageGeneration({ config: { provider: 'openai' } });
  assert.deepEqual(result, {
    status: 'skipped',
    skipped: true,
    reason: 'missing_prompt',
  });
  assert.equal(runtime.listRuns({ kind: 'image_director_generation' }).length, 0);
  console.log('ok - ImageDirectorAgent skips empty image prompts without recording a run');
}

{
  const calls = [];
  const runtime = createAgentTaskRuntime({
    store: new AgentRunStore(),
    logger: { warn: () => {} },
    now: () => 1000,
  });
  const agent = createImageDirectorAgent({
    agentTaskRuntime: runtime,
    mediaGenerationService: {
      generateImage: async (request) => {
        calls.push(request);
        return {
          id: 'image-1',
          provider: request.config.provider,
          model: request.config.model,
          output: { path: 'generated.png' },
          status: 'succeeded',
        };
      },
    },
    getCurrentSessionId: () => 's1',
  });
  const result = await agent.runImageGeneration({
    prompt: 'paint a quiet desk',
    config: { provider: 'openai', model: 'gpt-image-1' },
    options: { size: '1024x1024', referenceImages: [{ id: 'ref-1' }] },
  });
  const run = runtime.listRuns({ kind: 'image_director_generation' })[0];
  assert.equal(result.status, 'succeeded');
  assert.equal(result.output.path, 'generated.png');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentTask, false);
  assert.equal(calls[0].sessionId, 's1');
  assert.equal(run.status, 'succeeded');
  assert.equal(run.metadata.referenceImageCount, 1);
  assert.deepEqual(run.steps.map(step => step.type), [
    'image_director.prepare_request',
    'image_director.generate',
  ]);
  console.log('ok - ImageDirectorAgent records image generation through agent runtime');
}

{
  const runtime = createAgentTaskRuntime({
    store: new AgentRunStore(),
    logger: { warn: () => {} },
  });
  const agent = createImageDirectorAgent({
    agentTaskRuntime: runtime,
    mediaGenerationService: {
      generateImage: async () => {
        throw new Error('provider unavailable');
      },
    },
    logger: { debug: () => {} },
  });
  await assert.rejects(
    () => agent.runImageGeneration({
      prompt: 'test image',
      config: { provider: 'openai', model: 'gpt-image-1' },
    }),
    /provider unavailable/,
  );
  const run = runtime.listRuns({ kind: 'image_director_generation' })[0];
  assert.equal(run.status, 'failed');
  assert.equal(run.steps[1].status, 'failed');
  assert.equal(run.steps[1].errorMessage, 'provider unavailable');
  console.log('ok - ImageDirectorAgent records failed image generation steps');
}
