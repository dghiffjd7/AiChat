import assert from 'node:assert/strict';

import { OpenAiRealtimeSessionClient } from '../../src/scripts/ui/realtime/openai-realtime-session-client.js';

class FakeDataChannel {
  constructor() {
    this.readyState = 'connecting';
    this.sent = [];
    this.listeners = new Map();
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }

  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }

  emit(type, event = {}) {
    this.listeners.get(type)?.forEach(callback => callback(event));
  }

  open() {
    this.readyState = 'open';
    this.emit('open');
  }

  send(payload) { this.sent.push(payload); }
  close() { this.readyState = 'closed'; }
}

class FakePeerConnection {
  constructor() {
    this.connectionState = 'new';
    this.channel = new FakeDataChannel();
    this.tracks = [];
    FakePeerConnection.instance = this;
  }

  createDataChannel(label) {
    assert.equal(label, 'oai-events');
    return this.channel;
  }

  addTrack(track, stream) { this.tracks.push({ track, stream }); }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=fake-offer\r\n' }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) {
    this.remoteDescription = value;
    queueMicrotask(() => this.channel.open());
  }
  close() { this.connectionState = 'closed'; }
}

const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
const audioElement = {
  autoplay: false,
  muted: false,
  srcObject: null,
  async play() { this.played = true; },
  remove() { this.removed = true; },
};
const events = [];
const connectionStates = [];
const calls = [];
const client = new OpenAiRealtimeSessionClient({
  invoke: async (command, args) => {
    calls.push({ command, args });
    return 'v=0\r\no=fake-answer';
  },
  peerConnectionClass: FakePeerConnection,
  mediaDevices: { getUserMedia: async () => stream },
  createAudioElement: () => audioElement,
  onEvent: event => events.push(event),
  onConnectionState: state => connectionStates.push(state),
});

await client.connect({
  config: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-secret' },
  sessionConfig: { type: 'realtime', model: 'gpt-realtime-2.1' },
});
assert.equal(calls.length, 1);
assert.equal(calls[0].command, 'openai_realtime_create_call');
assert.equal(calls[0].args.sdp, 'v=0\r\no=fake-offer\r\n');
assert.equal(JSON.parse(calls[0].args.sessionJson).model, 'gpt-realtime-2.1');
assert.match(calls[0].args.requestId, /^openai_realtime_/);
assert.equal(FakePeerConnection.instance.remoteDescription.type, 'answer');
assert.equal(audioElement.autoplay, true);
FakePeerConnection.instance.ontrack({ streams: [{ id: 'remote-stream' }] });
assert.equal(audioElement.srcObject.id, 'remote-stream');
assert.equal(audioElement.played, true);

FakePeerConnection.instance.channel.emit('message', {
  data: JSON.stringify({ type: 'session.created', session: { id: 'sess_1' } }),
});
assert.equal(events[0].type, 'session.created');
FakePeerConnection.instance.channel.emit('message', { data: '{invalid-json' });
FakePeerConnection.instance.channel.emit('message', { data: JSON.stringify({ type: 'response.done' }) });
assert.deepEqual(events.map(event => event.type), ['session.created', 'response.done']);
FakePeerConnection.instance.connectionState = 'disconnected';
FakePeerConnection.instance.onconnectionstatechange();
assert.deepEqual(connectionStates, ['disconnected']);

client.sendEvent({ type: 'response.create' });
assert.equal(JSON.parse(FakePeerConnection.instance.channel.sent[0]).type, 'response.create');
assert.equal(client.setMicrophoneMuted(true), true);
assert.equal(track.enabled, false);
assert.equal(client.setOutputMuted(true), true);
assert.equal(audioElement.muted, true);

await client.close();
assert.equal(track.stopped, true);
assert.equal(FakePeerConnection.instance.connectionState, 'closed');
assert.equal(audioElement.srcObject, null);

{
  let brokerStarted;
  const brokerStartedPromise = new Promise(resolve => { brokerStarted = resolve; });
  const cancelCalls = [];
  const cancelTrack = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const cancelClient = new OpenAiRealtimeSessionClient({
    invoke: (command, args) => {
      cancelCalls.push({ command, args });
      if (command === 'openai_realtime_create_call') {
        brokerStarted();
        return new Promise(() => {});
      }
      return Promise.resolve(true);
    },
    peerConnectionClass: FakePeerConnection,
    mediaDevices: {
      getUserMedia: async () => ({
        getAudioTracks: () => [cancelTrack],
        getTracks: () => [cancelTrack],
      }),
    },
    createAudioElement: () => ({
      style: {},
      async play() {},
      remove() {},
      srcObject: null,
    }),
  });
  const controller = new AbortController();
  const pendingConnect = cancelClient.connect({
    config: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-secret' },
    sessionConfig: { type: 'realtime', model: 'gpt-realtime-2.1' },
    signal: controller.signal,
  });
  await brokerStartedPromise;
  controller.abort();
  const outcome = await Promise.race([
    pendingConnect.then(() => 'connected', error => error?.name),
    new Promise(resolve => setTimeout(() => resolve('still-pending'), 100)),
  ]);
  assert.equal(outcome, 'AbortError');
  assert.equal(cancelCalls[1].command, 'http_abort_request');
  assert.equal(cancelCalls[1].args.requestId, cancelCalls[0].args.requestId);
  assert.equal(cancelTrack.stopped, true);
}

console.log('openai realtime session client tests passed');
