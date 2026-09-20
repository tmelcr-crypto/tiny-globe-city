// Initial UI: name the player before entering the world.
export function createPlayerCreation({ existingName, onCreate }) {
  const overlay = document.createElement('div');
  overlay.id = 'player-creation';
  overlay.innerHTML = `
    <form>
      <h1>Tiny Globe City</h1>
      <input type="text" name="playerName" maxlength="16" placeholder="Your name" autocomplete="off" required />
      <button type="submit">Start</button>
    </form>
  `;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('form');
  const input = overlay.querySelector('input');
  if (existingName) input.value = existingName;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    overlay.remove();
    onCreate(name);
  });

  input.focus();
}
