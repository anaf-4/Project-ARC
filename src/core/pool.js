// 생성/소멸이 잦은 모든 엔티티는 풀에서 꺼내 쓰고 되돌려 GC 스파이크를 막는다.
export class Pool {
  constructor(factory, n) { this.factory = factory; this.free = []; this.live = []; for (let i = 0; i < n; i++) this.free.push(factory()); }
  get() { const o = this.free.pop() || this.factory(); o.alive = true; this.live.push(o); return o; }
  compact() { const l = this.live; let j = 0; for (let i = 0; i < l.length; i++) { const o = l[i]; if (o.alive) l[j++] = o; else this.free.push(o); } l.length = j; }
  clear() { for (const o of this.live) { o.alive = false; this.free.push(o); } this.live.length = 0; }
}
export const enemies = new Pool(() => ({ alive: false }), 1400);
export const projs = new Pool(() => ({ alive: false, hitIds: [] }), 600);
export const ebul = new Pool(() => ({ alive: false }), 500);
export const drops = new Pool(() => ({ alive: false }), 900);
export const fxs = new Pool(() => ({ alive: false }), 500);
export const texts = new Pool(() => ({ alive: false }), 200);
