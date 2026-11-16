// Keyboard and mouse input. Held keys steer the ship; the mouse aims it.
// One-shot presses (start, restart, pause, nova, mute) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost
// and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_NOVA = 4;
export const ACTION_MUTE = 8;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const NOVA = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = { left: false, right: false, up: false, down: false, space: false };
  let actions = 0;
  let firing = false;
  const aim = { x: 0, y: 0, valid: false };

  function pointerAim(event) {
    const rect = canvas.getBoundingClientRect();
    aim.x = (event.clientX - rect.left) * (canvas.width / rect.width);
    aim.y = (event.clientY - rect.top) * (canvas.height / rect.height);
    aim.valid = true;
  }

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) keys.left = true;
    else if (RIGHT.has(event.code)) keys.right = true;
    else if (UP.has(event.code)) keys.up = true;
    else if (DOWN.has(event.code)) keys.down = true;
    else if (CONFIRM.has(event.code)) {
      keys.space = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (NOVA.has(event.code)) {
      if (!event.repeat) actions |= ACTION_NOVA;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) keys.left = false;
    else if (RIGHT.has(event.code)) keys.right = false;
    else if (UP.has(event.code)) keys.up = false;
    else if (DOWN.has(event.code)) keys.down = false;
    else if (CONFIRM.has(event.code)) keys.space = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.left = keys.right = keys.up = keys.down = keys.space = false;
    firing = false;
  });

  canvas.addEventListener('pointermove', pointerAim);
  canvas.addEventListener('pointerdown', (event) => {
    pointerAim(event);
    if (event.button === 0) firing = true;
    if (event.button === 2) actions |= ACTION_NOVA;
    if (event.button === 0) actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) firing = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** -1..1 on each axis, from the held movement keys. */
    move() {
      return {
        x: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
        y: (keys.down ? 1 : 0) - (keys.up ? 1 : 0),
      };
    },
    /** The aim point in canvas pixels, or null before the mouse has moved. */
    aimPoint() {
      return aim.valid ? aim : null;
    },
    /** Whether the fire button (mouse hold or Space) is down. Space counts as fire too. */
    firing() {
      return firing || keys.space === true;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
