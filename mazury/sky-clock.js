import {Voxel} from '../src/index.js';
import {daylightAt, sunAt, wrapDay} from './daylight.js';

const rgb = color => 'rgb(' + color.join(',') + ')';
const compassPoints = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const formatTime = minute => [Math.floor(minute / 60), minute % 60]
  .map(value => String(value).padStart(2, '0')).join(':');

function installLighting(sky) {
  const {body, source, strength, shadows, twilightAmount, warmth} = sky;
  Voxel.addPreset('mazury-sky', {
    light: body ? [body.x, body.y, Math.max(0.12, body.z)] : [0, 0, 1],
    shadow: shadows,
    shadowAlpha: [Math.round(24 + 104 * strength), Math.round(71 * strength)],
    shadowRgb: warmth > 0.2 ? [53, 23, 36] : [10, 17, 39],
    cool: [36, 48, 85], warm: sky.color,
    coolAmount: 0.08 + 0.04 * twilightAmount,
    warmAmount: source === 'sun' ? 0.08 + 0.18 * warmth : 0.12,
    contrast: 0.68 + 0.37 * strength,
  });
  Voxel.setLighting('mazury-sky');
}

// Compass radius decreases as the light climbs. The trail is the visible
// part of the summer sun's path, with north at the top of the plot.
function drawSky(canvas, sky) {
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = cy - 18;
  const at = ({x, y, z}) => [cx + x * radius / (1 + z), cy + y * radius / (1 + z)];
  const backdrop = ctx.createLinearGradient(0, 0, 0, canvas.height);
  backdrop.addColorStop(0, sky.source === 'sun' ? '#204753' : '#111d36');
  backdrop.addColorStop(1, sky.warmth > 0.3 ? '#745448' : '#132a36');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#b2c4bd50';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.moveTo(cx - 4, cy);
  ctx.lineTo(cx + 4, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
  ctx.fillStyle = '#b9c9c6';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - radius - 10);
  ctx.fillText('S', cx, cy + radius + 11);
  ctx.fillText('W', cx - radius - 12, cy);
  ctx.fillText('E', cx + radius + 12, cy);
  for (let minute = 0; minute < 1440; minute += 20) {
    const sun = sunAt(minute);
    if (sun.z < 0) continue;
    const [x, y] = at(sun);
    ctx.fillStyle = '#eed7a474';
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
  if (!sky.body) return;
  const [x, y] = at(sky.body);
  const halo = ctx.createRadialGradient(x, y, 1, x, y, 13);
  halo.addColorStop(0, rgb(sky.color));
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.fillRect(x - 13, y - 13, 26, 26);
  ctx.fillStyle = rgb(sky.color);
  ctx.beginPath();
  ctx.arc(x, y, sky.source === 'sun' ? 4.5 : 3.6, 0, Math.PI * 2);
  ctx.fill();
}

export function createSkyClock(panel) {
  const slider = panel.querySelector('#daylight-time');
  const output = panel.querySelector('#daylight-readout');
  const description = panel.querySelector('#sky-source');
  const diagram = panel.querySelector('#sky-dial');
  const moonButton = panel.querySelector('#moon-toggle');
  const clockButton = panel.querySelector('#clock-toggle');
  let minute = 12 * 60;
  let running = true;
  let moonEnabled = true;
  let displayed = -1;
  let lightKey;
  let sky;

  function refreshControls() {
    const label = formatTime(displayed);
    output.textContent = label;
    slider.value = displayed;
    slider.setAttribute('aria-valuetext', label);
    clockButton.textContent = running ? 'Pause clock' : 'Resume clock';
    moonButton.textContent = moonEnabled ? 'Moon on' : 'Moon off';
    moonButton.setAttribute('aria-pressed', String(moonEnabled));
    if (!panel.open) return;
    const body = sky.body;
    const direction = body && compassPoints[Math.round(body.azimuth / 45) % compassPoints.length];
    description.textContent = body
      ? (sky.source === 'sun' ? 'Sun' : 'Moon') + ' · ' + direction + ' · ' + Math.round(body.elevation) + '°'
      : sky.twilightAmount > 0.18 ? 'Twilight' : 'Night';
    drawSky(diagram, sky);
  }

  function changeTime(value) {
    minute = wrapDay(value);
    running = false;
    read();
  }

  function toggleMoon() {
    moonEnabled = !moonEnabled;
    displayed = -1;
    read();
  }

  function toggleRunning() {
    running = !running;
    refreshControls();
  }

  function read() {
    const tick = Math.floor(minute);
    if (displayed === tick) return sky;
    displayed = tick;
    sky = daylightAt(tick, moonEnabled);
    // The tint and dial move every minute. Re-bake sprite lighting less often.
    const sample = Math.floor(tick / 12) * 12 + 6;
    const key = sample + ':' + sky.source;
    if (key !== lightKey) {
      lightKey = key;
      const sampled = daylightAt(sample, moonEnabled);
      installLighting(sampled.source === sky.source ? sampled : sky);
    }
    refreshControls();
    return sky;
  }

  panel.addEventListener('toggle', refreshControls);
  slider.addEventListener('input', () => changeTime(slider.valueAsNumber));
  moonButton.addEventListener('click', toggleMoon);
  clockButton.addEventListener('click', toggleRunning);
  read();
  return {
    read, toggleMoon, toggleRunning,
    minute: () => minute,
    tick(seconds) { if (running) minute = wrapDay(minute + seconds); },
    shift(hours) { changeTime(minute + hours * 60); },
    togglePanel() { panel.open = !panel.open; },
    status: () => ({minute, running, moonEnabled, ...sky}),
  };
}
