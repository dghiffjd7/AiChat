import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PcmStreamPlayer,
  createChatVoiceRuntime,
  createVoiceRuntimeConfigResolver,
  insertTranscriptAtSelection,
  normalizeSpeakableText,
  resolveSpeakableMessageText,
  resolveSpeechChunkMaxChars,
  selectRecorderMimeType,
  splitSpeechText,
} from '../../src/scripts/ui/chat/voice-interaction-runtime.js';

{
  const themeCss = fs.readFileSync(new URL('../../src/assets/css/theme.css', import.meta.url), 'utf8');
  const legacyCss = fs.readFileSync(new URL('../../src/assets/css/qq-legacy.css', import.meta.url), 'utf8');
  assert.match(
    themeCss,
    /body\[data-theme-mode='dark'\] \.chat-voice-input-btn\.is-recording\s*\{[^}]*color:\s*var\(--app-danger-text\)\s*!important[^}]*background:\s*var\(--app-danger-soft\)\s*!important/s,
  );
  assert.match(
    themeCss,
    /body\[data-theme-mode='dark'\] \.chat-voice-input-btn\.is-transcribing\s*\{[^}]*color:\s*var\(--app-accent-primary\)\s*!important/s,
  );
  assert.match(
    themeCss,
    /body\[data-theme-mode='dark'\] \.rp-message-action-speak\.is-active\s*\{[^}]*background:[^}]*!important/s,
  );
  assert.doesNotMatch(legacyCss, /var\(--app-danger,/);
  assert.match(legacyCss, /\.chat-voice-input-btn\.is-recording\s*\{[^}]*color:\s*var\(--app-danger-text\)[^}]*background:\s*var\(--app-danger-soft\)/s);
  console.log('ok - voice recording and playback states retain theme-aware dark-mode emphasis');
}

{
  const wrapper = { id: 'rich-wrapper' };
  let rawReads = 0;
  const text = resolveSpeakableMessageText({
    role: 'assistant',
    content: 'fallback',
    rawSource: '<div>{{raw_macro}}</div>',
    meta: { renderRich: true },
  }, {
    wrapper,
    resolvePlainText: () => {
      rawReads += 1;
      return '{{raw_macro}}';
    },
    getBubbleCopyText: nextWrapper => {
      assert.equal(nextWrapper, wrapper);
      return '画面上真正显示的文字';
    },
  });
  assert.equal(text, '画面上真正显示的文字');
  assert.equal(rawReads, 0);
  console.log('ok - rich speech prefers visible bubble text over raw HTML and macros');
}

{
  const sharedConfig = {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'key',
    model: 'gpt-4o-mini-tts',
    ttsModel: 'gpt-4o-mini-tts',
    sttModel: 'gpt-transcribe',
    ttsVoice: 'marin',
  };
  const resolver = createVoiceRuntimeConfigResolver({
    getMode: () => 'shared',
    sharedManager: { load: async () => sharedConfig },
    ttsManager: { load: async () => { throw new Error('split TTS should not load'); } },
    sttManager: { load: async () => { throw new Error('split STT should not load'); } },
  });
  assert.deepEqual(await resolver('tts'), { ...sharedConfig, model: 'gpt-4o-mini-tts' });
  assert.deepEqual(await resolver('stt'), { ...sharedConfig, model: 'gpt-transcribe' });
  console.log('ok - shared voice config resolves one credential set with capability-specific models');
}

{
  const resolver = createVoiceRuntimeConfigResolver({
    getMode: () => 'split',
    sharedManager: { load: async () => null },
    ttsManager: { load: async () => ({ provider: 'elevenlabs', model: 'eleven_flash_v2_5', ttsVoice: 'voice-id' }) },
    sttManager: { load: async () => ({ provider: 'groq', model: 'whisper-large-v3-turbo' }) },
  });
  assert.equal((await resolver('tts')).provider, 'elevenlabs');
  assert.equal((await resolver('stt')).provider, 'groq');
  console.log('ok - split voice config routes TTS and STT to independent services');
}

{
  const input = {
    value: '请帮我处理，并保存。',
    selectionStart: 3,
    selectionEnd: 5,
    dispatchEvent(event) { this.lastEvent = event.type; },
    focus() { this.focused = true; },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };
  const result = insertTranscriptAtSelection(input, '整理任务');
  assert.equal(result, '请帮我整理任务，并保存。');
  assert.equal(input.value, result);
  assert.equal(input.lastEvent, 'input');
  assert.equal(input.focused, true);
  assert.equal(input.selectionStart, 7);
  console.log('ok - STT transcript replaces the current composer selection and emits input');
}

