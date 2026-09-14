const editor = document.querySelector('#depthViewsEditor');
const info = document.querySelector('#depthInfo');

const PRESETS = [
  ['Frente', 0],
  ['3/4 derecha', 45],
  ['Derecha', 90],
  ['3/4 atrás der.', 135],
  ['Atrás', 180],
  ['3/4 atrás izq.', 225],
  ['Izquierda', 270],
  ['3/4 izquierda', 315]
];

function getRefs() {
  return window.BuonarottiReferenceViews;
}

function applyAngle(id, angle) {
  const refs = getRefs();
  if (!refs) return;
  refs.setAngle(id, angle);
  // Rebuild the depth target and reset the frozen outside-in frontier safely.
  if (window.Buonarotti?.setTargetMode) window.Buonarotti.setTargetMode('depth');
}

function render() {
  const refs = getRefs();
  const views = refs?.getSummary?.() || [];
  if (!editor) return;

  if (!views.length) {
    editor.innerHTML = '';
    editor.classList.add('empty');
    return;
  }

  editor.classList.remove('empty');
  editor.innerHTML = `
    <div class="depth-editor-title">Asignación de vistas</div>
    <div class="depth-editor-hint">Elegí una cara o escribí el ángulo exacto. 0° = frente, 90° = derecha.</div>
  `;

  for (const view of views) {
    const row = document.createElement('div');
    row.className = 'depth-view-row';

    const shortName = view.name.length > 24 ? `${view.name.slice(0, 21)}…` : view.name;
    const matchedPreset = PRESETS.find(([, angle]) => angle === Math.round(view.angleDeg));

    row.innerHTML = `
      <div class="depth-view-name" title="${view.name.replaceAll('"', '&quot;')}">${shortName}</div>
      <select class="depth-face-select" aria-label="Cara de ${shortName}">
        <option value="custom">Personalizado</option>
        ${PRESETS.map(([label, angle]) => `<option value="${angle}" ${matchedPreset?.[1] === angle ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      <div class="angle-input-wrap">
        <input class="depth-angle-input" type="number" min="0" max="359.9" step="0.1" value="${Number(view.angleDeg).toFixed(1)}" aria-label="Ángulo de ${shortName}">
        <span>°</span>
      </div>
    `;

    const select = row.querySelector('.depth-face-select');
    const input = row.querySelector('.depth-angle-input');

    select.addEventListener('change', () => {
      if (select.value === 'custom') return;
      input.value = Number(select.value).toFixed(1);
      applyAngle(view.id, Number(select.value));
    });

    input.addEventListener('change', () => {
      let angle = Number(input.value);
      if (!Number.isFinite(angle)) angle = 0;
      angle = ((angle % 360) + 360) % 360;
      input.value = angle.toFixed(1);
      const exact = PRESETS.find(([, preset]) => preset === Math.round(angle));
      select.value = exact ? String(exact[1]) : 'custom';
      applyAngle(view.id, angle);
    });

    editor.appendChild(row);
  }

  if (info) info.textContent = views.map(v => `${Number(v.angleDeg).toFixed(1)}° ${v.name}`).join(' · ');
}

window.addEventListener('buonarotti:reference-views-changed', render);
window.addEventListener('load', render);
setTimeout(render, 0);
