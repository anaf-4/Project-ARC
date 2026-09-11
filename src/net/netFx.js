// Client-side playback of one-shot visual effects broadcast by the
// multiplayer server (see GameRoom.js's sim.onFx wiring). render.js's
// drawFx() already knows how to draw every fx kind from solo play — this
// just feeds it a locally-ticking list built from 'fx' network messages,
// since the server never syncs the fx pool as persistent state.
const list = [];

export function pushFx(msg) {
  list.push({
    alive: true, kind: msg.kind, x: msg.x, y: msg.y, t: 0, life: msg.life || 0.3,
    r: msg.r || 0, a: msg.a || 0, half: msg.half || 0, w: msg.w || 0,
    color: msg.color || '#fff', pts: msg.pts || null,
    // drawFx() reads `f.owner || f` for position — a plain {x,y} snapshot
    // stands in for the sim player object solo play would pass here.
    owner: (msg.ox != null && msg.oy != null) ? { x: msg.ox, y: msg.oy } : null,
  });
}

export function updateNetFx(dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    f.t += dt;
    if (f.t >= f.life) list.splice(i, 1);
  }
}

export function getNetFx() {
  return list;
}
