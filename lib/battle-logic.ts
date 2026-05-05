import { BattlePokemon, Move, Pokemon, PokemonType } from "./types/pokemon";

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
): { damage: number; effectiveness: number; isCritical: boolean } {
  if (move.category === "変化") {
    return { damage: 0, effectiveness: 1, isCritical: false };
  }

  // 命中判定
  const hitRoll = Math.random() * 100;
  if (hitRoll > move.accuracy) {
    return { damage: 0, effectiveness: 0, isCritical: false };
  }

  const level = 50;
  const attackStat =
    move.category === "物理" ? attacker.stats.attack : attacker.stats.spAttack;
  const defenseStat =
    move.category === "物理"
      ? defender.stats.defense
      : defender.stats.spDefense;

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
    (((2 * level) / 5 + 2) * move.power * (attackStat / defenseStat)) / 50 + 2;
  const damage = Math.floor(
    baseDamage * stab * effectiveness * criticalMultiplier * random,
  );

  return { damage, effectiveness, isCritical };
}

// バトルポケモンを初期化
export function initializeBattlePokemon(pokemon: Pokemon): BattlePokemon {
  const maxHp = pokemon.stats.hp;
  return {
    ...pokemon,
    currentHp: maxHp,
    maxHp: maxHp,
  };
}

// 先攻/後攻を決定
export function determineOrder(
  pokemon1: BattlePokemon,
  pokemon2: BattlePokemon,
): [BattlePokemon, BattlePokemon] {
  if (pokemon1.stats.speed === pokemon2.stats.speed) {
    // 同速の場合はランダム
    return Math.random() < 0.5 ? [pokemon1, pokemon2] : [pokemon2, pokemon1];
  }
  return pokemon1.stats.speed > pokemon2.stats.speed
    ? [pokemon1, pokemon2]
    : [pokemon2, pokemon1];
}
