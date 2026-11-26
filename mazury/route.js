export function createSailedTrack() {
  let points = [];
  let spacing = 1.6;
  return {
    get length() { return points.length; },
    record(boat) {
      const last = points.at(-1);
      if (last && Math.hypot(boat.x - last.x, boat.y - last.y) < spacing) return;
      points.push({x: boat.x, y: boat.y});
      if (points.length < 12000) return;
      points = points.filter((_, i) => i % 2 === 0);
      spacing *= 2;
    },
    draw(context, view, boat) {
      if (points.length < 2) return;
      const start = view.toScreen(points[0]);
      context.save();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(start.x, start.y);
      for (let i = 1; i < points.length; i++) {
        const at = view.toScreen(points[i]);
        context.lineTo(at.x, at.y);
      }
      const end = view.toScreen(boat);
      context.lineTo(end.x, end.y);
      context.lineWidth = 2.7;
      context.strokeStyle = '#19344275';
      context.stroke();
      context.lineWidth = 1.15;
      context.strokeStyle = '#c0e8e2b3';
      context.stroke();
      context.restore();
    },
  };
}

export function drawDestination(context, view, point) {
  const at = view.toScreen(point);
  context.save();
  context.translate(at.x, at.y);
  context.fillStyle = '#2a3429dc';
  context.strokeStyle = '#ffd883';
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(0, -5);
  context.lineTo(4, 0);
  context.lineTo(0, 5);
  context.lineTo(-4, 0);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}
