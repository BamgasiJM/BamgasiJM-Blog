// Scroll events do not identify whether they came from a user, a DOM update,
// browser anchoring, or our own scrollTop writes. Only explicit user intent
// may make a pane drive its counterpart; programmatic movement never does.
export function createEditorScrollSync({ source, preview, getPositions, enabled = () => true }) {
  const panes = { source, preview };
  let active = 'source';
  const suppressed = new Set();
  const cleanups = [];
  function listen(element, type, callback, options) {
    element.addEventListener(type, callback, options);
    cleanups.push(() => element.removeEventListener(type, callback, options));
  }
  function claim(origin) {
    active = origin;
    suppressed.delete(origin);
  }
  function synchronize(origin) {
    if (!enabled() || active !== origin || suppressed.has(origin)) return;
    const positions = getPositions();
    const target = origin === 'source' ? 'preview' : 'source';
    const from = panes[origin], to = panes[target];
    const fromPositions = positions[origin], toPositions = positions[target];
    if (!fromPositions.length || fromPositions.length !== toPositions.length) return;
    const offset = 26;
    let index = 0;
    for (let i = 0; i < fromPositions.length; i++) {
      if (fromPositions[i] <= from.scrollTop + offset) index = i;
    }
    const nextFrom = fromPositions[index + 1] ?? from.scrollHeight;
    const nextTo = toPositions[index + 1] ?? to.scrollHeight;
    const ratio = Math.max(0, Math.min(1, (from.scrollTop + offset - fromPositions[index]) / Math.max(1, nextFrom - fromPositions[index])));
    const desired = Math.max(0, Math.min(Math.max(0, to.scrollHeight - to.clientHeight), toPositions[index] + ratio * (nextTo - toPositions[index]) - offset));
    if (!Number.isFinite(desired) || Math.abs(to.scrollTop - desired) < 1) return;
    // This remains suppressed until another user gesture, even when the
    // browser queues the resulting scroll event after the current frame.
    suppressed.add(target);
    to.scrollTop = desired;
  }
  for (const [origin, pane] of Object.entries(panes)) {
    for (const type of ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown']) {
      listen(pane, type, () => claim(origin), { passive: true });
    }
    listen(pane, 'pointermove', event => { if (event.buttons) claim(origin); }, { passive: true });
    listen(pane, 'scroll', () => synchronize(origin), { passive: true });
  }
  listen(source, 'beforeinput', () => claim('source'));
  listen(source, 'input', () => claim('source'));
  return {
    updatePreview(render) {
      const top = preview.scrollTop, left = preview.scrollLeft;
      // Replacing preview nodes may clamp scrollTop or trigger anchoring.
      // Preserve its viewport and never let those events move the editor.
      suppressed.add('preview');
      try { render(); }
      finally {
        preview.scrollTop = top;
        preview.scrollLeft = left;
      }
      if (active === 'source') synchronize('source');
    },
    destroy() { cleanups.forEach(cleanup => cleanup()); },
  };
}
