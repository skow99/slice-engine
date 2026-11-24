/* Input (after Slice Drive's input.js): keyboard, touch buttons and gamepad
 * merged into named ACTIONS, so the game never asks about keys.
 *
 *   Input.attach(window, {keys: {...}})   once, at start (keys optional)
 *   Input.attachTouch(element)            on-screen buttons: <button data-action="left">
 *   Input.update()                        once per frame, before reading
 *   Input.held('fire')                    true while held
 *   Input.pressed('jump')                 true on the frame it went down
 *   Input.axis('left', 'right')           -1..1 (keys, d-pad, stick)
 *   Input.stick()                         {x, y}, each -1..1
 *   Input.takeActions()                   presses since last asked, in order (menus)
 *
 * Gamepad: the standard mapping. Stick and d-pad drive up/down/left/right,
 * A = 'a' and 'confirm', B = 'b' and 'back', X = 'x', Y = 'y', Start = 'pause',
 * triggers = 'rt' / 'lt' (also analog: Input.analog('rt')).
 */
export const DEFAULT_KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  a: ['Space', 'KeyZ', 'KeyJ'], b: ['KeyX', 'ShiftLeft', 'ShiftRight', 'KeyK'], x: ['KeyC', 'KeyL'], y: ['KeyV', 'KeyI'],
  confirm: ['Enter', 'NumpadEnter', 'Space'], back: ['Escape', 'Backspace'], pause: ['KeyP', 'Escape'],
  mute: ['KeyM'], fullscreen: ['KeyF'],
};
// Menu navigation may auto-repeat when a key is held; everything else fires once per press.
const REPEATS = new Set(['up', 'down', 'left', 'right']);
const PAD_BUTTONS = {0: ['a', 'confirm'], 1: ['b', 'back'], 2: ['x'], 3: ['y'], 9: ['pause'], 12: ['up'], 13: ['down'], 14: ['left'], 15: ['right'], 6: ['lt'], 7: ['rt']};

let keys = DEFAULT_KEYS, byCode = new Map();
const heldCodes = new Set(), touchHeld = new Map(), queue = [];
const pad = {held: new Set(), analog: {}, x: 0, y: 0, connected: false};
let now = new Set(), before = new Set(), downThisFrame = new Set();
let onFirstInput = null;

function index() {
  byCode = new Map();
  for (const [action, codes] of Object.entries(keys)) for (const code of codes) {
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(action);
  }
}
index();
function wake() { if (onFirstInput) { const callback = onFirstInput; onFirstInput = null; callback(); } }

/* keys: {action: [KeyboardEvent.code, ...]} replaces the defaults
 * (spread DEFAULT_KEYS into it to extend them). onFirstInput: called once,
 * on the first key, tap or button (unlock the sound there). */
