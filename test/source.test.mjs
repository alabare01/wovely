import { test } from 'node:test';
import assert from 'node:assert/strict';

// utils/source.js runs in the browser; give it the two globals it touches.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { location: { search: '' } };
const { captureSource, getSource } = await import('../src/utils/source.js');

test('a ?s= channel is kept, lowercased, and first touch wins', () => {
  store.clear();
  assert.equal(captureSource('?s=Facebook&x=1'), 'facebook');
  assert.equal(getSource(), 'facebook');
  assert.equal(captureSource('?s=reddit'), 'facebook');
});

test('utm_source is accepted when s is absent', () => {
  store.clear();
  assert.equal(captureSource('?utm_source=newsletter'), 'newsletter');
});

test('junk is refused and nothing is stored', () => {
  store.clear();
  assert.equal(captureSource('?s=<script>'), null);
  assert.equal(captureSource('?s=' + 'a'.repeat(41)), null);
  assert.equal(captureSource(''), null);
  assert.equal(store.size, 0);
});
