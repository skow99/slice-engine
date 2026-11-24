/* A pixel menu: a title and rows, driven by input actions, drawn with the
 * pixel font. Enough for a title screen, a pause menu and settings.
 *
 *   const menu = createMenu({title: 'PAUSED', items: [
 *     {label: 'RESUME', action: () => resume()},
 *     {label: 'MUSIC', value: () => on ? 'ON' : 'OFF', change: () => on = !on},
 *     {label: 'QUIT', action: quit},
 *   ], onBack: resume});
 *   for (const action of Input.takeActions()) menu.handle(action);
 *   menu.draw(context, {x: 160, y: 50});
 *
 * Rows: label, action() (confirm), change(direction) (left / right, and
 * confirm with direction 1), value() (shown on the right), disabled.
 * Clicks and taps: menu.hit(x, y) in game pixels returns and selects a row.
 */
import * as Gfx from './gfx.js';
import * as Sfx from './audio.js';

export function createMenu({title = '', items = [], onBack = null, width = 180, rowHeight = 14, sounds = true} = {}) {
  const beep = name => { if (sounds) Sfx.play(name); };
  const menu = {
    title, items, index: 0, width, rowHeight, onBack, rows: [],
    selected() { return menu.items[menu.index]; },
    move(step) {
      const n = menu.items.length;
      for (let tries = 0; tries < n; tries++) {
        menu.index = (menu.index + step + n) % n;
        if (!menu.items[menu.index].disabled) break;
      }
      beep('move');
    },
    /* Returns true if the menu used the action. */
    handle(action) {
      const item = menu.selected();
      if (action === 'up') { menu.move(-1); return true; }
      if (action === 'down') { menu.move(1); return true; }
      if ((action === 'left' || action === 'right') && item && item.change) { item.change(action === 'left' ? -1 : 1); beep('move'); return true; }
      if (action === 'confirm' && item && !item.disabled) {
        beep('select');
        if (item.action) item.action(); else if (item.change) item.change(1);
        return true;
      }
      if (action === 'back' && menu.onBack) { beep('back'); menu.onBack(); return true; }
      return false;
    },
    /* Draw centred on x (or from x with align 'left'), title at y. */
    draw(context, {x = 160, y = 40, panel = true} = {}) {
      const w = menu.width, rowsTop = y + (menu.title ? 20 : 4), h = rowsTop - y + menu.items.length * menu.rowHeight + 6, left = Math.round(x - w / 2);
      if (panel) Gfx.panel(context, left, y - 8, w, h + 8);
      if (menu.title) Gfx.text(context, menu.title, x, y, {font: 'large', align: 'center', color: '#f6c95e', shadow: '#000000'});
      menu.rows = [];
      menu.items.forEach((item, i) => {
        const rowY = rowsTop + i * menu.rowHeight, chosen = i === menu.index;
        menu.rows.push({x: left, y: rowY - 4, w, h: menu.rowHeight});
        if (chosen) Gfx.rect(context, left + 4, rowY - 3, w - 8, menu.rowHeight - 2, '#2c4458');
        const color = item.disabled ? '#5a6670' : chosen ? '#ffffff' : '#b8c4cc';
        Gfx.text(context, (chosen ? '> ' : '  ') + item.label, left + 10, rowY, {color});
        if (item.value) Gfx.text(context, (item.change && chosen ? '< ' : '') + item.value() + (item.change && chosen ? ' >' : ''), left + w - 10, rowY, {color, align: 'right'});
      });
    },
    /* A pointer at (x, y) in game pixels: select the row under it; returns its index or -1. */
    hit(x, y) {
      const i = menu.rows.findIndex(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      if (i >= 0 && !menu.items[i].disabled) menu.index = i;
      return i;
    },
  };
  if (menu.items[0] && menu.items[0].disabled) menu.move(1);
  return menu;
}