{
  const MediaRecorderLike = {
    isTypeSupported: type => type === 'audio/webm;codecs=opus',
  };
  assert.equal(selectRecorderMimeType(MediaRecorderLike), 'audio/webm;codecs=opus');
  assert.equal(selectRecorderMimeType(null), '');
  console.log('ok - recorder format selection prefers WebM Opus and degrades safely');
}

{
  const clean = normalizeSpeakableText('<p>早安，**主人**。</p>\n```js\nalert(1)\n```\n今天也请多指教。');
  assert.equal(clean, '早安，主人。\n今天也请多指教。');
  assert.equal(
    normalizeSpeakableText('# 标题\n> 引用\n- 项目\n##无空格标题'),
    '标题\n引用\n项目\n无空格标题',
  );
  const parts = splitSpeechText('第一句。第二句！第三句？第四句。', { maxChars: 8 });
  assert.equal(parts.length > 1, true);
  assert.equal(parts.join(''), '第一句。第二句！第三句？第四句。');
  assert.equal(parts.every(part => part.length <= 8), true);
  console.log('ok - TTS text cleanup omits code and chunks long replies on sentence boundaries');
}

{
  const qwenMaxChars = resolveSpeechChunkMaxChars({ provider: 'qwen_local' });
  assert.equal(qwenMaxChars, 36);
  assert.equal(resolveSpeechChunkMaxChars({ provider: 'openai' }), 3600);
  const text = '第一段会先生成并开始播放。第二段会在后台继续生成，避免长时间完全没有反馈。第三段用于确认所有内容都被保留。';
  const parts = splitSpeechText(text, { maxChars: qwenMaxChars });
  assert.equal(parts.length > 1, true);
  assert.equal(parts.every(part => part.length <= qwenMaxChars), true);
  assert.equal(parts.join(''), text);
  console.log('ok - Qwen local TTS uses short sentence chunks without changing remote providers');
}

{
  const scheduled = [];
  class FakeAudioContext {
    constructor() {
      this.currentTime = 1;
      this.destination = {};
    }
    async resume() {}
    createBuffer(channels, length, sampleRate) {
      const channel = new Float32Array(length);
      return {
        channels,
        length,
        sampleRate,
        getChannelData: () => channel,
        channel,
      };
    }
    createBufferSource() {
      const source = {
        connect() {},
        start(at) {
          scheduled.push({ source, at, buffer: source.buffer });
          setTimeout(() => source.onended?.(), 0);
        },
        stop() {
          source.onended?.();
        },
      };
      return source;
    }
    async close() {}
  }
  const player = new PcmStreamPlayer({
    AudioContextCtor: FakeAudioContext,
    sampleRate: 8000,
    initialBufferMs: 1,
  });
  await player.start();
  const pcm = new Uint8Array(1600);
  const view = new DataView(pcm.buffer);
  view.setInt16(0, -32768, true);
  view.setInt16(2, 32767, true);
  player.push(pcm);
  await player.finish();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].buffer.sampleRate, 8000);
  assert.equal(scheduled[0].buffer.channel[0], -1);
  assert.equal(scheduled[0].buffer.channel[1] > 0.999, true);
  await player.stop();
  console.log('ok - PCM stream player decodes signed little-endian samples and schedules audio before completion');
}

{
  const listeners = new Map();
  const classes = new Set();
  const recorderButton = {
    classList: {
      toggle(name, active) { active ? classes.add(name) : classes.delete(name); },
    },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
    setAttribute(name, value) { this[name] = value; },
  };
  const composerInput = {
    value: '前文：',
    selectionStart: 3,
    selectionEnd: 3,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    dispatchEvent(event) { this.lastEvent = event.type; },
    focus() { this.focused = true; },
  };
  const track = { stopped: false, stop() { this.stopped = true; } };
  class FakeMediaRecorder {
    static isTypeSupported(type) {
      return type === 'audio/webm;codecs=opus';
    }
    constructor(stream, options = {}) {
      this.stream = stream;
      this.mimeType = options.mimeType || 'audio/webm';
      this.state = 'inactive';
    }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({
        data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }),
      });
      queueMicrotask(() => this.onstop?.());
    }
  }
  const documentLike = {
    visibilityState: 'visible',
    addEventListener() {},
    removeEventListener() {},
  };
  const windowLike = {
    addEventListener() {},
    removeEventListener() {},
  };
  const runtime = createChatVoiceRuntime({
    resolveConfig: async () => ({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-transcribe',
    }),
    voiceClient: {
      transcribe: async () => '整理今天的任务',
    },
    composerInput,
    recorderButton,
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [track] }),
    },
    MediaRecorderCtor: FakeMediaRecorder,
    documentLike,
    windowLike,
    toast: {},
  });
  assert.equal(await runtime.toggleRecording(), true);
  assert.equal(classes.has('is-recording'), true);
  assert.equal(await runtime.toggleRecording(), true);
  assert.equal(composerInput.value, '前文：整理今天的任务');
  assert.equal(composerInput.lastEvent, 'input');
  assert.equal(track.stopped, true);
  assert.equal(classes.has('is-recording'), false);
  await runtime.destroy();
  console.log('ok - recorder runtime stops tracks, transcribes audio, and inserts text into the composer');
}

