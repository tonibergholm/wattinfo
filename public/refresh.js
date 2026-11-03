export function setupRefresh(tasks) {
  const button = document.getElementById('refresh');
  const feedback = document.getElementById('pull-refresh');
  const message = document.getElementById('pull-message');
  const icon = document.getElementById('pull-icon');
  let pending = null, hideTimer, origin = null, distance = 0, manualFeedback = false;
  function show(state, text) {
    clearTimeout(hideTimer);
    feedback.dataset.state = state;
    icon.textContent = state === 'loading' ? '↻' : state === 'done' ? '✓' : state === 'error' ? '!' : '↓';
    feedback.classList.add('visible');
    if (message.textContent !== text) message.textContent = text;
  }
  function resetPull() {
    origin = null; distance = 0;
    document.body.classList.remove('pulling');
    document.body.style.removeProperty('--pull-distance');
  }
  function update(manual = false) {
    if (manual) { manualFeedback = true; show('loading', 'Päivitetään tietoja…'); }
    if (pending) return pending;
    button.disabled = true;
    button.classList.add('updating');
    button.setAttribute('aria-busy', 'true');
    pending = (async () => {
      const results = await Promise.allSettled(tasks.map(task => Promise.resolve().then(task)));
      const success = results.every(result => result.status === 'fulfilled' && result.value === true);
      button.disabled = false;
      button.classList.remove('updating');
      button.setAttribute('aria-busy', 'false');
      button.title = success ? 'Tiedot tarkistettu · automaattisesti 5 min välein' : 'Päivitys epäonnistui osittain · yritä uudelleen';
      if (manualFeedback) {
        show(success ? 'done' : 'error', success ? 'Tiedot tarkistettu' : 'Osa tiedoista ei päivittynyt · yritä uudelleen');
        hideTimer = setTimeout(() => feedback.classList.remove('visible'), success ? 1800 : 3500);
      }
      manualFeedback = false; pending = null;
    })();
    return pending;
  }
  button.addEventListener('click', () => update(true));
  document.addEventListener('touchstart', event => {
    resetPull();
    if (pending || window.scrollY > 0 || event.touches.length !== 1 || event.target.closest('a,button,input,select,textarea,summary,[role="button"]')) return;
    origin = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  document.addEventListener('touchmove', event => {
    if (!origin) return;
    if (event.touches.length !== 1 || window.scrollY > 0) { resetPull(); feedback.classList.remove('visible'); return; }
    const dx = Math.abs(event.touches[0].clientX - origin.x);
    const dy = event.touches[0].clientY - origin.y;
    if (dx > 10 && dx > dy) { resetPull(); feedback.classList.remove('visible'); return; }
    if (dy <= 8) {
      if (distance) { resetPull(); feedback.classList.remove('visible'); }
      return;
    }
    // Suppress native overscroll only after recognizing a vertical pull.
    if (event.cancelable) event.preventDefault();
    distance = Math.min(72, dy * .45);
    document.body.style.setProperty('--pull-distance', `${distance}px`);
    document.body.classList.add('pulling');
    show(distance >= 56 ? 'ready' : 'pull', distance >= 56 ? 'Vapauta päivittääksesi' : 'Vedä alaspäin päivittääksesi');
  }, { passive: false });
  document.addEventListener('touchend', () => {
    if (!origin) return;
    const ready = distance >= 56;
    resetPull();
    if (ready) update(true); else feedback.classList.remove('visible');
  }, { passive: true });
  document.addEventListener('touchcancel', () => { if (origin) { resetPull(); feedback.classList.remove('visible'); } }, { passive: true });
  setInterval(() => { if (!document.hidden) update(); }, 300_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  window.addEventListener('pageshow', event => { if (event.persisted) update(); });
  window.addEventListener('online', () => update());
  update();
}
