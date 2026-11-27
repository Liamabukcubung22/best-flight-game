// Nusantara Sky Courier — keyboard and mouse input.
// One job: turn keys and pointer movement into one clean input state.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pitch = 0; // -1..1, +1 = stick back = climb
    this.roll = 0; // -1..1, +1 = bank right
    this.yaw = 0;
    this.throttleDelta = 0;
    this.brake = false;
    this.mouseSteer = false;
    this.mouseX = 0; // -1..1 across the screen
    this.mouseY = 0; // -1..1 down the screen
    this.mouseDown = false;
    this.pressed = new Set(); // edge-triggered keys, consumed by the game
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      if (!e.repeat) this.pressed.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    });
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouseY = ((e.clientY - r.top) / r.height) * 2 - 1;
    });
    canvas.addEventListener('pointerdown', (e) => {
      this.mouseDown = true;
      this.mouseX = ((e.clientX - canvas.getBoundingClientRect().left) / canvas.getBoundingClientRect().width) * 2 - 1;
      this.mouseY = ((e.clientY - canvas.getBoundingClientRect().top) / canvas.getBoundingClientRect().height) * 2 - 1;
    });
    window.addEventListener('pointerup', () => {
      this.mouseDown = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
  }

  has(key) {
    return this.keys.has(key);
  }

  // True once per physical press; the game clears it by reading.
  take(key) {
    if (this.pressed.has(key)) {
      this.pressed.delete(key);
      return true;
    }
    return false;
  }

  // Recompute the continuous axes from the current keys / mouse.
  poll() {
    let pitch = 0;
    let roll = 0;
    if (this.has('ArrowUp')) pitch -= 1;
    if (this.has('ArrowDown')) pitch += 1;
    if (this.has('ArrowLeft')) roll -= 1;
    if (this.has('ArrowRight')) roll += 1;
    if (this.mouseSteer) {
      // Mouse: hold the pointer off-centre to steer, like a virtual stick.
      roll += this.mouseX * 1.1;
      pitch += this.mouseY * 0.9;
    }
    this.pitch = Math.max(-1, Math.min(1, pitch));
    this.roll = Math.max(-1, Math.min(1, roll));
    this.yaw = (this.has('d') ? 1 : 0) - (this.has('a') ? 1 : 0);
    this.throttleDelta =
      (this.has('w') || this.has('Shift') ? 0.55 : 0) - (this.has('s') ? 0.55 : 0);
    this.brake = this.has(' ') || this.mouseDown;
  }
}