{
  const order = [];
  const requested = [];
  const text = '第一段会先生成并播放。第二段会继续生成，不能等到整篇完成才把第一段交给播放器。第三段确认长回复会被切开。';
  const runtime = createChatVoiceRuntime({
    resolveConfig: async () => ({
      provider: 'qwen_local',
      baseUrl: 'http://127.0.0.1:8765/v1',
      model: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
      ttsVoice: 'Serena',
    }),
    voiceClient: {
      streamSpeech: async function* (_config, options) {
        requested.push(options.text);
        order.push(`request:${requested.length}`);
        yield new Uint8Array([0, 0]);
      },
    },
    getSpeakableText: () => text,
    playerFactory: () => ({
      async start() {},
      push() { order.push('push'); },
      async finish() {},
      async stop() {},
    }),
    documentLike: { addEventListener() {}, removeEventListener() {} },
    windowLike: { addEventListener() {}, removeEventListener() {} },
    toast: {},
  });

  assert.equal(await runtime.speak({ id: 'qwen-chunked', role: 'assistant' }), true);
  assert.equal(requested.length > 1, true);
  assert.equal(requested.join(''), text);
  assert.equal(order.indexOf('push') < order.indexOf('request:2'), true);
  await runtime.destroy();
  console.log('ok - Qwen starts playback from the first completed chunk before requesting the next chunk');
}

{
  const requested = [];
  const narrationConfig = {
    provider: 'qwen_local',
    baseUrl: 'http://127.0.0.1:8765/v1',
    model: 'qwen-tts',
    ttsVoice: 'Serena',
  };
  const dialogueConfig = {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    model: 'gpt-4o-mini-tts',
    ttsVoice: 'marin',
  };
  const runtime = createChatVoiceRuntime({
    resolveConfig: async () => narrationConfig,
    resolveSpeechConfig: async ({ voiceRefOverride }) => {
      assert.equal(voiceRefOverride, null);
      return narrationConfig;
    },
    buildSpeechSegments: async ({ text, config }) => {
      assert.equal(text, '旁白“对白”收尾');
      assert.equal(config, narrationConfig);
      return [
        { kind: 'narration', text: '旁白', config: narrationConfig },
        { kind: 'dialogue', text: '“对白”', config: dialogueConfig },
        { kind: 'narration', text: '收尾', config: narrationConfig },
      ];
    },
    voiceClient: {
      streamSpeech: async function* (config, options) {
        requested.push([config.ttsVoice, options.text]);
        yield new Uint8Array([0, 0]);
      },
    },
    getSpeakableText: () => '旁白“对白”收尾',
    playerFactory: () => ({
      async start() {},
      push() {},
      async finish() {},
      async stop() {},
    }),
    documentLike: { addEventListener() {}, removeEventListener() {} },
    windowLike: { addEventListener() {}, removeEventListener() {} },
    toast: {},
  });

  assert.equal(await runtime.speak({ id: 'dual-voice', role: 'assistant' }), true);
  assert.deepEqual(requested, [
    ['Serena', '旁白'],
    ['marin', '“对白”'],
    ['Serena', '收尾'],
  ]);
  await runtime.destroy();
  console.log('ok - creative speech streams narration and dialogue configs sequentially');
}

{
  let planningAttempts = 0;
  let requestCount = 0;
  const notices = [];
  const runtime = createChatVoiceRuntime({
    resolveConfig: async () => ({
      provider: 'qwen_local',
      baseUrl: 'http://127.0.0.1:8765/v1',
      model: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
      ttsVoice: 'Serena',
    }),
    buildSpeechSegments: async ({ config }) => {
      planningAttempts += 1;
      if (planningAttempts === 1) throw new Error('planning failed');
      return [{ kind: 'narration', text: '重试成功', config }];
    },
    voiceClient: {
      streamSpeech: async function* () {
        requestCount += 1;
        yield new Uint8Array([0, 0]);
      },
    },
    getSpeakableText: () => '分段规划失败后应能立即重试。',
    playerFactory: () => ({
      async start() {},
      push() {},
      async finish() {},
      async stop() {},
    }),
    documentLike: { addEventListener() {}, removeEventListener() {} },
    windowLike: { addEventListener() {}, removeEventListener() {} },
    toast: {
      error(message) { notices.push(message); },
    },
  });

  assert.equal(await runtime.speak({ id: 'planning-retry', role: 'assistant' }), false);
  assert.equal(await runtime.speak({ id: 'planning-retry', role: 'assistant' }), true);
  assert.equal(planningAttempts, 2);
  assert.equal(requestCount, 1);
  assert.equal(notices.length, 1);
  await runtime.destroy();
  console.log('ok - failed creative speech planning leaves no stale active playback');
}

