import { readSizeRank as readTraitSizeRank } from '../cards/trait-catalog';
import type { CardAbility } from '../save/card-catalog';
import type { ActiveSkillBattleEffect, BattleCardRuntimeState, BattleRuntimeState } from './types';

export type BattleRuntimeEffectStat = 'attack' | 'hp' | 'dominance';

export type PassiveStatModifier = {
  stat: BattleRuntimeEffectStat;
  value: number;
};

export type PassiveAbilityContext = {
  runtime: BattleRuntimeState;
  source: BattleCardRuntimeState;
  target: BattleCardRuntimeState;
  ability: CardAbility;
  isFrontRowCard: (card: BattleCardRuntimeState) => boolean;
  isBackRowCard: (card: BattleCardRuntimeState) => boolean;
  hasTrait: (card: BattleCardRuntimeState, traitId: string) => boolean;
  hasAnyTrait: (card: BattleCardRuntimeState, traitIds: readonly string[]) => boolean;
};

export type AttackDamageAbilityContext = {
  runtime: BattleRuntimeState;
  attacker: BattleCardRuntimeState;
  target: BattleCardRuntimeState;
  ability: CardAbility;
  isBackRowCard: (card: BattleCardRuntimeState) => boolean;
  getEffectiveHp: (runtime: BattleRuntimeState, card: BattleCardRuntimeState) => number;
};

export type ActiveSkillDefinition = {
  effect: ActiveSkillBattleEffect;
  value: number;
  targetSide: 'ally' | 'enemy';
};

export type PassiveAbilityHandler = (context: PassiveAbilityContext) => PassiveStatModifier | null;

export type AttackDamageAbilityHandler = (context: AttackDamageAbilityContext) => number;

/** 피해 적용 직전에 대상의 SPECIAL 능력이 줄이는 피해량을 계산한다. */
export type DamageReductionAbilityHandler = (context: {
  runtime: BattleRuntimeState;
  target: BattleCardRuntimeState;
  ability: CardAbility;
  damage: number;
}) => number;

export const FRONT_PASSIVE_ABILITY_HANDLERS: Partial<Record<string, PassiveAbilityHandler>> = {
  guardian_stance: ({ source, target, isFrontRowCard }) =>
    source === target && isFrontRowCard(source) ? { stat: 'hp', value: 1 } : null,
  stonehide_stance: ({ source, target, isFrontRowCard }) =>
    source === target && isFrontRowCard(source) ? { stat: 'hp', value: 1 } : null,
  dwarf_hold_ground: ({ source, target, isFrontRowCard }) =>
    source === target && isFrontRowCard(source) ? { stat: 'hp', value: 1 } : null,
  hobgoblin_shield_line: ({ source, target, isFrontRowCard }) =>
    source === target && isFrontRowCard(source) ? { stat: 'attack', value: 1 } : null,
  cockatrice_stone_guard: ({ source, target, isFrontRowCard }) =>
    source === target && isFrontRowCard(source) ? { stat: 'hp', value: 2 } : null,
  pixie_dust_guard: ({ source, target, isFrontRowCard }) =>
    source === target && isFrontRowCard(source) ? { stat: 'hp', value: 3 } : null,
  poltergeist_flying_debris: ({ source, target, isFrontRowCard }) =>
    source === target && isFrontRowCard(source) ? { stat: 'attack', value: 2 } : null,
  nightmare_blazing_vanguard: ({ source, target, isFrontRowCard }) =>
    source === target && isFrontRowCard(source) ? { stat: 'attack', value: 3 } : null,
  omen_dragon_mirrored_fate: ({ source, target, isFrontRowCard }) =>
    source === target && isFrontRowCard(source) ? { stat: 'hp', value: 4 } : null,
};

