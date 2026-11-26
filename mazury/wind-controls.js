import {knotsPerMeterPerSecond, windBearing, windDirection} from './wind.js';

export function bindWindControls(panel, wind, boat) {
  const arrow = panel.querySelector('.wind-arrow');
  const readout = panel.querySelector('#wind-readout');
  const compass = panel.querySelector('#wind-bearing');
  const strength = panel.querySelector('#wind-strength');
  const burst = panel.querySelector('#wind-gust');
  const automatic = panel.querySelector('#wind-automatic');
  const gustNow = panel.querySelector('#wind-bump');
  const variable = panel.querySelector('#wind-variable');
  const labels = [...panel.querySelectorAll('output')];

  function updateSettings(daily) {
    const degrees = Math.round(daily ? windBearing(wind.from) : wind.bearing) % 360;
    const knots = daily ? Math.round(wind.speed * knotsPerMeterPerSecond) : wind.knots;
    const gustKnots = daily ? Math.round(daily.gustKnots) : wind.gustKnots;
    compass.value = degrees;
    strength.value = knots;
    burst.value = gustKnots;
    labels[0].textContent = String(degrees).padStart(3, '0') + '° ' + windDirection(degrees);
    labels[1].textContent = knots + ' kt';
    labels[2].textContent = '+' + gustKnots + ' kt';
    compass.setAttribute('aria-valuetext', labels[0].textContent);
    strength.setAttribute('aria-valuetext', labels[1].textContent);
    burst.setAttribute('aria-valuetext', labels[2].textContent);
    gustNow.disabled = !daily && wind.gustKnots === 0;
    arrow.style.transform = 'rotate(' + (wind.bearing + 180) + 'deg)';
  }

  function refresh(sample, daily) {
    if (daily && panel.open) updateSettings(daily);
    const gusting = sample.gust * knotsPerMeterPerSecond >= 0.5;
    const localKnots = Math.round(sample.speed * knotsPerMeterPerSecond);
    const text = localKnots === 0 ? 'Calm'
      : localKnots + ' kt ' + windDirection(windBearing(sample.from)) + (gusting ? ' · Gust' : '');
    arrow.style.transform = 'rotate(' + (windBearing(sample.from) + 180) + 'deg)';
    if (readout.textContent !== text) readout.textContent = text;
    panel.classList.toggle('gusting', gusting);
  }

  function bump() {
    wind.bump(boat);
  }

  compass.value = Math.round(wind.bearing) % 360;
  strength.value = wind.knots;
  burst.value = wind.gustKnots;
  automatic.checked = wind.automatic;
  // A manually chosen bearing or strength stays fixed until variable wind is enabled again.
  variable.checked = false;
  variable.addEventListener('change', () => wind.setVariable(variable.checked));
  compass.addEventListener('input', () => {
    variable.checked = false;
    wind.setVariable(false);
    wind.setBearing(compass.valueAsNumber);
    updateSettings();
    refresh(wind.at(boat));
  });
  strength.addEventListener('input', () => {
    variable.checked = false;
    wind.setVariable(false);
    wind.setKnots(strength.valueAsNumber);
    updateSettings();
    refresh(wind.at(boat));
  });
  burst.addEventListener('input', () => {
    wind.setGustKnots(burst.valueAsNumber);
    updateSettings();
    refresh(wind.at(boat));
  });
  automatic.addEventListener('change', () => {
    wind.setAutomatic(automatic.checked);
    refresh(wind.at(boat));
  });
  gustNow.addEventListener('click', bump);
  panel.addEventListener('keydown', event => {
    if (!event.target.matches('input') || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.code === 'KeyJ') {
      event.preventDefault();
      bump();
    }
    if (event.code === 'KeyV') {
      event.preventDefault();
      panel.open = false;
      panel.querySelector('summary').focus();
    }
  });
  updateSettings();
  refresh(wind.at(boat));

  return {
    refresh, bump, toggle: () => { panel.open = !panel.open; },
    setSimulation(enabled) {
      for (const input of [compass, strength, burst, automatic, variable]) input.disabled = enabled;
      if (!enabled) updateSettings();
    },
  };
}
