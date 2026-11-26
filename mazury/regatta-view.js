import {Model, Voxel} from '../src/index.js';
import {distance} from './fleet-navigation.js';
import {entryBuoy, entryRange} from './regatta-course.js';
import {windBearing} from './wind.js';

const orange = '#ffb467';
const mint = '#b2e6ce';
const buoyUnit = .135;

export async function loadRegattaBuoy() {
  const source = await Model.loadImage(new URL('./art/regatta-buoy-slices.png', import.meta.url).href);
  const model = Model.fromSliceImage(source, {sliceWidth: 15, sliceHeight: 15, count: 16, columns: 4});
  return Model.thing(model, {frames: 1}).sprite(0);
}

function stroke(context, points, color, width, dash = []) {
  context.beginPath();
  points.forEach(({x, y}, index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
  context.setLineDash(dash);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
  context.setLineDash([]);
}

function band(context, points, color, dash = []) {
  stroke(context, points, '#112b33c9', 3, dash);
  stroke(context, points, color, 1.35, dash);
}

function direction(context, at, aim, color) {
  const angle = Math.atan2(aim.y - at.y, aim.x - at.x);
  context.save();
  context.translate(at.x, at.y);
  context.rotate(angle);
  band(context, [{x: -5, y: -4}, {x: 0, y: 0}, {x: -5, y: 4}], color);
  context.restore();
}

export function drawRegatta(context, view, race, {sprite, time = 0, guiding = true, compact = false} = {}) {
  const course = race.course;
  const next = guiding && race.target();
  const project = view.toScreen;
  const courseVisible = course && race.phase !== 'results';
  context.save();
  context.lineJoin = 'round';
  context.lineCap = 'round';
  if (courseVisible) {
    const {start, marks, finish, staging} = course;
    const markPoints = marks.map(({mark}) => mark);
    const path = [start.center, ...markPoints, finish.center].map(project);
    stroke(context, path, '#fff5d996', compact ? .9 : 1, compact ? [2, 2] : [4, 5]);
    if (race.phase === 'staging' || race.phase === 'countdown') {
      const points = [...staging, staging[0]].map(project);
      context.beginPath();
      for (const {x, y} of points) context.lineTo(x, y);
      context.fillStyle = '#91e4cc2d';
      context.fill();
      stroke(context, points, '#a1ebd3aa', 1, [3, 3]);
    }
    const startColor = race.phase !== 'racing' ? orange : mint;
    band(context, [start.a, start.b].map(project), startColor);
    band(context, [finish.a, finish.b].map(project), '#c8deff', [4, 2]);
    if (!compact) {
      const nextMark = race.player.status === 'sailing' && marks[race.player.mark];
      if (nextMark) band(context, [nextMark.gate.a, nextMark.gate.b].map(project), orange, [3, 2]);
      for (const [gate, color] of [[start, startColor], [finish, '#c8deff'], ...(nextMark ? [[nextMark.gate, orange]] : [])]) {
        const at = project(gate.center);
        const ahead = project({x: gate.center.x + Math.cos(gate.heading), y: gate.center.y + Math.sin(gate.heading)});
        if (ahead.x !== at.x || ahead.y !== at.y) direction(context, at, ahead, color);
      }
    }
  }

  function marker(point, label, color, physical = true) {
    const at = project(point);
    if (at.x < -28 || at.y < -28 || at.x > view.w + 28 || at.y > view.h + 28) return;
    const pixels = buoyUnit * view.scale;
    const showSprite = physical && sprite && !compact && pixels >= .18;
    if (showSprite) {
      const bob = Math.sin(time * 2.2 + point.x * .3) * .1 * view.scale;
      context.save();
      context.translate(at.x, at.y + bob);
      context.scale(pixels, pixels / Voxel.SQUASH);
      context.imageSmoothingEnabled = false;
      Voxel.draw(context, sprite, 0, 0);
      context.restore();
    } else if (physical) {
      context.beginPath();
      context.arc(at.x, at.y, compact ? 1.8 : 2.4, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = '#142b32';
      context.lineWidth = .85;
      context.stroke();
    }
    if (!label) return;
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    context.font = `bold ${compact ? 7 : 9}px system-ui`;
    context.fillStyle = color;
    context.strokeStyle = '#172d33';
    context.lineWidth = 2.7;
    const labelY = at.y - (showSprite ? 16 * pixels / Voxel.SQUASH + 3 : 4);
    context.strokeText(label, at.x, labelY);
    context.fillText(label, at.x, labelY);
  }

  if (courseVisible) {
    const {start, marks, finish} = course;
    for (const end of [start.a, start.b, finish.a, finish.b]) marker(end, '', orange);
    marker(start.center, 'START', race.phase === 'racing' ? mint : orange, false);
    marker(finish.center, 'FINISH', '#c8deff', false);
    marks.forEach(({mark}, index) => marker(mark, String(index + 1), orange));
  } else if (race.phase === 'idle') marker(entryBuoy, guiding ? 'REGATTA' : '', orange);
  if (next) {
    const at = project(next);
    context.beginPath();
    context.arc(at.x, at.y, compact ? 3.9 : 7, 0, Math.PI * 2);
    context.strokeStyle = '#fff0bb';
    context.lineWidth = compact ? .7 : 1.05;
    context.stroke();
  }
  context.restore();
}

const resultText = {OCS: 'OCS · Early start', DNS: 'DNS · Did not start', DNF: 'DNF · Did not finish'};
function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
}

export function bindRegattaPanel(race, boat, actions) {
  const byId = id => document.getElementById(id);
  const panel = byId('regatta-panel');
  const toggle = byId('regatta-toggle');
  const join = byId('regatta-join');
  const strict = byId('regatta-strict');
  const leave = byId('regatta-leave');
  const clockFace = byId('regatta-clock');
  const status = byId('regatta-status');
  const detail = byId('regatta-detail');
  const summary = byId('regatta-summary');
  const results = byId('regatta-results');
  let show, lastRows;
  toggle.addEventListener('click', () => { show = panel.hidden; actions.refresh(); });
  join.addEventListener('click', () => { actions.enter(strict.checked); join.blur(); });
  leave.addEventListener('click', () => { show = undefined; actions.leave(); leave.blur(); });
  return {
    get guiding() { return !panel.hidden; },
    refresh(sailing, welcome) {
      const phase = race.phase;
      const player = race.player;
      const idle = phase === 'idle';
      const near = distance(boat, entryBuoy) <= entryRange;
      const display = !idle || (show ?? (sailing && near));
      const target = race.target();
      const bearing = target && Math.round(windBearing(Math.atan2(target.y - boat.y, target.x - boat.x))) % 360;
      const targetText = target ? `${String(bearing).padStart(3, '0')}° · ${Math.round(distance(boat, target))} m` : '';
      panel.hidden = !display || !sailing && idle && !welcome;
      toggle.disabled = !idle;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      join.hidden = strict.labels[0].hidden = !idle || !near || !sailing;
      join.disabled = !!boat.anchor;
      leave.hidden = idle;
      results.hidden = !player || !(phase === 'results' || player.finished !== undefined || resultText[player.status]);
      const set = (node, text) => { if (node.textContent !== text) node.textContent = text; };
      let heading, instruction = '', progress = '', timer = '';
      if (idle) {
        heading = near && sailing ? 'Registration buoy' : 'Find the registration buoy';
        instruction = race.notice || (welcome ? 'Sail out from Ekomarina to approach the buoy.'
          : near ? boat.anchor ? 'Weigh anchor to register.' : 'Enter to race three volunteer crews.' : 'Sail within 24 m of the buoy to register.');
        progress = targetText;
      } else if (phase === 'staging') {
        heading = 'Set up behind the line';
        instruction = race.notice || 'Enter the shaded area with your main up to start the countdown.';
        progress = targetText;
      } else {
        const standings = race.standings();
        if (player.status === 'finished') {
          heading = `${['1st', '2nd', '3rd', '4th'][standings.indexOf(player)]} place`;
          timer = clock(player.finished);
        } else if (resultText[player.status]) heading = player.earlyDisqualification ? 'DNF · Early start' : resultText[player.status];
        else if (player.status === 'starting') {
          heading = player.recall ? 'Return behind the line' : phase === 'countdown' ? 'Pre-start'
            : race.time < 2 ? 'Start signal' : 'Cross the start line';
          instruction = player.recall ? 'Bring your entire hull back, then cross toward the course.'
            : phase === 'countdown' ? (race.strict ? 'An early crossing ends your race.' : 'Build speed behind the line. Cross at zero.')
              : 'Cross between the two line buoys, in the arrow direction.';
        } else {
          heading = player.mark < race.course.marks.length ? `Round buoy ${player.mark + 1} to port` : 'Cross the finish line';
          instruction = player.missedUntil > race.time ? 'Missed the gate. Loop back and cross it in the arrow direction.'
            : player.mark < race.course.marks.length ? 'Pass through the dashed gate with the buoy on your left.'
              : 'Cross between the buoys in the arrow direction.';
        }
        if (!timer && phase === 'countdown') timer = clock(Math.ceil(-race.time));
        if (!timer && phase === 'racing' && !resultText[player.status]) timer = race.time < 2 ? 'GO' : clock(race.time);
        const position = player.status === 'sailing' ? `${standings.indexOf(player) + 1} / ${standings.length}` : '';
        const closing = !results.hidden || phase !== 'racing' || race.finishCloses - race.time > 125
          ? '' : `Closes ${clock(Math.ceil(race.finishCloses - race.time))}`;
        progress = [position, targetText, closing].filter(Boolean).join(' · ');
        instruction = race.notice || instruction;
        if (!results.hidden) {
          const rows = standings.map(entry => `${entry.name} · ${entry.finished !== undefined ? clock(entry.finished)
            : resultText[entry.status] ?? `Mark ${entry.mark} / ${race.course.marks.length}`}`);
          const signature = rows.join('\n');
          if (signature !== lastRows) {
            results.replaceChildren(...rows.map(text => Object.assign(document.createElement('li'), {textContent: text})));
            lastRows = signature;
          }
        }
      }
      set(status, heading);
      set(detail, instruction);
      detail.hidden = !instruction;
      set(summary, progress);
      summary.hidden = !progress;
      set(clockFace, timer);
      clockFace.hidden = !timer;
      set(leave, phase === 'staging' ? 'Cancel entry' : !results.hidden ? 'Back to sailing' : 'Retire');
    },
  };
}
