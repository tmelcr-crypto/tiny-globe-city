export function createLoop(update) {
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    update(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
