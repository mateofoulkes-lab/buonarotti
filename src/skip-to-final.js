function waitForApp() {
  if (window.Buonarotti && window.__BUONAROTTI_PLANNER__) {
    install();
    return;
  }
  setTimeout(waitForApp, 50);
}

function install() {
  if (document.querySelector('#skipToFinalBtn')) return;

  const buttons = document.querySelector('.buttons');
  const sculptBtn = document.querySelector('#sculptBtn');
  if (!buttons || !sculptBtn) return;

  const btn = document.createElement('button');
  btn.id = 'skipToFinalBtn';
  btn.className = 'primary-wide';
  btn.textContent = 'Saltar al final';
  btn.title = 'Calcula la escultura completa por capas outside-in sin animar el recorrido del brazo.';
  sculptBtn.insertAdjacentElement('afterend', btn);

  btn.addEventListener('click', async () => {
    const planner = window.__BUONAROTTI_PLANNER__;
    const app = window.Buonarotti;
    const status = document.querySelector('#statusText');
    const pass = document.querySelector('#passText');
    const frontier = document.querySelector('#frontierText');

    if (!planner?.targetField) {
      if (status) status.textContent = 'ELEGÍ UN OBJETIVO PRIMERO';
      return;
    }

    app?.stopSculpt?.();
    window.BUONAROTTI_SHOW_GLB_TARGET = false;
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'Calculando…';

    let totalRemoved = 0;
    let layers = 0;
    let stagnant = 0;

    try {
      // One iteration = one COMPLETE exterior frontier. This preserves the same
      // outside-in rule while avoiding thousands of animated tool movements.
      while (layers < 4096) {
        const result = planner.removeCurrentLayerBulk();
        layers++;
        totalRemoved += result.removed || 0;

        const state = planner.getLayerState();
        if (pass) pass.textContent = String(result.layer || state.layer || layers);
        if (frontier) frontier.textContent = Number(state.remaining || 0).toLocaleString('es-AR');
        if (status) status.textContent = `SALTANDO AL FINAL · CAPA ${layers}`;

        if (result.complete || state.remaining === 0) break;
        if (!result.removed) stagnant++; else stagnant = 0;
        if (stagnant >= 3) break;

        // Yield occasionally so the browser can repaint and remains responsive.
        if (layers % 2 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }

      // Leave the turntable in a neutral presentation angle.
      app?.rotateStock?.(0);
      if (status) status.textContent = `ESCULTURA FINAL · ${totalRemoved.toLocaleString('es-AR')} VOXELES REMOVIDOS`;
      btn.textContent = 'Escultura final mostrada';
      setTimeout(() => { btn.textContent = oldText; }, 1800);
    } catch (err) {
      console.error(err);
      if (status) status.textContent = `ERROR AL SALTAR: ${err.message}`;
      btn.textContent = oldText;
    } finally {
      btn.disabled = false;
    }
  });
}

waitForApp();
