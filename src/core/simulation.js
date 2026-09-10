import { Pool } from './pool.js';
import { createSpatialHash } from './spatialHash.js';

export function createSimulation() {
  const pools = {
    enemies: new Pool(() => ({ alive: false }), 1400),
    projs: new Pool(() => ({ alive: false, hitIds: [] }), 600),
    ebul: new Pool(() => ({ alive: false }), 500),
    drops: new Pool(() => ({ alive: false }), 900),
    fxs: new Pool(() => ({ alive: false }), 500),
    texts: new Pool(() => ({ alive: false }), 200),
  };
  const spatial = createSpatialHash(pools.enemies);
  return { pools, spatial, G: null, meta: { shards: 0, lv: {} }, onBanner: null };
}
