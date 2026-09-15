export const CLASSES = {
  vanguard: { name: '뱅가드', role: '전사형', sigil: 'V', color: '#ffa94d', hp: 150, armor: 2, speed: 150, weapon: 'blade',
    desc: '근접 범위 공격 특화. 높은 기본 체력과 방어력.', traits: '체력 150, 방어력 +2' },
  sniper: { name: '스나이퍼', role: '원거리형', sigil: 'S', color: '#5ec8ff', hp: 90, speed: 165, crit: 0.15, cdMul: 0.9, critGrowth: 1.5, weapon: 'rail',
    desc: '일직선 관통 탄막. 치명타와 공격 속도 성장에 유리.', traits: '치명타 +15%, 쿨다운 -10%, 조준경 효율 1.5배' },
  medic: { name: '메딕', role: '지원형', sigil: 'M', color: '#63f5a8', hp: 105, speed: 160, regen: 0.5, magnetMul: 1.3, aura: true, weapon: 'wand',
    desc: '주변 아군의 체력 재생과 획득 범위를 늘리는 오라.', traits: '치유 오라 반경 190, 획득 범위 +30%' },
  pyro: { name: '피로맨서', role: '마법사형', sigil: 'P', color: '#ff6b6b', hp: 100, speed: 155, areaMul: 1.2, explosiveMul: 1.3, weapon: 'fireball',
    desc: '광역 화염 도트와 폭발형 무기 숙련.', traits: '범위 +20%, 폭발형 무기 피해 +30%' },
};

