// Copyright (c) 2026 Juanma Gomez. All rights reserved.
// SPDX-License-Identifier: LicenseRef-Take-Studio-Proprietary
// See LICENSE and LICENSING.md; prior MIT grants are preserved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { maskOptions, personAlpha } from '../portrait-mask.js';

test('existing projects receive portrait cleanup without modifying saved settings', () => {
  const old = { background: 'remove', cameraId: 'iphone' };
  assert.deepEqual(maskOptions(old), { quality: 'portrait', cleanup: 60 });
  assert.deepEqual(old, { background: 'remove', cameraId: 'iphone' });
});
test('fast mode is explicit and cleanup values are bounded', () => {
  assert.deepEqual(maskOptions({ maskQuality: 'fast', maskCleanup: -30 }), { quality: 'fast', cleanup: 0 });
  assert.equal(maskOptions({ maskCleanup: 900 }).cleanup, 100);
  assert.equal(maskOptions({ maskCleanup: 'invalid' }).cleanup, 60);
});
test('cleanup excludes uncertain chair pixels but retains confident person pixels', () => {
  assert.equal(personAlpha(0.5), 0);
  assert.equal(personAlpha(0.95), 255);
  assert.equal(personAlpha(1, 100), 255);
  assert.equal(personAlpha(0, 0), 0);
});
test('soft edges are monotonic and stronger cleanup never restores background', () => {
  for (let c = 0; c <= 100; c++) {
    const value = c / 100;
    assert.ok(personAlpha(value, 90) <= personAlpha(value, 60));
    assert.ok(personAlpha(value, 60) <= personAlpha(value, 20));
    if (c) assert.ok(personAlpha(value) >= personAlpha((c - 1) / 100));
  }
  assert.ok(personAlpha(0.7) > 0 && personAlpha(0.7) < 255);
});
test('invalid confidence cannot create opaque artifacts', () => {
  assert.equal(personAlpha(NaN), 0);
  assert.equal(personAlpha(Infinity), 0);
  assert.equal(personAlpha(-1), 0);
});
