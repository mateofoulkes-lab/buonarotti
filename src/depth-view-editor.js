import './skip-to-final.js';

const editor = document.querySelector('#depthViewsEditor');
const info = document.querySelector('#depthInfo');
const showGlbTarget = document.querySelector('#showGlbTarget');
const targetMode = document.querySelector('#targetMode');

// Hard default: the GLB reference is hidden unless the user explicitly enables it.
window.BUONAROTTI_SHOW_GLB_TARGET = false;
if (showGlbTarget) showGlbTarget.checked = false;

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

function rebuildTarget() {
  if (window.Buonarotti?.setTargetMode) window.Buonarotti.setTargetMode('depth');
}

function refreshGlbVisibility() {
  window.BUONAROTTI_SHOW_GLB_TARGET = !!showGlbTarget?.checked;
  if (targetMode?.value === 'glb' && window.Buonarotti?.setTargetMode) {
    window.Buonarotti.setTargetMode('glb');
  }
}

showGlbTarget?.addEventListener('change', refreshGlbVisibility);

function applyAngle(id, angle) {
  const refs = getRefs();
  if (!refs) return;
  refs.setAngle(id, angle);
  rebuildTarget();
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
    <div class="depth-editor-head">
      <div>
        <div class="depth-editor-title">Asignación de vistas</div>
        <div class="depth-editor-hint">0° = frente, 90° = derecha. Podés corregir cualquier detección.</div>
      </div>
      <button id="autoDetectViewsBtn" class="secondary compact-btn">Autodetectar por nombre</button>
    </div>
  `;

  editor.querySelector('#autoDetectViewsBtn')?.addEventListener('click', () => {
    refs.autodetectAnglesByName?.();
    rebuildTarget();
  });

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
window.addEventListener('load', () => {
  render();
  refreshGlbVisibility();
});
setTimeout(render, 0);