/** 후위에 있는 동안 다른 카드에 적용되는 지속 능력을 ID별로 해석한다. */
export const BACK_PASSIVE_ABILITY_HANDLERS: Partial<Record<string, PassiveAbilityHandler>> = {
  gnome_traveling_song: ({ source, target, isBackRowCard }) =>
    source !== target && source.side === target.side && isBackRowCard(source)
      ? { stat: 'attack', value: 1 }
      : null,
  goblin_war_chant: ({ source, target, isBackRowCard, hasAnyTrait }) =>
    source !== target &&
    source.side === target.side &&
    isBackRowCard(source) &&
    hasAnyTrait(target, ['goblin', 'hobgoblin'])
      ? { stat: 'attack', value: 1 }
      : null,
  dryad_wounded_grove: ({ source, target, isBackRowCard }) =>
    source !== target &&
    source.side === target.side &&
    target.card.definition.type === 'UNIT' &&
    isBackRowCard(source) &&
    (target.card.instance.hp ?? 0) < (target.card.definition.hp ?? 0)
      ? { stat: 'hp', value: 1 }
      : null,
  grenadier_underdog_mix: ({ source, target, isBackRowCard }) =>
    source !== target &&
    source.side === target.side &&
    target.card.definition.type === 'UNIT' &&
    isBackRowCard(source) &&
    (target.card.definition.attack ?? 0) <= 3
      ? { stat: 'attack', value: 1 }
      : null,
  redcap_bully_support: ({ source, target, isBackRowCard }) =>
    source !== target &&
    source.side === target.side &&
    target.card.definition.type === 'UNIT' &&
    isBackRowCard(source) &&
    (target.card.definition.attack ?? 0) > (source.card.definition.attack ?? 0)
      ? { stat: 'attack', value: 1 }
      : null,
  revenant_wounded_vengeance: ({ source, target, isBackRowCard, hasTrait }) =>
    source !== target &&
    source.side === target.side &&
    target.card.definition.type === 'UNIT' &&
    isBackRowCard(source) &&
    hasTrait(target, 'undead') &&
    (target.card.instance.hp ?? 0) < (target.card.definition.hp ?? 0)
      ? { stat: 'attack', value: 2 }
      : null,
  quetzalcoatlus_wing_command: ({ source, target, isBackRowCard, isFrontRowCard }) =>
    source !== target &&
    source.side === target.side &&
    target.card.definition.type === 'UNIT' &&
    isBackRowCard(source) &&
    isFrontRowCard(target)
      ? { stat: 'dominance', value: 2 }
      : null,
};

export const GLOBAL_PASSIVE_ABILITY_HANDLERS: Partial<Record<string, PassiveAbilityHandler>> = {
  guardian_block: () => null,
  stonewall_guard: () => null,
  silver_chord: ({ source, target, hasTrait }) =>
    source !== target && source.side === target.side && hasTrait(target, 'elf')
      ? { stat: 'attack', value: 1 }
      : null,
  hollow_chorus: ({ source, target, hasTrait }) =>
    source !== target && source.side === target.side && hasTrait(target, 'beast')
      ? { stat: 'attack', value: 1 }
      : null,
  wolf_pack_hunt: ({ source, target, hasTrait }) =>
    source !== target && source.side === target.side && hasTrait(target, 'animal')
      ? { stat: 'attack', value: 1 }
      : null,
  rat_swarm_distraction: ({ source, target, isFrontRowCard }) =>
    source.side !== target.side && isFrontRowCard(target) ? { stat: 'attack', value: -1 } : null,
  hell_hound_finisher_aura: ({ source, target }) =>
    source.side !== target.side &&
    target.card.definition.type === 'UNIT' &&
    (target.card.instance.hp ?? 0) * 2 <= (target.card.definition.hp ?? 0)
      ? { stat: 'attack', value: -1 }
      : null,
  shadow_dominance_drain: ({ source, target }) =>
    source.side !== target.side && target.card.definition.type === 'UNIT'
      ? { stat: 'dominance', value: -1 }
      : null,
  witchwarg_chilling_pressure: ({ source, target }) =>
    source.side !== target.side &&
    target.card.definition.type === 'UNIT' &&
    (target.card.definition.attack ?? 0) >= 4
      ? { stat: 'attack', value: -1 }
      : null,
  wisp_unmoved_dread: ({ source, target }) =>
    source.side !== target.side &&
    target.card.definition.type === 'UNIT' &&
    !target.hasMovedThisTurn &&
    !target.hasAttackedThisTurn
      ? { stat: 'attack', value: -1 }
      : null,
  skeletal_hulk_bone_bulwark: ({ source, target }) =>
    source !== target &&
    source.side === target.side &&
    target.card.definition.type === 'UNIT' &&
    (target.card.definition.hp ?? 0) < (source.card.definition.hp ?? 0)
      ? { stat: 'hp', value: 2 }
      : null,
};