// lv: 레벨 1~5 스탯, evoS: 진화 스탯. n = 발사 수 / 개수
export const WEAPONS = {
  blade: { name: '파워 블레이드', icon: 'weapon_blade', pair: 'guard', melee: true, evo: '대지 분쇄자', evoIcon: 'evo_blade',
    desc: '가까운 적 방향으로 넓게 베어냅니다.', evoDesc: '주변 전체를 가르는 충격파와 강한 넉백.',
    lv: [{ dmg: 14, cd: 1.25, r: 72, n: 1 }, { dmg: 18, cd: 1.15, r: 80, n: 1 }, { dmg: 22, cd: 1.05, r: 86, n: 2 }, { dmg: 28, cd: 0.95, r: 94, n: 2 }, { dmg: 36, cd: 0.85, r: 104, n: 2 }],
    evoS: { dmg: 60, cd: 0.8, r: 155, n: 1 } },
  rail: { name: '관통 레일건', icon: 'weapon_rail', pair: 'scope', comboWith: 'thunder', evo: '궤도 레일캐논', evoIcon: 'evo_rail',
    desc: '가장 가까운 적에게 관통탄을 발사합니다.', evoDesc: '화면을 꿰뚫는 레이저 빔을 다발로 발사.',
    lv: [{ dmg: 11, cd: 1.0, n: 1, pierce: 2 }, { dmg: 14, cd: 0.95, n: 1, pierce: 3 }, { dmg: 17, cd: 0.9, n: 2, pierce: 3 }, { dmg: 21, cd: 0.8, n: 2, pierce: 4 }, { dmg: 26, cd: 0.7, n: 3, pierce: 5 }],
    evoS: { dmg: 48, cd: 1.1, n: 3, len: 1100, w: 14 } },
  wand: { name: '마법봉', icon: 'weapon_wand', pair: 'book', evo: '연쇄 천벌의 폭풍', evoIcon: 'evo_wand',
    desc: '가까운 적들에게 마력탄을 날립니다.', evoDesc: '적 사이를 연쇄로 튀는 번개 폭풍.',
    lv: [{ dmg: 10, cd: 0.9, n: 1 }, { dmg: 12, cd: 0.85, n: 2 }, { dmg: 15, cd: 0.8, n: 2 }, { dmg: 18, cd: 0.7, n: 3 }, { dmg: 22, cd: 0.6, n: 3 }],
    evoS: { dmg: 34, cd: 0.95, n: 2, jumps: 4, jr: 210 } },
  fireball: { name: '화염구', icon: 'weapon_fireball', pair: 'catalyst', evo: '초신성', evoIcon: 'evo_fireball', explosive: true,
    desc: '적에게 닿으면 폭발하고 불태웁니다.', evoDesc: '거대한 폭발 뒤 불타는 장판을 남깁니다.',
    lv: [{ dmg: 16, cd: 1.35, n: 1, r: 50 }, { dmg: 20, cd: 1.3, n: 1, r: 53 }, { dmg: 24, cd: 1.25, n: 2, r: 57 }, { dmg: 30, cd: 1.2, n: 2, r: 62 }, { dmg: 37, cd: 1.1, n: 3, r: 68 }],
    evoS: { dmg: 50, cd: 1.2, n: 3, r: 100, zone: true } },
  orbit: { name: '오비탈 코어', icon: 'weapon_orbit', pair: 'boots', evo: '은하 궤도', evoIcon: 'evo_orbit',
    desc: '주위를 도는 코어가 일정 시간 적을 갈아냅니다.', evoDesc: '코어가 멈추지 않고 영구히 회전합니다.',
    lv: [{ dmg: 9, cd: 1.6, n: 2, dur: 3, r: 70 }, { dmg: 11, cd: 1.5, n: 2, dur: 3.3, r: 72 }, { dmg: 13, cd: 1.4, n: 3, dur: 3.6, r: 76 }, { dmg: 15, cd: 1.3, n: 3, dur: 4, r: 80 }, { dmg: 18, cd: 1.2, n: 4, dur: 4.5, r: 84 }],
    evoS: { dmg: 26, cd: 0, n: 6, dur: 0, r: 100 } },
  aura: { name: '열기 오라', icon: 'weapon_aura', pair: 'guard', melee: true, evo: '불사조의 가호', evoIcon: 'evo_aura',
    desc: '주변 적에게 0.5초마다 열기 피해를 줍니다.', evoDesc: '넓은 화염장. 적을 태울 때마다 체력 회복.',
    lv: [{ dmg: 5, r: 62 }, { dmg: 7, r: 70 }, { dmg: 9, r: 78 }, { dmg: 11, r: 86 }, { dmg: 14, r: 96 }],
    evoS: { dmg: 20, r: 140 } },
  boomerang: { name: '칼날 부메랑', icon: 'weapon_boomerang', pair: 'magazine', evo: '무한 회전날', evoIcon: 'evo_boomerang',
    desc: '던지면 돌아오는 칼날. 모든 적을 관통합니다.', evoDesc: '사방으로 거대한 회전날을 흩뿌립니다.',
    lv: [{ dmg: 12, cd: 1.5, n: 1 }, { dmg: 15, cd: 1.4, n: 1 }, { dmg: 18, cd: 1.3, n: 2 }, { dmg: 22, cd: 1.2, n: 2 }, { dmg: 26, cd: 1.1, n: 3 }],
    evoS: { dmg: 36, cd: 1.0, n: 5, size: 1.7 } },
  thunder: { name: '낙뢰', icon: 'weapon_thunder', pair: 'magnet', evo: '뇌신의 심판', evoIcon: 'evo_thunder', explosive: true,
    desc: '주변 무작위 적에게 번개를 떨어뜨립니다.', evoDesc: '번개가 폭우처럼 쏟아지고 옆 적에게 튑니다.',
    lv: [{ dmg: 18, cd: 2.0, n: 2, r: 40 }, { dmg: 22, cd: 1.9, n: 2, r: 44 }, { dmg: 28, cd: 1.8, n: 3, r: 48 }, { dmg: 34, cd: 1.6, n: 3, r: 52 }, { dmg: 40, cd: 1.4, n: 4, r: 58 }],
    evoS: { dmg: 55, cd: 1.2, n: 8, r: 80 } },
  trap: { name: '에테르 지뢰', icon: 'weapon_trap', pair: 'rune', evo: '지뢰밭 통제', evoIcon: 'evo_trap',
    desc: '이동하며 주기적으로 바닥에 지뢰를 설치합니다. 밟은 적을 계속 태웁니다.', evoDesc: '지뢰가 더 크고 오래 남고, 더 자주 설치됩니다.',
    lv: [{ dmg: 7, cd: 1.8, r: 46, life: 4 }, { dmg: 9, cd: 1.7, r: 50, life: 4.4 }, { dmg: 11, cd: 1.6, r: 55, life: 4.8 }, { dmg: 14, cd: 1.5, r: 60, life: 5.2 }, { dmg: 17, cd: 1.3, r: 66, life: 5.6 }],
    evoS: { dmg: 26, cd: 0.9, r: 90, life: 8 } },
};
export const STAT_LABEL = { dmg: '피해', cd: '쿨다운', n: '개수', r: '범위', pierce: '관통', dur: '지속' };

