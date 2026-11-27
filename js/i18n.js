// English / Korean text. Pokémon, move, type and item names use the official Korean names.

export const I18N = { lang: 'en' };
export const LANGS = { en: 'English', ko: '한국어' };

const STR = {
  en: {
    play: 'Play', online: 'Online Multiplayer', sandbox: 'Sandbox', settings: 'Settings', credits: 'Credits',
    comingSoon: 'Coming soon.', close: 'Close', back: 'Back', select: 'Select', confirm: 'Confirm', changeTab: 'Tab',
    language: 'Language', noZoom: 'Prevent double-tap zoom', sound: 'Sound', on: 'On', off: 'Off',
    teamSetup: 'Team Setup', mode: 'Mode', lobby: 'Lobby', battle: 'Battle!', edit: 'Edit', random: 'Random',
    player: 'Player', cpu: 'CPU', vs: 'VS',
    cpuHint: 'Controlled by the CPU', touchHint: 'Touch controls',
    keysHint: '{keys} move · {dodge} dodge', swapHint: ' · {swap} switch', padHint: ' · gamepad',
    team0: 'Blue team', team1: 'Pink team',
    m_showdown: 'Showdown', m_trio: 'Trio', m_duo: '2vs2 Showdown',
    d_showdown: 'One Pokémon each. Last one standing wins.',
    d_trio: 'Parties of three. When one faints the next is sent out. You can switch.',
    d_duo: 'Four players in two teams. Knock out both opponents.',
    pokemon: 'Pokémon', partyPos: 'Pokémon {n}/{m}', done: 'Done',
    t_Stats: 'Stats', t_Skills: 'Skills', t_Equipment: 'Equipment', t_Personality: 'Personality',
    s_hp: 'HP', s_atk: 'Attack', s_def: 'Defense', s_spa: 'Sp. Atk', s_spd: 'Sp. Def', s_spe: 'Speed',
    total: 'Total', arenaHp: 'Arena HP', item: 'Item', none: 'None', noItem: 'No item', noItemDesc: 'Fight without a held item.',
    phys: 'Phys', spec: 'Spec', Physical: 'Physical', Special: 'Special',
    b_projectile: 'Projectile', b_beam: 'Beam', b_melee: 'Melee', b_dash: 'Dash', b_targetArea: 'Area', b_burst: 'Burst', b_vanish: 'Vanish',
    menu: 'Menu', resume: 'Resume', changeTeams: 'Change teams', rematch: 'Rematch',
    winsPlayer: 'Player {n} wins!', winsTeam: '{team} wins!',
    r_damage: 'Damage dealt', r_casts: 'Moves used', r_hits: 'Hits landed', r_dodges: 'Dodges', r_supers: 'Super effective',
    dodge: 'Dodge', switch: 'Switch', dodged: 'Dodged!', revived: 'Revived!',
    loading: 'Now loading...', rotate: 'Turn your phone sideways for 2 players.',
    // battle log
    used: '{who} used {move}!', superEff: "It's super effective!", notVery: "It's not very effective...",
    noEffect: "It doesn't affect {who}...", crit: 'A critical hit!', fainted: '{who} fainted!',
    recoil: '{who} is hurt by recoil!', comeBack: 'Come back, {a}! Go, {b}!', sentOut: 'Go, {who}!',
    sudden: 'Sudden death! All damage is doubled.',
    sitrus: "{who}'s {item} restored {n} HP!", reviveLog: '{who} was revived by its {item}!',
    // credits
    cr_sprites: 'Sprites & portraits', cr_spritesText: 'PMDCollab/SpriteCollab (CC BY-NC 4.0) by CHUNSOFT and the PMDCollab artists. Every artist is listed in CREDITS.md.',
    cr_vfx: 'Move effects', cr_vfxText: 'Particle and beam sheets from PMDCollab/RawAsset, the asset repo of PMD: Origins.',
    cr_ui: 'Windows, fonts & items', cr_uiText: 'PMD: Origins (DumpAsset, RawAsset). Korean text uses the Galmuri font by Lee Minseo (OFL).',
    cr_data: 'Stats, moves, type chart', cr_dataText: '@pkmn/dex (Pokémon Showdown data).',
    cr_legal: 'Non-commercial fan project. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc. Not affiliated or endorsed.',
  },
  ko: {
    play: '플레이', online: '온라인 대전', sandbox: '샌드박스', settings: '설정', credits: '크레딧',
    comingSoon: '준비 중입니다.', close: '닫기', back: '뒤로', select: '선택', confirm: '결정', changeTab: '탭',
    language: '언어', noZoom: '더블탭 확대 방지', sound: '사운드', on: '켜짐', off: '꺼짐',
    teamSetup: '팀 편성', mode: '모드', lobby: '로비', battle: '배틀 시작!', edit: '편집', random: '랜덤',
    player: '플레이어', cpu: 'CPU', vs: 'VS',
    cpuHint: 'CPU가 조종합니다', touchHint: '터치 조작',
    keysHint: '{keys} 이동 · {dodge} 회피', swapHint: ' · {swap} 교체', padHint: ' · 게임패드',
    team0: '블루 팀', team1: '핑크 팀',
    m_showdown: '쇼다운', m_trio: '트리오', m_duo: '2대2 쇼다운',
    d_showdown: '포켓몬 한 마리씩. 마지막까지 남으면 승리.',
    d_trio: '3마리 파티. 쓰러지면 다음 포켓몬이 나온다. 교체할 수 있다.',
    d_duo: '4명이 두 팀으로 나뉜다. 상대 둘을 모두 쓰러뜨리자.',
    pokemon: '포켓몬', partyPos: '{n}/{m}번째', done: '완료',
    t_Stats: '능력치', t_Skills: '기술', t_Equipment: '도구', t_Personality: '성격',
    s_hp: 'HP', s_atk: '공격', s_def: '방어', s_spa: '특수공격', s_spd: '특수방어', s_spe: '스피드',
    total: '합계', arenaHp: '배틀 HP', item: '도구', none: '없음', noItem: '도구 없음', noItemDesc: '도구를 지니지 않고 싸운다.',
    phys: '물리', spec: '특수', Physical: '물리', Special: '특수',
    b_projectile: '발사체', b_beam: '빔', b_melee: '근접', b_dash: '돌진', b_targetArea: '범위', b_burst: '폭발', b_vanish: '순간이동',
    menu: '메뉴', resume: '계속하기', changeTeams: '팀 변경', rematch: '재대결',
    winsPlayer: '플레이어 {n} 승리!', winsTeam: '{team} 승리!',
    r_damage: '준 데미지', r_casts: '사용한 기술', r_hits: '명중', r_dodges: '회피', r_supers: '효과 굉장',
    dodge: '회피', switch: '교체', dodged: '회피!', revived: '부활!',
    loading: '로딩 중...', rotate: '2인 플레이는 휴대폰을 가로로 돌려 주세요.',
    used: '{who}의 {move}!', superEff: '효과가 굉장했다!', notVery: '효과가 별로인 듯하다...',
    noEffect: '{who}에게는 효과가 없는 것 같다...', crit: '급소에 맞았다!', fainted: '{who}{eun} 쓰러졌다!',
    recoil: '{who}{eun} 반동으로 데미지를 입었다!', comeBack: '돌아와, {a}! 가랏, {b}!', sentOut: '가랏, {who}!',
    sudden: '서든데스! 모든 데미지가 2배가 된다.',
    sitrus: '{who}의 {item}! HP를 {n} 회복했다!', reviveLog: '{who}의 {item}! 쓰러지지 않고 부활했다!',
    cr_sprites: '스프라이트 & 초상화', cr_spritesText: 'PMDCollab/SpriteCollab (CC BY-NC 4.0) — CHUNSOFT와 PMDCollab 아티스트들. 모든 아티스트는 CREDITS.md에 있습니다.',
    cr_vfx: '기술 이펙트', cr_vfxText: 'PMD: Origins의 에셋 저장소 PMDCollab/RawAsset의 파티클과 빔 시트.',
    cr_ui: '창, 폰트 & 도구', cr_uiText: 'PMD: Origins (DumpAsset, RawAsset). 한국어는 이민서 님의 갈무리 폰트(OFL)를 사용합니다.',
    cr_data: '능력치, 기술, 타입 상성', cr_dataText: '@pkmn/dex (포켓몬 쇼다운 데이터).',
    cr_legal: '비상업적 팬 프로젝트입니다. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc. 공식과 무관합니다.',
  },
};

