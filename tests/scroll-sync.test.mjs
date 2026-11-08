import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorScrollSync } from '../web/scroll-sync.js';

function pane() {
  const target = new EventTarget();
  return Object.assign(target, {
    scrollTop: 0, scrollLeft: 0, scrollHeight: 3000, clientHeight: 500,
    selectionStart: 120, selectionEnd: 120,
  });
}
function emit(target, type) { target.dispatchEvent(new Event(type)); }
function setup() {
  const source = pane(), preview = pane();
  const positions = { source: [12, 210, 1200], preview: [12, 370, 1900] };
  const state = { enabled: true };
  const sync = createEditorScrollSync({ source, preview, getPositions: () => positions, enabled: () => state.enabled });
  return { source, preview, positions, state, sync };
}

test('repeated code-preview rebuilds and delayed scroll events do not move the editor', () => {
  const { source, preview, positions, sync } = setup();
  source.scrollTop = 450; source.scrollLeft = 21;
  for (let i = 0; i < 100; i++) {
    emit(source, 'input');
    sync.updatePreview(() => {
      positions.preview[2] += 3;
      preview.scrollTop = 0; // DOM replacement/scroll clamping.
      emit(preview, 'scroll');
    });
    emit(preview, 'scroll'); // Browser dispatch after the render/frame.
    emit(source, 'scroll');
    emit(preview, 'scroll');
    assert.equal(source.scrollTop, 450, `input ${i}`);
    assert.equal(source.scrollLeft, 21);
    assert.equal(source.selectionStart, 120);
    assert.equal(source.selectionEnd, 120);
  }
});

test('actual preview wheel scrolling still moves source, without an echo', () => {
  const { source, preview, sync } = setup();
  emit(preview, 'wheel'); preview.scrollTop = 700; emit(preview, 'scroll');
  assert.ok(source.scrollTop > 0);
  const previewTop = preview.scrollTop;
  emit(source, 'scroll');
  assert.equal(preview.scrollTop, previewTop);
  const sourceTop = source.scrollTop;
  sync.updatePreview(() => { preview.scrollTop = 0; });
  emit(preview, 'scroll');
  assert.equal(source.scrollTop, sourceTop);
  // A new user gesture can take control immediately, without a timer.
  emit(preview, 'wheel'); preview.scrollTop = 1000; emit(preview, 'scroll');
  assert.notEqual(source.scrollTop, sourceTop);
});

test('typing takes control back after preview scrolling and protects caret auto-scroll', () => {
  const { source, preview, sync } = setup();
  emit(preview, 'wheel'); preview.scrollTop = 600; emit(preview, 'scroll');
  emit(source, 'beforeinput');
  source.scrollTop = 800; emit(source, 'scroll'); // Caret brought into view.
  const expected = source.scrollTop;
  sync.updatePreview(() => { preview.scrollTop = 0; });
  emit(preview, 'scroll');
  assert.equal(source.scrollTop, expected);
  assert.ok(preview.scrollTop > 0);
});

test('keyboard/touch navigation can drive sync and disabled sync changes neither pane', () => {
  const { source, preview, sync, state } = setup();
  emit(source, 'keydown'); source.scrollTop = 400; emit(source, 'scroll');
  assert.ok(preview.scrollTop > 0);
  emit(preview, 'touchmove'); preview.scrollTop = 900; emit(preview, 'scroll');
  assert.ok(source.scrollTop > 400);
  state.enabled = false;
  const previous = source.scrollTop;
  emit(preview, 'wheel'); preview.scrollTop = 1200; emit(preview, 'scroll');
  assert.equal(source.scrollTop, previous);
  sync.updatePreview(() => { preview.scrollTop = 0; });
  assert.equal(preview.scrollTop, 1200);
});

test('empty or temporarily mismatched maps do not reset either viewport', () => {
  const { source, preview, positions, sync } = setup();
  positions.preview = [];
  source.scrollTop = 200; preview.scrollTop = 300;
  emit(source, 'wheel'); emit(source, 'scroll');
  assert.equal(preview.scrollTop, 300);
  sync.updatePreview(() => { preview.scrollTop = 0; });
  assert.equal(source.scrollTop, 200);
  assert.equal(preview.scrollTop, 300);
});