export const PASSIVES = {
  heart: { name: '강철 심장', icon: 'p_heart', desc: '최대 체력 +20', apply: (s, l) => { s.maxHp += 20 * l; } },
  scope: { name: '조준경', icon: 'p_scope', desc: '치명타 확률 +6%', apply: (s, l) => { s.crit += 0.06 * l * s.critGrowth; } },
  book: { name: '지혜의 책', icon: 'p_book', desc: '무기 쿨다운 -8%', apply: (s, l) => { s.cdMul *= 1 - 0.08 * l; } },
  catalyst: { name: '촉매', icon: 'p_catalyst', desc: '공격 범위 +10%', apply: (s, l) => { s.areaMul *= 1 + 0.1 * l; } },
  boots: { name: '가속 부츠', icon: 'p_boots', desc: '이동, 투사체 속도 +8%', apply: (s, l) => { s.speed *= 1 + 0.08 * l; s.projSpeed *= 1 + 0.08 * l; } },
  regen: { name: '재생 결정', icon: 'p_regen', desc: '초당 체력 재생 +0.4', apply: (s, l) => { s.regen += 0.4 * l; } },
  guard: { name: '결전 태세', icon: 'p_guard', desc: '근접 무기 범위 +12%', apply: (s, l) => { s.meleeRangeMul *= 1 + 0.12 * l; } },
  magazine: { name: '탄창', icon: 'p_magazine', desc: '투사체 수 +1, Lv 4부터 +2', apply: (s, l) => { s.amount += l >= 4 ? 2 : 1; } },
  magnet: { name: '에테르 자석', icon: 'p_magnet', desc: '획득 범위 +25%', apply: (s, l) => { s.magnet *= 1 + 0.25 * l; } },
  rune: { name: '힘의 룬', icon: 'p_rune', desc: '모든 피해 +10%', apply: (s, l) => { s.dmgMul *= 1 + 0.1 * l; } },
};

export const META = [
  { id: 'hp', name: '생명력', icon: 'm_hp', desc: '최대 체력 +10', max: 5, apply: (s, l) => { s.maxHp += 10 * l; } },
  { id: 'might', name: '공격력', icon: 'm_might', desc: '모든 피해 +5%', max: 5, apply: (s, l) => { s.dmgMul *= 1 + 0.05 * l; } },
  { id: 'swift', name: '기동력', icon: 'm_swift', desc: '이동 속도 +4%', max: 5, apply: (s, l) => { s.speed *= 1 + 0.04 * l; } },
  { id: 'greed', name: '성장', icon: 'm_greed', desc: '경험치 획득 +6%', max: 5, apply: (s, l) => { s.xpMul *= 1 + 0.06 * l; } },
  { id: 'grip', name: '인력', icon: 'm_grip', desc: '획득 범위 +10%', max: 5, apply: (s, l) => { s.magnet *= 1 + 0.1 * l; } },
  { id: 'medkit', name: '구급 훈련', icon: 'm_medkit', desc: '동료 부활 속도 +15%', max: 5, apply: (s, l) => { s.reviveMul *= 1 + 0.15 * l; } },
  { id: 'reroll', name: '재추첨', icon: 'm_reroll', desc: '레벨업 다시 뽑기 +1회', max: 3, baseCost: 300, apply: () => { } },
];
export const metaCost = (m, l) => Math.floor((m.baseCost || 25) * Math.pow(1.7, l));

export const ETYPES = {
  slime: { hp: 9, speed: 52, r: 11, dmg: 5, xp: 1, color: '#7d5cff', edge: '#3b2a8a', shape: 'circle' },
  bat: { hp: 6, speed: 98, r: 8, dmg: 4, xp: 1, color: '#d46bff', edge: '#6a2a80', shape: 'diamond' },
  golem: { hp: 40, speed: 38, r: 17, dmg: 10, xp: 4, color: '#9c7b62', edge: '#4a372a', shape: 'square' },
  spitter: { hp: 16, speed: 44, r: 12, dmg: 6, xp: 3, color: '#ffcf5c', edge: '#8a6a12', shape: 'circle', ranged: true },
  wraith: { hp: 24, speed: 84, r: 12, dmg: 8, xp: 3, color: '#5cf2ff', edge: '#1d6a78', shape: 'tri' },
  boss: { hp: 1, speed: 70, r: 40, dmg: 25, xp: 80, color: '#ff5277', edge: '#7a1030', shape: 'boss' },
};
export const ENEMY_KINDS = ['slime', 'bat', 'golem', 'spitter', 'wraith'];
export const BOSSES = [
  { name: '공허 파수꾼', hp: 1700, r: 40, color: '#ff5277', speed: 72, burst: 16, burstCd: 4.5 },
  { name: '에테르 거신', hp: 4800, r: 48, color: '#ff8a3d', speed: 66, burst: 22, burstCd: 4.0 },
  { name: '아크 코어', hp: 13000, r: 58, color: '#6ff3e8', speed: 62, burst: 30, burstCd: 3.2, final: true },
];
export const ENEMY_CAP = 1200;
export const REVIVE_TIME = 3;
export const BOT_NAMES = ['노바', '베가', '에코'];
export const xpNeed = l => Math.floor(5 + l * 4.2 + l * l * 0.26);
