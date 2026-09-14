window.BUONAROTTI_SHOW_GLB_TARGET = false;

const checkbox = document.querySelector('#showGlbTarget');
if (checkbox) {
  checkbox.checked = false;
  checkbox.addEventListener('change', () => {
    window.BUONAROTTI_SHOW_GLB_TARGET = checkbox.checked;
    if (window.Buonarotti?.getState?.().targetMode === 'glb') {
      window.Buonarotti.setTargetMode('glb');
    }
  });
}
