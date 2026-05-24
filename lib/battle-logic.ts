import { BattlePokemon, Move, Pokemon, PokemonType } from "./types/pokemon";
import { getEffectiveStat, getCustomMoveLogic } from "./move-effects";

// タイプ相性表（簡易版）
const typeEffectiveness: Record<
  PokemonType,
  { strong: PokemonType[]; weak: PokemonType[] }
> = {
  ノーマル: { strong: [], weak: ["いわ", "はがね"] },
  ほのお: {
    strong: ["くさ", "こおり", "むし", "はがね"],
    weak: ["ほのお", "みず", "いわ", "ドラゴン"],
  },
  みず: {
    strong: ["ほのお", "じめん", "いわ"],
    weak: ["みず", "くさ", "ドラゴン"],
  },
  でんき: { strong: ["みず", "ひこう"], weak: ["でんき", "くさ", "ドラゴン"] },
  くさ: {
    strong: ["みず", "じめん", "いわ"],
    weak: ["ほのお", "くさ", "どく", "ひこう", "むし", "ドラゴン", "はがね"],
  },
  こおり: {
    strong: ["くさ", "じめん", "ひこう", "ドラゴン"],
    weak: ["ほのお", "みず", "こおり", "はがね"],
  },
  かくとう: {
    strong: ["ノーマル", "こおり", "いわ", "あく", "はがね"],
    weak: ["どく", "ひこう", "エスパー", "むし", "フェアリー"],
  },
  どく: {
    strong: ["くさ", "フェアリー"],
    weak: ["どく", "じめん", "いわ", "ゴースト"],
  },
  じめん: {
    strong: ["ほのお", "でんき", "どく", "いわ", "はがね"],
    weak: ["くさ", "むし"],
  },
  ひこう: {
    strong: ["くさ", "かくとう", "むし"],
    weak: ["でんき", "いわ", "はがね"],
  },
  エスパー: { strong: ["かくとう", "どく"], weak: ["エスパー", "はがね"] },
  むし: {
    strong: ["くさ", "エスパー", "あく"],
    weak: [
      "ほのお",
      "かくとう",
      "どく",
      "ひこう",
      "ゴースト",
      "はがね",
      "フェアリー",
    ],
  },
  いわ: {
    strong: ["ほのお", "こおり", "ひこう", "むし"],
    weak: ["かくとう", "じめん", "はがね"],
  },
  ゴースト: { strong: ["エスパー", "ゴースト"], weak: ["あく"] },
  ドラゴン: { strong: ["ドラゴン"], weak: ["はがね"] },
  あく: {
    strong: ["エスパー", "ゴースト"],
    weak: ["かくとう", "あく", "フェアリー"],
  },
  はがね: {
    strong: ["こおり", "いわ", "フェアリー"],
    weak: ["ほのお", "みず", "でんき", "はがね"],
  },
  フェアリー: {
    strong: ["かくとう", "ドラゴン", "あく"],
    weak: ["ほのお", "どく", "はがね"],
  },
};

// タイプ相性倍率を計算
export function getTypeEffectiveness(
  moveType: PokemonType,
  defenderTypes: PokemonType[],
): number {
  let effectiveness = 1;

  for (const defenderType of defenderTypes) {
    const moveEffectiveness = typeEffectiveness[moveType];

    if (moveEffectiveness.strong.includes(defenderType)) {
      effectiveness *= 2;
    } else if (moveEffectiveness.weak.includes(defenderType)) {
      effectiveness *= 0.5;
    }
  }

  return effectiveness;
}

// ダメージ計算
export function calculateDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  isFirst: boolean = false,
): { damage: number; effectiveness: number; isCritical: boolean } {
  if (move.category === "変化") {
    return { damage: 0, effectiveness: 1, isCritical: false };
  }

  // 命中判定
  const hitRoll = Math.random() * 100;
  if (hitRoll > move.accuracy) {
    return { damage: 0, effectiveness: 0, isCritical: false };
  }

  // 特殊な技のロジックを適用
  const customLogic = getCustomMoveLogic(move, attacker, isFirst);
  const movePower = customLogic?.power ?? move.power;

  const level = 50;

  // 能力ランク補正込みで能力値を取得
  let attackStat: number;
  let defenseStat: number;

  if (move.category === "物理") {
    attackStat = getEffectiveStat(attacker, "attack");
    defenseStat = getEffectiveStat(defender, "defense");
    // やけど状態は物理攻撃が半減
    if (attacker.status === "やけど") {
      attackStat = Math.floor(attackStat * 0.5);
    }
  } else {
    attackStat = getEffectiveStat(attacker, "spAttack");
    defenseStat = getEffectiveStat(defender, "spDefense");
  }

  // 急所判定（1/24の確率）
  const isCritical = Math.random() < 1 / 24;
  const criticalMultiplier = isCritical ? 1.5 : 1;

  // タイプ一致ボーナス
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;

  // タイプ相性
  const effectiveness = getTypeEffectiveness(move.type, defender.types);

  // 乱数（0.85～1.0）
  const random = 0.85 + Math.random() * 0.15;

  // ダメージ計算式
  const baseDamage =
    (((2 * level) / 5 + 2) * movePower * (attackStat / defenseStat)) / 50 + 2;
  let damage = Math.floor(
    baseDamage * stab * effectiveness * criticalMultiplier * random,
  );

  // カスタムロジックでダメージを直接変更
  if (customLogic?.modifyDamage) {
    damage = customLogic.modifyDamage(damage);
  }

  return { damage, effectiveness, isCritical };
}

// バトルポケモンを初期化
export function initializeBattlePokemon(pokemon: Pokemon): BattlePokemon {
  const maxHp = pokemon.stats.hp;
  return {
    ...pokemon,
    currentHp: maxHp,
    maxHp: maxHp,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      evasion: 0,
      accuracy: 0,
    },
    isProtected: false,
    mustRecharge: false,
  };
}

// 先攻/後攻を決定（優先度と素早さを考慮）
export function determineOrder(
  pokemon1: BattlePokemon,
  pokemon2: BattlePokemon,
  move1: Move,
  move2: Move,
): [BattlePokemon, BattlePokemon, boolean] {
  const priority1 = move1.priority ?? 0;
  const priority2 = move2.priority ?? 0;

  // 優先度が異なる場合は優先度で判定
  if (priority1 !== priority2) {
    const isFirst = priority1 > priority2;
    return isFirst ? [pokemon1, pokemon2, true] : [pokemon2, pokemon1, false];
  }

  // 優先度が同じ場合は素早さで判定（能力ランク補正込み）
  const speed1 = getEffectiveStat(pokemon1, "speed");
  const speed2 = getEffectiveStat(pokemon2, "speed");

  // まひ状態は素早さ半減
  const effectiveSpeed1 =
    pokemon1.status === "まひ" ? Math.floor(speed1 * 0.5) : speed1;
  const effectiveSpeed2 =
    pokemon2.status === "まひ" ? Math.floor(speed2 * 0.5) : speed2;

  if (effectiveSpeed1 === effectiveSpeed2) {
    // 同速の場合はランダム
    const isFirst = Math.random() < 0.5;
    return isFirst ? [pokemon1, pokemon2, true] : [pokemon2, pokemon1, false];
  }

  const isFirst = effectiveSpeed1 > effectiveSpeed2;
  return isFirst ? [pokemon1, pokemon2, true] : [pokemon2, pokemon1, false];
}
