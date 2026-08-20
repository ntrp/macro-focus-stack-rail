import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDistance, parseStatus } from './rail.js';

test('validates rail input and status messages', () => {
  assert.equal(parseDistance('0,125'), 0.125);
  assert.throws(() => parseDistance('51'), /50 mm/);
  assert.deepEqual(parseStatus('{"state":"idle","pos_mm":1.25,"homed":true,"error":""}'), {
    state: 'idle', pos_mm: 1.25, homed: true, error: ''
  });
  assert.throws(() => parseStatus('{"state":"idle"}'), /invalid status/);
});
