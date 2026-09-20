export function createLoadingScreen() {
  const el = document.createElement('div');
  el.id = 'loading-screen';
  el.textContent = 'Loading…';
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 20; display: none;
    align-items: center; justify-content: center;
    background: #0b1020; color: #fff; font: 20px sans-serif;`;
  document.body.appendChild(el);

  return {
    show() { el.style.display = 'flex'; },
    hide() { el.style.display = 'none'; },
  };
}
