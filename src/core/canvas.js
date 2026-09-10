export const cv = document.getElementById('game');
export const ctx = cv.getContext('2d');
export let W = 0, H = 0, DPR = 1;
export function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize); resize();
