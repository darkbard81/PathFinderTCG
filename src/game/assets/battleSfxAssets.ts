export const BATTLE_SFX_NAMES = [
  'attack',
  'impact',
  'damage',
  'destroy',
  'heal',
  'draw',
  'move',
  'place',
  'discard',
  'stat',
  'statusAdd',
  'statusRemove',
] as const;

export type BattleSfxName = (typeof BATTLE_SFX_NAMES)[number];

export const BATTLE_SFX_ASSET_KEYS = Object.freeze({
  attack: 'sfx.battle.attack',
  impact: 'sfx.battle.impact',
  damage: 'sfx.battle.damage',
  destroy: 'sfx.battle.destroy',
  heal: 'sfx.battle.heal',
  draw: 'sfx.battle.draw',
  move: 'sfx.battle.move',
  place: 'sfx.battle.place',
  discard: 'sfx.battle.discard',
  stat: 'sfx.battle.stat',
  statusAdd: 'sfx.battle.status.add',
  statusRemove: 'sfx.battle.status.remove',
} as const satisfies Readonly<Record<BattleSfxName, string>>);

export type BattleSfxAssetKey = (typeof BATTLE_SFX_ASSET_KEYS)[keyof typeof BATTLE_SFX_ASSET_KEYS];

const BATTLE_SFX_FILE_STEMS = Object.freeze({
  attack: 'attack',
  impact: 'impact',
  damage: 'damage',
  destroy: 'destroy',
  heal: 'heal',
  draw: 'draw',
  move: 'move',
  place: 'place',
  discard: 'discard',
  stat: 'stat',
  statusAdd: 'status-add',
  statusRemove: 'status-remove',
} as const satisfies Readonly<Record<BattleSfxName, string>>);

export interface BattleSfxAssetDefinition {
  readonly name: BattleSfxName;
  readonly key: BattleSfxAssetKey;
  readonly paths: readonly [string, string];
}

export const BATTLE_SFX_ASSET_DEFINITIONS: readonly BattleSfxAssetDefinition[] = Object.freeze(
  BATTLE_SFX_NAMES.map((name) => {
    const stem = BATTLE_SFX_FILE_STEMS[name];
    const paths: [string, string] = [
      `/assets/audio/battle/${stem}.ogg`,
      `/assets/audio/battle/${stem}.mp3`,
    ];

    return Object.freeze({
      name,
      key: BATTLE_SFX_ASSET_KEYS[name],
      paths: Object.freeze(paths),
    });
  }),
);
