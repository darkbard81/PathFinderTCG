import type { ActiveSkill, CardDefinition, PassiveSkill, ReactiveSkill } from '../cards/card.js';
import { CORE_DECK_RULES } from '../data/contracts.js';
import {
  STAGE_ONE_REWARD_WEIGHT_BY_RARITY,
  type CardDesignRecord,
  type CardFaction,
} from './cardDesign.js';

export type TestCardPoolValidationCode =
  | 'ART_DIRECTION_REQUIRED'
  | 'BALANCE_BUDGET_EXCEEDED'
  | 'CARD_COUNT_INVALID'
  | 'COST_CURVE_INVALID'
  | 'DECK_QUANTITY_INVALID'
  | 'DUPLICATE_CARD_ID'
  | 'DUPLICATE_SKILL_ID'
  | 'FACTION_COUNT_INVALID'
  | 'FORBIDDEN_CORE_STATUS_RULE'
  | 'LEADER_CONTRACT_INVALID'
  | 'PRESENTATION_MISMATCH'
  | 'RARITY_DISTRIBUTION_INVALID'
  | 'REWARD_WEIGHT_INVALID'
  | 'ROLE_DISTRIBUTION_INVALID'
  | 'SKILL_DISTRIBUTION_INVALID';

export interface TestCardPoolValidationIssue {
  readonly code: TestCardPoolValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface TestCardPoolValidationResult {
  readonly valid: boolean;
  readonly issues: readonly TestCardPoolValidationIssue[];
}

type CardSkill = ActiveSkill | ReactiveSkill | PassiveSkill;

const EXPECTED_COST_DISTRIBUTION = Object.freeze({
  1: 4,
  2: 3,
  3: 3,
  4: 2,
  5: 1,
  6: 1,
  7: 1,
});

const EXPECTED_ROLE_DISTRIBUTION = Object.freeze({
  ATTACK: 4,
  DEFENSE: 3,
  OCCUPATION: 3,
  HAND: 2,
  DISRUPTION: 2,
  RECOVERY: 1,
});

const EXPECTED_SKILL_DISTRIBUTION = Object.freeze({
  ACTIVE_ONLY: 4,
  REACTIVE_ONLY: 4,
  PASSIVE_ONLY: 3,
  TWO_SKILLS: 2,
  NO_SKILL: 2,
});

const EXPECTED_RARITY_DISTRIBUTION = Object.freeze({
  COMMON: 8,
  RARE: 4,
  EPIC: 3,
  LEGENDARY: 1,
});

function addIssue(
  issues: TestCardPoolValidationIssue[],
  code: TestCardPoolValidationCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function getSkills(definition: CardDefinition): readonly CardSkill[] {
  const skills: CardSkill[] = [];

  if (definition.activeSkill !== undefined) {
    skills.push(definition.activeSkill);
  }
  if (definition.reactiveSkill !== undefined) {
    skills.push(definition.reactiveSkill);
  }
  if (definition.passiveSkill !== undefined) {
    skills.push(definition.passiveSkill);
  }

  return skills;
}

function getSkillProfile(definition: CardDefinition): string {
  const hasActive = definition.activeSkill !== undefined;
  const hasReactive = definition.reactiveSkill !== undefined;
  const hasPassive = definition.passiveSkill !== undefined;
  const count = Number(hasActive) + Number(hasReactive) + Number(hasPassive);

  if (count === 0) {
    return 'NO_SKILL';
  }
  if (count === 2) {
    return 'TWO_SKILLS';
  }
  if (count !== 1) {
    return `${count}_SKILLS`;
  }
  if (hasActive) {
    return 'ACTIVE_ONLY';
  }
  if (hasReactive) {
    return 'REACTIVE_ONLY';
  }
  return 'PASSIVE_ONLY';
}

function countBy<T>(
  values: readonly T[],
  getKey: (value: T) => string,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    const key = getKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function compareDistribution(
  actual: ReadonlyMap<string, number>,
  expected: Readonly<Record<string, number>>,
): boolean {
  const expectedEntries = Object.entries(expected);

  if (actual.size !== expectedEntries.length) {
    return false;
  }

  return expectedEntries.every(([key, count]) => actual.get(key) === count);
}

function formatDistribution(counts: ReadonlyMap<string, number>): string {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}:${count}`)
    .join(', ');
}

function validateSkillRules(
  definition: CardDefinition,
  path: string,
  issues: TestCardPoolValidationIssue[],
): void {
  if (
    definition.passiveSkill?.effects.some(
      (effect) => effect.type !== 'MODIFY_STAT' || effect.target !== 'SELF',
    ) === true
  ) {
    addIssue(
      issues,
      'FORBIDDEN_CORE_STATUS_RULE',
      `${path}/passiveSkill`,
      'Passive Skill은 SELF 대상 MODIFY_STAT Effect만 사용할 수 있습니다.',
    );
  }

  for (const skill of getSkills(definition)) {
    for (const effect of skill.effects) {
      if (
        effect.type === 'ADD_STATUS' &&
        (skill.type !== 'ACTIVE' || effect.statusId !== 'EXILED')
      ) {
        addIssue(
          issues,
          'FORBIDDEN_CORE_STATUS_RULE',
          `${path}/${skill.id}`,
          '코어 ADD_STATUS는 Active Skill의 EXILED만 사용할 수 있습니다.',
        );
      }

      if (effect.type === 'REMOVE_STATUS') {
        addIssue(
          issues,
          'FORBIDDEN_CORE_STATUS_RULE',
          `${path}/${skill.id}`,
          'Phase 3 코어 카드 풀은 REMOVE_STATUS를 사용하지 않습니다.',
        );
      }
    }
  }

  if (definition.reactiveSkill?.trigger.type === 'STATUS_REMOVED') {
    addIssue(
      issues,
      'FORBIDDEN_CORE_STATUS_RULE',
      `${path}/reactiveSkill/trigger`,
      'Phase 3 코어 카드 풀은 STATUS_REMOVED Trigger를 사용하지 않습니다.',
    );
  }
}

function validateFaction(
  faction: CardFaction,
  designs: readonly CardDesignRecord[],
  issues: TestCardPoolValidationIssue[],
): void {
  const factionDesigns = designs.filter((design) => design.faction === faction);
  const units = factionDesigns.filter((design) => design.definition.type === 'UNIT');
  const leaders = factionDesigns.filter((design) => design.definition.type === 'LEADER');
  const factionPath = `/factions/${faction}`;

  if (factionDesigns.length !== 16 || units.length !== 15 || leaders.length !== 1) {
    addIssue(
      issues,
      'FACTION_COUNT_INVALID',
      factionPath,
      `${faction}는 리더 1종과 유닛 15종, 총 16종이어야 합니다.`,
    );
  }

  const leader = leaders[0];

  if (leader !== undefined) {
    const skillCount = getSkills(leader.definition).length;

    if (
      skillCount !== 1 ||
      leader.definition.cost !== 0 ||
      leader.definition.hp !== 20 ||
      leader.definition.attack + leader.definition.dominance > 4 ||
      leader.deckQuantity !== 1
    ) {
      addIssue(
        issues,
        'LEADER_CONTRACT_INVALID',
        `${factionPath}/leader`,
        '리더는 cost 0, hp 20, 기본 attack+dominance 4 이하와 공개 Skill 정확히 하나를 가져야 합니다.',
      );
    }
  }

  const costDistribution = countBy(units, (design) => String(design.definition.cost));

  if (!compareDistribution(costDistribution, EXPECTED_COST_DISTRIBUTION)) {
    addIssue(
      issues,
      'COST_CURVE_INVALID',
      `${factionPath}/costs`,
      `비용 분포가 승인안과 다릅니다: ${formatDistribution(costDistribution)}`,
    );
  }

  const roleDistribution = countBy(units, (design) => design.primaryRole);

  if (!compareDistribution(roleDistribution, EXPECTED_ROLE_DISTRIBUTION)) {
    addIssue(
      issues,
      'ROLE_DISTRIBUTION_INVALID',
      `${factionPath}/roles`,
      `주 역할 분포가 승인안과 다릅니다: ${formatDistribution(roleDistribution)}`,
    );
  }

  const skillDistribution = countBy(units, (design) => getSkillProfile(design.definition));

  if (!compareDistribution(skillDistribution, EXPECTED_SKILL_DISTRIBUTION)) {
    addIssue(
      issues,
      'SKILL_DISTRIBUTION_INVALID',
      `${factionPath}/skills`,
      `Skill 구성 분포가 승인안과 다릅니다: ${formatDistribution(skillDistribution)}`,
    );
  }

  const rarityDistribution = countBy(factionDesigns, (design) => design.presentation.rarity);

  if (!compareDistribution(rarityDistribution, EXPECTED_RARITY_DISTRIBUTION)) {
    addIssue(
      issues,
      'RARITY_DISTRIBUTION_INVALID',
      `${factionPath}/rarities`,
      `레어리티 분포가 승인안과 다릅니다: ${formatDistribution(rarityDistribution)}`,
    );
  }

  const totalUnits = units.reduce((total, design) => total + design.deckQuantity, 0);
  const singletonCount = units.filter((design) => design.deckQuantity === 1).length;

  if (
    totalUnits !== CORE_DECK_RULES.unitCards ||
    singletonCount !== 1 ||
    units.some((design) => design.deckQuantity !== 1 && design.deckQuantity !== 2)
  ) {
    addIssue(
      issues,
      'DECK_QUANTITY_INVALID',
      `${factionPath}/deck`,
      '유닛은 14종을 2장, 1종을 1장 사용해 총 29장이어야 합니다.',
    );
  }

  if (leader !== undefined) {
    const lowCostUnits = units.reduce(
      (total, design) =>
        total + (design.definition.cost <= leader.definition.dominance ? design.deckQuantity : 0),
      0,
    );

    if (lowCostUnits < CORE_DECK_RULES.minimumLowCostUnits) {
      addIssue(
        issues,
        'COST_CURVE_INVALID',
        `${factionPath}/lowCostUnits`,
        `리더 지배력 이하 유닛이 ${CORE_DECK_RULES.minimumLowCostUnits}장보다 적습니다.`,
      );
    }
  }
}

export function validateTestCardPool(
  designs: readonly CardDesignRecord[],
): TestCardPoolValidationResult {
  const issues: TestCardPoolValidationIssue[] = [];
  const cardIds = new Set<string>();
  const skillIds = new Set<string>();

  if (designs.length !== 32) {
    addIssue(
      issues,
      'CARD_COUNT_INVALID',
      '/cardDesigns',
      `테스트 카드 풀은 정확히 32종이어야 합니다: ${designs.length}`,
    );
  }

  designs.forEach((design, index) => {
    const path = `/cardDesigns/${index}`;
    const { definition, presentation } = design;

    if (cardIds.has(definition.id)) {
      addIssue(
        issues,
        'DUPLICATE_CARD_ID',
        `${path}/definition/id`,
        `카드 정의 ID가 중복되었습니다: ${definition.id}`,
      );
    }
    cardIds.add(definition.id);

    for (const skill of getSkills(definition)) {
      if (skillIds.has(skill.id)) {
        addIssue(
          issues,
          'DUPLICATE_SKILL_ID',
          `${path}/${skill.id}`,
          `Skill ID가 중복되었습니다: ${skill.id}`,
        );
      }
      skillIds.add(skill.id);
    }

    if (
      presentation.cardDefinitionId !== definition.id ||
      presentation.frameVariant !== presentation.rarity ||
      presentation.artAssetKey !== `cards.art.${definition.id}`
    ) {
      addIssue(
        issues,
        'PRESENTATION_MISMATCH',
        `${path}/presentation`,
        '표현 메타데이터의 정의 ID, 아트 키와 프레임 variant가 카드 정의와 일치해야 합니다.',
      );
    }

    const artValues: readonly string[] = [
      design.artDirection.scene,
      design.artDirection.equipment,
      design.artDirection.palette,
      design.artDirection.pose,
    ];

    if (artValues.some((value) => value.trim().length === 0)) {
      addIssue(
        issues,
        'ART_DIRECTION_REQUIRED',
        `${path}/artDirection`,
        '카드 아트 장면, 장비, 색상과 자세를 모두 기록해야 합니다.',
      );
    }

    const expectedRewardWeight =
      design.faction === 'ENEMY' ? STAGE_ONE_REWARD_WEIGHT_BY_RARITY[presentation.rarity] : null;

    if (design.stageOneRewardWeight !== expectedRewardWeight) {
      addIssue(
        issues,
        'REWARD_WEIGHT_INVALID',
        `${path}/stageOneRewardWeight`,
        'Stage 01 보상 가중치는 적 카드 레어리티 표와 일치하고 아군 카드는 null이어야 합니다.',
      );
    }

    if (definition.type === 'UNIT') {
      const basicScore = definition.attack + definition.hp * 0.5 + definition.dominance * 1.5;
      const targetScore = definition.cost * 2 + 2;
      const totalScore = basicScore + design.expectedSkillValue;

      if (Math.abs(totalScore - targetScore) > 1) {
        addIssue(
          issues,
          'BALANCE_BUDGET_EXCEEDED',
          `${path}/expectedSkillValue`,
          `${definition.id}의 평가 총점 ${totalScore}이 목표 ${targetScore}의 ±1을 벗어납니다.`,
        );
      }

      const hasSkill = getSkills(definition).length > 0;

      if (
        design.expectedSkillValue < 0 ||
        (hasSkill && design.expectedSkillValue === 0) ||
        (!hasSkill && design.expectedSkillValue !== 0)
      ) {
        addIssue(
          issues,
          'BALANCE_BUDGET_EXCEEDED',
          `${path}/expectedSkillValue`,
          'Skill 유무와 기대 이득 값이 일치해야 합니다.',
        );
      }
    }

    validateSkillRules(definition, path, issues);
  });

  validateFaction('ALLIED', designs, issues);
  validateFaction('ENEMY', designs, issues);

  return {
    valid: issues.length === 0,
    issues,
  };
}