{
  let resolveConfig;
  const configReady = new Promise(resolve => { resolveConfig = resolve; });
  let requestCount = 0;
  const runtime = createChatVoiceRuntime({
    resolveConfig: async () => configReady,
    voiceClient: {
      streamSpeech: async function* () {
        requestCount += 1;
        yield new Uint8Array([0, 0]);
      },
    },
    getSpeakableText: () => '快速重复点击不能建立两笔本地生成任务。',
    playerFactory: () => ({
      async start() {},
      push() {},
      async finish() {},
      async stop() {},
    }),
    documentLike: { addEventListener() {}, removeEventListener() {} },
    windowLike: { addEventListener() {}, removeEventListener() {} },
    toast: {},
  });

  const first = runtime.speak({ id: 'rapid-repeat', role: 'assistant' });
  const second = runtime.speak({ id: 'rapid-repeat', role: 'assistant' });
  resolveConfig({
    provider: 'qwen_local',
    baseUrl: 'http://127.0.0.1:8765/v1',
    model: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
    ttsVoice: 'Serena',
  });

  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.equal(requestCount, 1);
  await runtime.destroy();
  console.log('ok - rapid repeated speech clicks supersede pending setup without duplicate requests');
}

{
  const deferred = () => {
    let resolve;
    const promise = new Promise(next => { resolve = next; });
    return { promise, resolve };
  };
  const firstAudio = deferred();
  const finishStream = deferred();
  const wrapperClasses = new Set();
  const buttonClasses = new Set();
  const statusElements = [];
  const actionRow = {
    prepend(element) { statusElements.unshift(element); },
  };
  const speakButton = {
    classList: {
      add(...names) { names.forEach(name => buttonClasses.add(name)); },
      remove(...names) { names.forEach(name => buttonClasses.delete(name)); },
      toggle(name, active) { active ? buttonClasses.add(name) : buttonClasses.delete(name); },
    },
    setAttribute(name, value) { this[name] = value; },
    closest(selector) { return selector === '.rp-message-actions' ? actionRow : null; },
    title: '',
  };
  const wrapper = {
    dataset: {},
    classList: {
      add(...names) { names.forEach(name => wrapperClasses.add(name)); },
      remove(...names) { names.forEach(name => wrapperClasses.delete(name)); },
    },
    querySelector(selector) {
      if (selector === '[data-rp-message-action="speak"]') return speakButton;
      if (selector === '.rp-message-actions') return actionRow;
      return null;
    },
  };
  const documentLike = {
    createElement() {
      return {
        className: '',
        dataset: {},
        textContent: '',
        setAttribute(name, value) { this[name] = value; },
        remove() { this.removed = true; },
      };
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const runtime = createChatVoiceRuntime({
    resolveConfig: async () => ({
      provider: 'qwen_local',
      baseUrl: 'http://127.0.0.1:8765/v1',
      model: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
      ttsVoice: 'Serena',
    }),
    voiceClient: {
      streamSpeech: async function* () {
        await firstAudio.promise;
        yield new Uint8Array([0, 0]);
        await finishStream.promise;
      },
    },
    getSpeakableText: () => '测试朗读状态',
    playerFactory: () => ({
      async start() {},
      push() {},
      async finish() {},
      async stop() {},
    }),
    documentLike,
    windowLike: { addEventListener() {}, removeEventListener() {} },
    toast: {},
  });

  const speaking = runtime.speak({ id: 'voice-state-message', role: 'assistant' }, { wrapper });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(wrapper.dataset.voiceState, 'generating');
  assert.equal(wrapperClasses.has('is-voice-active'), true);
  assert.equal(buttonClasses.has('is-generating'), true);
  assert.equal(speakButton['aria-label'], '停止生成语音');
  assert.equal(statusElements[0]?.textContent, '生成语音中…');

  firstAudio.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(wrapper.dataset.voiceState, 'playing');
  assert.equal(buttonClasses.has('is-generating'), false);
  assert.equal(buttonClasses.has('is-playing'), true);
  assert.equal(speakButton['aria-label'], '停止朗读');
  assert.equal(statusElements[0]?.textContent, '播放中…');

  finishStream.resolve();
  assert.equal(await speaking, true);
  assert.equal(wrapperClasses.has('is-voice-active'), false);
  assert.equal('voiceState' in wrapper.dataset, false);
  assert.equal(speakButton['aria-label'], '朗读');
  assert.equal(statusElements[0]?.removed, true);
  await runtime.destroy();
  console.log('ok - TTS exposes generating and playing states until speech completes');
}