const MON_KO = {
  rayquaza: '레쿠쟈', lucario: '루카리오', garchomp: '한카리아스', gengar: '팬텀', mewtwo: '뮤츠',
  charizard: '리자몽', blastoise: '거북왕', venusaur: '이상해꽃', pikachu: '피카츄', dialga: '디아루가',
  palkia: '펄기아', giratina: '기라티나', blaziken: '번치코', gardevoir: '가디안', metagross: '메타그로스',
  tyranitar: '마기라스', eevee: '이브이', snorlax: '잠만보', dragonite: '망나뇽', umbreon: '블래키',
};

const MOVE_KO = {
  airslash: '에어슬래시', dragonpulse: '용의파동', hyperbeam: '파괴광선', dracometeor: '용성군', bulletpunch: '불릿펀치',
  aurasphere: '파동탄', flashcannon: '러스터캐논', closecombat: '인파이트', crunch: '깨물어부수기', dragonrush: '드래곤다이브',
  earthpower: '대지의힘', stoneedge: '스톤에지', lick: '핥기', shadowball: '섀도볼', darkpulse: '악의파동',
  sludgebomb: '오물폭탄', psychocut: '사이코커터', psychic: '사이코키네시스', psychoboost: '사이코부스트',
  flamethrower: '화염방사', dragonclaw: '드래곤크루', fireblast: '불대문자', waterpulse: '물의파동', aquatail: '아쿠아테일',
  hydropump: '하이드로펌프', razorleaf: '잎날가르기', petaldance: '꽃잎댄스', solarbeam: '솔라빔', quickattack: '전광석화',
  thunderbolt: '10만볼트', irontail: '아이언테일', thunder: '번개', metalclaw: '메탈크로우', roaroftime: '시간의포효',
  spacialrend: '아공절단', shadowforce: '섀도다이브', skyuppercut: '스카이업퍼', blazekick: '브레이즈킥',
  flareblitz: '플레어드라이브', moonblast: '문포스', focusblast: '기합구슬', zenheadbutt: '사념의박치기',
  meteormash: '코멧펀치', earthquake: '지진', rockslide: '스톤샤워', swift: '스피드스타', bite: '물기',
  bodyslam: '누르기', gigaimpact: '기가임팩트', wingattack: '날개치기', outrage: '역린', feintattack: '속여때리기',
  payback: '보복',
};

const TYPE_KO = {
  Normal: '노말', Fire: '불꽃', Water: '물', Grass: '풀', Electric: '전기', Ice: '얼음', Fighting: '격투', Poison: '독',
  Ground: '땅', Flying: '비행', Psychic: '에스퍼', Bug: '벌레', Rock: '바위', Ghost: '고스트', Dragon: '드래곤',
  Dark: '악', Steel: '강철', Fairy: '페어리',
};

/** Korean topic particle 은/는 for the last syllable of a word. */
function eun(word) {
  const c = String(word).replace(/<[^>]*>/g, '').trim().slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? '은' : '는';
  return '은(는)';
}

export function t(key, vars = {}) {
  const s = STR[I18N.lang][key] ?? STR.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k === 'eun' ? eun(vars.who ?? '') : vars[k] ?? ''));
}

const ko = () => I18N.lang === 'ko';
export const monName = (key, fallback) => (ko() && MON_KO[key]) || fallback;
export const moveName = (id, fallback) => (ko() && MOVE_KO[id]) || fallback;
export const typeName = (type) => (ko() && TYPE_KO[type]) || type;
export const itemName = (it) => (ko() ? it.nameKo : it.name);
export const itemDesc = (it) => (ko() ? it.descKo : it.desc);