export const SUMMON_ATTACK_BONUS_ABILITY_IDS = new Set(['greenwood_charge', 'iron_spike_charge']);

export const MOVE_ATTACK_BONUS_ABILITY_IDS = new Set(['forest_path', 'mist_stride']);

/** 턴이 지나도 다음 공격까지 유지되는 이동 공격력 보너스를 능력 ID별로 정의한다. */
export const MOVE_NEXT_ATTACK_BONUS_VALUES: Partial<Record<string, number>> = {
  eagle_dive: 1,
  catfolk_pouncing_stride: 2,
  ankhrav_burrow_rush: 2,
  stonecaster_fault_step: 3,
  brimorak_burning_step: 3,
  ankylosaurus_tail_momentum: 4,
  frost_drake_glacial_rush: 5,
};

/** 전열에 도착한 이동에만 다음 공격 보너스를 부여하는 능력 ID다. */
export const MOVE_NEXT_ATTACK_FRONT_ROW_ONLY_ABILITY_IDS = new Set(['catfolk_pouncing_stride']);

/** 등장 위치와 정면으로 맞닿은 적의 공격력을 낮추는 능력 ID다. */
export const SUMMON_OPPOSING_ENEMY_ATTACK_PENALTY_ABILITY_IDS = new Set(['flash_beetle_glare']);

/** 등장 위치와 정면으로 맞닿은 적에게 적용할 피해량을 능력 ID별로 정의한다. */
export const SUMMON_OPPOSING_ENEMY_DAMAGE_VALUES: Partial<Record<string, number>> = {
  goblin_pyro_fireburst: 1,
  athamaru_harpoon_entry: 2,
  gargoyle_ambush_drop: 3,
  flame_drake_eruption: 3,
  hydra_many_maws: 4,
  giant_statue_crushing_entry: 5,
};

/** 퇴각 시 인접한 아군에게 적용할 회복량을 능력 ID별로 정의한다. */
export const RETREAT_ADJACENT_ALLY_HEAL_VALUES: Partial<Record<string, number>> = {
  homunculus_last_service: 1,
  landslide_last_shelter: 3,
  naiad_parting_tide: 5,
};

/** 퇴각 시 모든 적 UNIT에게 적용할 피해량을 능력 ID별로 정의한다. */
export const RETREAT_ALL_ENEMY_DAMAGE_VALUES: Partial<Record<string, number>> = {
  caligni_death_flash: 1,
  cinder_rat_smoke_burst: 2,
  phantom_last_oath: 3,
  mummy_tomb_miasma: 4,
};

export const AFTER_ATTACK_BUFF_ABILITY_IDS = new Set(['leafwind_flurry', 'shadow_blade_flurry']);

/** 공격 해결 뒤 공격자 자신이 회복하는 능력과 회복량이다. */
export const AFTER_ATTACK_SELF_HEAL_VALUES: Partial<Record<string, number>> = {
  unicorn_purifying_charge: 1,
};

/** 공격 해결 뒤 공격자 자신이 다음 자기 턴 종료까지 얻는 HP 보너스다. */
export const AFTER_ATTACK_SELF_HP_BONUS_VALUES: Partial<Record<string, number>> = {
  stegosaurus_guarded_swing: 2,
};

export const BLOCK_ABILITY_IDS = new Set(['guardian_block']);

export const ATTACK_DAMAGE_BONUS_ABILITY_HANDLERS: Partial<
  Record<string, AttackDamageAbilityHandler>
