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
    gameMode: 'Game mode', rules: 'Rules',
    rule_standard: 'Standard', rule_balanced: 'Balanced', rule_legend: 'All Legendary', rule_random: 'Random Battle', rule_mirror: 'Mirror Match',
    mirrorTag: 'Mirror', lockLegend: 'Only one legendary per team', onlyLegend: 'Legendary Pokémon only', mystery: '???',
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
    // customization
    nature: 'Nature', ability: 'Ability', statPoints: 'Stat Points', reset: 'Reset', resetBuild: 'Reset to default',
    base: 'Base', spLeft: '{n} left', skillOrder: 'Skill 1 has priority, then 2, 3, 4.', learnable: 'Learnable skills ({n})', slotN: 'Skill {n}',
    Status: 'Status', stat: 'Status', b_self: 'Self', cooldown: 'Cooldown', power: 'Power', neutral: 'neutral', extraTag: 'Special',
    s_crit: 'critical-hit ratio', sh_atk: 'Atk', sh_def: 'Def', sh_spa: 'SpA', sh_spd: 'SpD', sh_spe: 'Spe', sh_crit: 'Crit', sh_hp: 'HP',
    natureUp: '+10% {stat}', natureDown: '−10% {stat}',
    // effects (battle log)
    statUp: "{who}'s {stat} rose!", statUp2: "{who}'s {stat} rose sharply!", statDown: "{who}'s {stat} fell!", statDown2: "{who}'s {stat} harshly fell!",
    st_brn: '{who} was burned!', st_psn: '{who} was poisoned!', st_tox: '{who} was badly poisoned!', st_par: '{who} is paralyzed!',
    st_slp: '{who} fell asleep!', st_frz: '{who} was frozen solid!', st_confusion: '{who} became confused!', st_flinch: '{who} flinched!',
    stn_brn: 'BRN', stn_psn: 'PSN', stn_tox: 'PSN', stn_par: 'PAR', stn_slp: 'SLP', stn_frz: 'FRZ', stn_confusion: 'Confused', stn_flinch: 'Flinch',
    wokeUp: '{who} woke up!', thawed: '{who} thawed out!', fullPara: "{who} is paralyzed! It can't move!", hitSelf: 'It hurt itself in its confusion!',
    protectLog: '{who} protected itself!', protected: 'Protected!', healLog: '{who} restored HP!', mustRecharge: '{who} must recharge!',
    knockedOff: "{who} lost its {item}!", missed: 'Miss', avoided: '{who} avoided the attack!', failed: 'Failed', traced: '{who} traced {ability}!',
    w_raindance: 'It started to rain!', w_sunnyday: 'The sunlight turned harsh!', w_sandstorm: 'A sandstorm kicked up!',
    w_end_raindance: 'The rain stopped.', w_end_sunnyday: 'The sunlight faded.', w_end_sandstorm: 'The sandstorm subsided.',
    wn_raindance: 'Rain', wn_sunnyday: 'Sun', wn_sandstorm: 'Sandstorm',
    // move effect descriptions (generated from the move data)
    e_chance: '{n}% chance: {what}', e_brn: 'burn', e_psn: 'poison', e_tox: 'bad poison', e_par: 'paralysis', e_slp: 'sleep', e_frz: 'freeze',
    e_confusion: 'confusion', e_flinch: 'flinch (interrupts a wind-up)', e_foe: "foe's {stats}", e_self: 'own {stats}',
    e_drain: 'Heals {n}% of the damage dealt', e_recoil: 'Recoil: {n}% of the damage dealt', e_crit: 'High critical-hit ratio',
    e_priority: 'Priority: winds up faster', e_recharge: 'Must rest 1.2 s afterwards', e_locked: 'Keeps raging for 2 more uses, then confused',
    e_heal: 'Restores {n}% HP', e_weather: 'Weather for 20 s: {w}', e_buff: 'Timed buff (20 s): {stats}', e_inflict: 'Inflicts {what}',
    e_switch: 'Switches out after hitting (Trio)', e_none: 'No extra effect.',
    rain_d: 'Water ×1.5, Fire ×0.5', sun_d: 'Fire ×1.5, Water ×0.5', sand_d: '1% HP/s to non Rock/Ground/Steel; Rock Sp. Def ×1.5',
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
    gameMode: '게임 모드', rules: '룰',
    rule_standard: '스탠다드', rule_balanced: '밸런스', rule_legend: '전설 대결', rule_random: '랜덤 배틀', rule_mirror: '미러 매치',
    mirrorTag: '미러', lockLegend: '전설의 포켓몬은 팀에 한 마리만', onlyLegend: '전설의 포켓몬만 가능', mystery: '???',
    pokemon: '포켓몬', partyPos: '{n}/{m}번째', done: '완료',
    t_Stats: '능력치', t_Skills: '기술', t_Equipment: '도구', t_Personality: '성격·특성',
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
    // customization
    nature: '성격', ability: '특성', statPoints: '능력 포인트', reset: '초기화', resetBuild: '기본값으로',
    base: '종족값', spLeft: '남은 포인트 {n}', skillOrder: '1번 기술이 가장 먼저, 그다음 2, 3, 4번.', learnable: '배울 수 있는 기술 ({n})', slotN: '기술 {n}',
    Status: '변화', stat: '변화', b_self: '자신', cooldown: '쿨타임', power: '위력', neutral: '보정 없음', extraTag: '특수',
    s_crit: '급소율', sh_atk: '공격', sh_def: '방어', sh_spa: '특공', sh_spd: '특방', sh_spe: '스피드', sh_crit: '급소', sh_hp: 'HP',
    natureUp: '{stat} +10%', natureDown: '{stat} −10%',
    statUp: '{who}의 {stat} 상승!', statUp2: '{who}의 {stat} 크게 상승!', statDown: '{who}의 {stat} 하락!', statDown2: '{who}의 {stat} 크게 하락!',
    st_brn: '{who}{eun} 화상을 입었다!', st_psn: '{who}{eun} 독에 걸렸다!', st_tox: '{who}{eun} 맹독에 걸렸다!', st_par: '{who}{eun} 마비되었다!',
    st_slp: '{who}{eun} 잠들었다!', st_frz: '{who}{eun} 얼어붙었다!', st_confusion: '{who}{eun} 혼란에 빠졌다!', st_flinch: '{who}{eun} 풀죽었다!',
    stn_brn: '화상', stn_psn: '독', stn_tox: '맹독', stn_par: '마비', stn_slp: '잠듦', stn_frz: '얼음', stn_confusion: '혼란', stn_flinch: '풀죽음',
    wokeUp: '{who}{eun} 눈을 떴다!', thawed: '{who}의 얼음이 녹았다!', fullPara: '{who}{eun} 몸이 저려서 움직일 수 없다!', hitSelf: '영문도 모른 채 자신을 공격했다!',
    protectLog: '{who}{eun} 방어 태세에 들어갔다!', protected: '방어!', healLog: '{who}의 HP가 회복되었다!', mustRecharge: '{who}{eun} 반동으로 움직일 수 없다!',
    knockedOff: '{who}의 {item}을(를) 떨어뜨렸다!', missed: '빗나감', avoided: '{who}에게는 맞지 않았다!', failed: '실패', traced: '{who}{eun} {ability}을(를) 트레이스했다!',
    w_raindance: '비가 내리기 시작했다!', w_sunnyday: '햇살이 강해졌다!', w_sandstorm: '모래바람이 불기 시작했다!',
    w_end_raindance: '비가 그쳤다.', w_end_sunnyday: '햇살이 약해졌다.', w_end_sandstorm: '모래바람이 가라앉았다.',
    wn_raindance: '비', wn_sunnyday: '쾌청', wn_sandstorm: '모래바람',
    e_chance: '{n}% 확률로 {what}', e_brn: '화상', e_psn: '독', e_tox: '맹독', e_par: '마비', e_slp: '잠듦', e_frz: '얼음',
    e_confusion: '혼란', e_flinch: '풀죽음 (준비 중인 공격을 끊는다)', e_foe: '상대 {stats}', e_self: '자신의 {stats}',
    e_drain: '준 데미지의 {n}%만큼 회복', e_recoil: '반동: 준 데미지의 {n}%', e_crit: '급소에 맞기 쉽다',
    e_priority: '선제공격: 빠르게 발동', e_recharge: '사용 후 1.2초 동안 쉬어야 한다', e_locked: '2번 더 연속으로 쓴 뒤 혼란에 빠진다',
    e_heal: 'HP를 {n}% 회복', e_weather: '20초 동안 날씨: {w}', e_buff: '20초 버프: {stats}', e_inflict: '상대를 {what} 상태로 만든다',
    e_switch: '공격 후 교체된다 (트리오)', e_none: '추가 효과 없음.',
    rain_d: '물 ×1.5, 불꽃 ×0.5', sun_d: '불꽃 ×1.5, 물 ×0.5', sand_d: '바위·땅·강철 외 매초 HP 1%, 바위 특방 ×1.5',
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
  gyarados: '갸라도스', alakazam: '후딘', machamp: '괴력몬', lapras: '라프라스', scizor: '핫삼',
  typhlosion: '블레이범', sceptile: '나무킹', swampert: '대짱이', infernape: '초염몽', salamence: '보만다',
  absol: '앱솔', togekiss: '토게키스', mew: '뮤', jirachi: '지라치', darkrai: '다크라이', greninja: '개굴닌자',
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
  waterfall: '폭포오르기', psybeam: '환상빔', crosschop: '크로스촙', icebeam: '냉동빔', surf: '파도타기',
  xscissor: '시저크로스', ironhead: '아이언헤드', nightslash: '깜짝베기', eruption: '분화', lavaplume: '분연',
  leafblade: '리프블레이드', energyball: '에너지볼', leafstorm: '리프스톰', mudbomb: '진흙폭탄', machpunch: '마하펀치',
  suckerpunch: '기습', megahorn: '메가혼', ancientpower: '원시의힘',
  swordsdance: '칼춤', dragondance: '용의춤', nastyplot: '나쁜음모', calmmind: '명상', bulkup: '벌크업', irondefense: '철벽',
  agility: '고속이동', shellsmash: '껍질깨기', focusenergy: '기충전', willowisp: '도깨비불', thunderwave: '전기자석파', toxic: '맹독',
  darkvoid: '다크홀', confuseray: '이상한빛', recover: 'HP회복', roost: '날개쉬기', moonlight: '달빛', synthesis: '광합성',
  rest: '잠자기', protect: '방어', raindance: '비바라기', sunnyday: '쾌청', sandstorm: '모래바람', firefang: '불꽃엄니',
  icefang: '얼음엄니', thunderfang: '번개엄니', shadowsneak: '야습', extremespeed: '신속', uturn: '유턴', knockoff: '탁쳐서떨구기',
  gigadrain: '기가드레인', drainpunch: '드레인펀치', superpower: '엄청난힘', scald: '열탕',
};

const NATURE_KO = {
  hardy: '노력', lonely: '외로움', brave: '용감', adamant: '고집', naughty: '개구쟁이', bold: '대담', docile: '온순',
  relaxed: '무사태평', impish: '장난꾸러기', lax: '촐랑', timid: '겁쟁이', hasty: '성급', serious: '성실', jolly: '명랑',
  naive: '천진난만', modest: '조심', mild: '의젓', quiet: '냉정', bashful: '수줍음', rash: '덜렁', calm: '차분',
  gentle: '얌전', sassy: '건방', careful: '신중', quirky: '변덕',
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
// Natures / abilities: English names from the data, Korean official names.
export const natureName = (n) => (ko() && NATURE_KO[n.id]) || n.name;
export const abilityName = (id, fallback) => (ko() ? ABILITY_DATA[id]?.ko : null) || fallback || id;
export const abilityDesc = (id) => (ko() ? ABILITY_DATA[id]?.descKo : ABILITY_DATA[id]?.desc) || '';
const ABILITY_DATA = {};
export const setAbilityData = (data) => Object.assign(ABILITY_DATA, data);
