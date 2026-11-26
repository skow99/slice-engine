import {maxBallastKg, setBallast} from './sailing.js';

export function bindBallastControls(control, boat) {
  const toggle = control.querySelector('#ballast-toggle');
  const panel = control.querySelector('#ballast-panel');
  const summary = control.querySelector('#ballast-summary');
  const sides = [...control.querySelectorAll('[data-ballast-side]')];
  const weight = control.querySelector('#ballast-kg');
  const kilograms = control.querySelector('#ballast-weight');
  const heel = control.querySelector('#ballast-heel');
  const gauge = control.querySelector('.ballast-gauge');
  const sideName = {1: 'Left', 0: 'Off', '-1': 'Right'};

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  function refreshSelection() {
    const side = boat.ballastSide;
    const mass = boat.ballastKg + ' kg';
    summary.textContent = side ? sideName[side] + ' · ' + mass : 'Off';
    for (const button of sides) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.ballastSide) === side));
    }
    kilograms.textContent = mass;
    weight.setAttribute('aria-valuetext', mass);
  }

  function choose(side) {
    if (toggle.disabled) return;
    setBallast(boat, side);
    refreshSelection();
  }

  weight.max = maxBallastKg;
  weight.value = boat.ballastKg;
  weight.addEventListener('input', () => {
    setBallast(boat, boat.ballastSide, weight.valueAsNumber);
    refreshSelection();
  });
  for (const button of sides) button.addEventListener('click', () => choose(Number(button.dataset.ballastSide)));
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  control.addEventListener('keydown', event => {
    if (event.code !== 'Escape' || panel.hidden) return;
    setOpen(false);
    toggle.focus();
  });
  refreshSelection();

  return {
    choose,
    refresh(enabled) {
      toggle.disabled = !enabled;
      if (!enabled && !panel.hidden) setOpen(false);
      if (panel.hidden) {
        // Righting the yacht centers the crew without changing the selected weight.
        if (!boat.ballastSide && summary.textContent !== 'Off') refreshSelection();
        return;
      }
      const angle = Math.round((boat.heel + boat.waveRoll) * 180 / Math.PI);
      heel.textContent = angle ? Math.abs(angle) + '° ' + sideName[Math.sign(angle)].toLowerCase() : 'Level';
      gauge.style.setProperty('--heel', Math.max(0, Math.min(100, 50 - angle * 50 / 35)) + '%');
      gauge.classList.toggle('heavy', Math.abs(angle) >= 35);
    },
  };
}