> = {
  moonlit_shot: ({ target, isBackRowCard }) => (isBackRowCard(target) ? 1 : 0),
  eclipse_shot: ({ target, isBackRowCard }) => (isBackRowCard(target) ? 1 : 0),
  shadow_leaf_strike: ({ runtime, target, getEffectiveHp }) =>
    getEffectiveHp(runtime, target) <= 3 ? 1 : 0,
  night_prey: ({ runtime, target, getEffectiveHp }) =>
    getEffectiveHp(runtime, target) <= 3 ? 1 : 0,
  rapier_thrust: () => 2,
  hryngar_overwatch: ({ target, isBackRowCard }) => (isBackRowCard(target) ? 1 : 0),
  bugbear_first_strike: ({ runtime, target, getEffectiveHp }) =>
    getEffectiveHp(runtime, target) >= (target.card.definition.hp ?? 0) ? 1 : 0,
  herbalist_weakening_strike: ({ runtime, target, getEffectiveHp }) =>
    getEffectiveHp(runtime, target) >= (target.card.definition.hp ?? 0) ? 2 : 0,
  minotaur_opening_gore: ({ runtime, target, getEffectiveHp }) =>
    getEffectiveHp(runtime, target) >= (target.card.definition.hp ?? 0) ? 3 : 0,
  harpy_backline_gale: ({ target, isBackRowCard }) => (isBackRowCard(target) ? 3 : 0),
  lamia_backline_curse: ({ target, isBackRowCard }) => (isBackRowCard(target) ? 4 : 0),
  medusa_first_gaze: ({ runtime, target, getEffectiveHp }) =>
    getEffectiveHp(runtime, target) >= (target.card.definition.hp ?? 0) ? 5 : 0,
  werebear_wounded_fury: ({ runtime, attacker, getEffectiveHp }) =>
    getEffectiveHp(runtime, attacker) * 2 <= (attacker.card.definition.hp ?? 0) ? 2 : 0,
  yeti_size_hunt: ({ attacker, target }) => (readSizeRank(attacker) > readSizeRank(target) ? 2 : 0),
  wyvern_opposing_dive: ({ attacker, target }) =>
    readBattlefieldColumn(attacker) === readBattlefieldColumn(target) ? 3 : 0,
};

/** 대상의 SPECIAL 능력이 제공하는 피해 감소 규칙을 ID별로 해석한다. */
export const DAMAGE_REDUCTION_ABILITY_HANDLERS: Partial<
  Record<string, DamageReductionAbilityHandler>
> = {
  animated_resilience: () => 1,
  animated_armor_plating: ({ damage }) => (damage >= 3 ? 2 : 0),
  statue_stone_shell: () => 2,
  arboreal_bark_armor: () => 3,
  basilisk_crystal_hide: ({ damage }) => (damage >= 4 ? 3 : 0),
  granitescale_plating: () => 3,
  dullahan_deathless_guard: () => 4,
};

export const ACTIVE_SKILL_DEFINITIONS: Partial<Record<string, ActiveSkillDefinition>> = {
  starlight_mend: { effect: 'HEAL', value: 2, targetSide: 'ally' },
  curse_reversal: { effect: 'HEAL', value: 2, targetSide: 'ally' },
  emerald_bolt: { effect: 'DAMAGE', value: 2, targetSide: 'enemy' },
  blackflame_bolt: { effect: 'DAMAGE', value: 2, targetSide: 'enemy' },
  rune_tempering: { effect: 'BUFF_ATTACK', value: 1, targetSide: 'ally' },
  rune_forge: { effect: 'BUFF_ATTACK', value: 1, targetSide: 'ally' },
  leshy_leaf_mending: { effect: 'HEAL', value: 1, targetSide: 'ally' },
  aiuvarin_elemental_bolt: { effect: 'DAMAGE', value: 2, targetSide: 'enemy' },
  swampseer_bog_bolt: { effect: 'DAMAGE', value: 3, targetSide: 'enemy' },
  griffon_wind_lift: { effect: 'BUFF_ATTACK', value: 2, targetSide: 'ally' },
  forest_troll_regrowth: { effect: 'HEAL', value: 3, targetSide: 'ally' },
  iron_hag_cage_hex: { effect: 'DAMAGE', value: 4, targetSide: 'enemy' },
  greater_shadow_void_touch: { effect: 'DAMAGE', value: 5, targetSide: 'enemy' },
};

function readSizeRank(card: BattleCardRuntimeState): number {
  return readTraitSizeRank(card.card.definition.traits);
}

function readBattlefieldColumn(card: BattleCardRuntimeState): string | null {
  return card.battlefieldSlot?.slice(-1) ?? null;
}
