export async function loadMeta(meta) {
  try { const raw = localStorage.getItem('arc-meta'); if (raw) { const m = JSON.parse(raw); meta.shards = m.shards || 0; meta.lv = m.lv || {}; } } catch (e) { /* 저장소 없음: 세션 내 유지 */ }
}
export async function saveMeta(meta) { try { localStorage.setItem('arc-meta', JSON.stringify(meta)); } catch (e) { /* 무시 */ } }
