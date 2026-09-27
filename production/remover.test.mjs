// Copyright (c) 2026 Juanma Gomez. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Take-Studio-Proprietary
// See LICENSE and LICENSING.md; prior MIT grants are preserved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundRemover } from '../media.js';

function harness(t, { gpuFails = false, holdFrames = false } = {}) {
  const workers = [], originalWorker = globalThis.Worker, originalBitmap = globalThis.createImageBitmap;
  const bitmap = () => ({ width: 640, height: 360, closed: false, close() { this.closed = true; } });
  globalThis.createImageBitmap = async () => bitmap();
  globalThis.Worker = class {
    constructor() { this.messages = []; this.terminated = false; workers.push(this); }
    terminate() { this.terminated = true; }
    postMessage(data) {
      this.messages.push(data);
      if (holdFrames && data.bitmap) return;
      queueMicrotask(() => {
        if (this.terminated) return;
        if (gpuFails && data.settings.maskQuality !== 'fast' && !data.forceCPU)
          this.onmessage({ data: { id: data.id, error: 'WebGL unavailable', gpuUnavailable: true } });
        else this.onmessage({ data: { id: data.id, ready: !data.bitmap,
          foreground: data.bitmap ? bitmap() : undefined,
          quality: data.settings.maskQuality || 'portrait',
          backend: data.forceCPU || data.settings.maskQuality === 'fast' ? 'CPU' : 'GPU' } });
      });
    }
  };
  const remover = new BackgroundRemover();
  t.after(() => {
    remover.close();
    if (originalWorker === undefined) delete globalThis.Worker; else globalThis.Worker = originalWorker;
    if (originalBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = originalBitmap;
  });
  return { remover, workers, bitmap };
}

test('model changes use fresh workers, while cleanup changes reuse the initialized model', async t => {
  const { remover, workers } = harness(t), source = { width: 1280, height: 720 };
  for (const settings of [{ maskQuality: 'portrait' }, { maskQuality: 'portrait', maskCleanup: 80 }, { maskQuality: 'fast' }, { maskQuality: 'portrait' }])
    (await remover.process(source, settings)).close();
  assert.equal(workers.length, 3);
  assert.equal(workers[0].terminated, true);
  assert.equal(workers[1].terminated, true);
  assert.equal(workers[2].terminated, false);
  assert.equal(workers[0].messages.filter(m => !m.bitmap).length, 1);
  assert.equal(remover.quality, 'portrait');
});
test('failed GPU initialization retries the same portrait model on CPU in a fresh worker', async t => {
  const { remover, workers } = harness(t, { gpuFails: true });
  (await remover.process({ width: 640, height: 480 }, { maskQuality: 'portrait' })).close();
  assert.equal(workers.length, 2);
  assert.equal(workers[0].terminated, true);
  assert.equal(remover.backend, 'CPU');
  assert.equal(remover.quality, 'portrait');
  assert.equal(workers[1].messages.every(m => m.forceCPU), true);
  await remover.ready({ maskQuality: 'portrait' });
  assert.equal(workers.length, 2);
});
test('switching model rejects pending old frames and releases late results', async t => {
  const { remover, workers, bitmap } = harness(t, { holdFrames: true });
  await remover.ready({ maskQuality: 'portrait' });
  const pending = remover.request(bitmap(), { maskQuality: 'portrait' });
  const rejected = assert.rejects(pending, /Background removal stopped/);
  const old = workers[0], frameMessage = old.messages.at(-1);
  await remover.ready({ maskQuality: 'fast' });
  await rejected;
  const late = bitmap();
  old.onmessage({ data: { id: frameMessage.id, foreground: late } });
  assert.equal(late.closed, true);
});