export function attach(target = globalThis.window, options = {}) {
  if (options.keys) setKeys(options.keys);
  onFirstInput = options.onFirstInput || null;
  target.addEventListener('keydown', event => {
    if (event.target && event.target.matches && event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const actions = byCode.get(event.code);
    if (!actions) return;
    if (event.preventDefault) event.preventDefault();
    wake();
    heldCodes.add(event.code);
    for (const action of actions) {
      if (!event.repeat || REPEATS.has(action)) queue.push(action);
      if (!event.repeat) downThisFrame.add(action);
    }
  });
  target.addEventListener('keyup', event => heldCodes.delete(event.code));
  target.addEventListener('blur', () => heldCodes.clear());
}
export function setKeys(next) { keys = next; index(); }

/* On-screen buttons: any element with data-action="left" (several actions:
 * data-action="a confirm") inside the container. Each finger holds whatever
 * button is under it and may slide to another without lifting. */
const fingers = new Map();
function actionsOf(button) { return button.dataset.action.split(/\s+/); }
function hold(container, id, button, fresh) {
  const previous = fingers.get(id) || null;
  if (previous === button) return;
  if (previous) {
    for (const action of actionsOf(previous)) {
      const count = (touchHeld.get(action) || 1) - 1;
      if (count > 0) touchHeld.set(action, count); else touchHeld.delete(action);
    }
    previous.classList.remove('down');
    fingers.delete(id);
  }
  if (button) {
    fingers.set(id, button); button.classList.add('down');
    for (const action of actionsOf(button)) {
      touchHeld.set(action, (touchHeld.get(action) || 0) + 1);
      if (fresh) { queue.push(action); downThisFrame.add(action); }
    }
  }
}
export function attachTouch(container) {
  if (!container) return;
  const buttonAt = (x, y) => {
    const element = document.elementFromPoint(x, y), button = element && element.closest ? element.closest('[data-action]') : null;
    return button && container.contains(button) ? button : null;
  };
  container.addEventListener('pointerdown', event => {
    const button = event.target.closest && event.target.closest('[data-action]');
    if (!button) return;
    event.preventDefault(); wake();
    try { button.setPointerCapture(event.pointerId); } catch { /* not every browser captures touch */ }
    hold(container, event.pointerId, button, true);
  });
  container.addEventListener('pointermove', event => {
    if (!fingers.has(event.pointerId)) return;
    const button = buttonAt(event.clientX, event.clientY);
    if (button) hold(container, event.pointerId, button, false);
  });
  const release = event => hold(container, event.pointerId, null, false);
  container.addEventListener('pointerup', release);
  container.addEventListener('pointercancel', release);
  container.addEventListener('contextmenu', event => event.preventDefault());
}

function pollGamepad() {
  pad.held.clear(); pad.analog = {}; pad.x = pad.y = 0; pad.connected = false;
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gamepad of pads) {
    if (!gamepad || !gamepad.connected) continue;
    pad.connected = true;
    const dead = v => Math.abs(v) > 0.18 ? v : 0;
    pad.x = dead(gamepad.axes[0] || 0); pad.y = dead(gamepad.axes[1] || 0);
    for (const [i, actions] of Object.entries(PAD_BUTTONS)) {
      const button = gamepad.buttons[i], value = button ? button.value : 0;
      for (const action of actions) { pad.analog[action] = Math.max(pad.analog[action] || 0, value); if (value > 0.5) pad.held.add(action); }
    }
    if (pad.x < -0.6) pad.held.add('left'); if (pad.x > 0.6) pad.held.add('right');
    if (pad.y < -0.6) pad.held.add('up'); if (pad.y > 0.6) pad.held.add('down');
    break;
  }
}
function rawHeld(action) {
  if (touchHeld.has(action) || pad.held.has(action)) return true;
  const codes = keys[action];
  if (codes) for (const code of codes) if (heldCodes.has(code)) return true;
  return false;
}
/* Once per frame, before reading held / pressed. */
export function update() {
  pollGamepad();
  [before, now] = [now, before];
  now.clear();
  const all = new Set([...Object.keys(keys), ...touchHeld.keys(), ...pad.held]);
  for (const action of all) if (rawHeld(action)) now.add(action);
  // Gamepad presses join the queue on their first frame.
  for (const action of pad.held) if (!before.has(action)) { queue.push(action); wake(); }
  pressedNow = new Set([...downThisFrame, ...[...now].filter(action => !before.has(action))]);
  downThisFrame.clear();
}
let pressedNow = new Set();
export function held(action) { return now.has(action) || rawHeld(action); }
/* Went down since the last update() (a tap shorter than a frame still counts). */
export function pressed(action) { return pressedNow.has(action); }
export function analog(action) { return Math.max(held(action) ? 1 : 0, pad.analog[action] || 0); }
export function axis(negative, positive) {
  let value = (held(positive) ? 1 : 0) - (held(negative) ? 1 : 0);
  if (negative === 'left' && positive === 'right' && pad.x) value = pad.x;
  if (negative === 'up' && positive === 'down' && pad.y) value = pad.y;
  return Math.max(-1, Math.min(1, value));
}
export function stick() {
  let x = axis('left', 'right'), y = axis('up', 'down');
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  return {x, y};
}
export function takeActions() { return queue.splice(0, queue.length); }
export function push(action) { queue.push(action); downThisFrame.add(action); }
export function clear() { heldCodes.clear(); touchHeld.clear(); queue.length = 0; now.clear(); before.clear(); pressedNow.clear(); downThisFrame.clear(); }
export function gamepadConnected() { return pad.connected; }
