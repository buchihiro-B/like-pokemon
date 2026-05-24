import {
  BattlePokemon,
  Move,
  MoveEffect,
  MoveEffectResult,
} from "./types/pokemon";

// 能力ランク補正倍率
const STAT_STAGE_MULTIPLIERS: Record<number, number> = {
  "-6": 2 / 8,
  "-5": 2 / 7,
  "-4": 2 / 6,
  "-3": 2 / 5,
  "-2": 2 / 4,
  "-1": 2 / 3,
  "0": 2 / 2,
  "1": 3 / 2,
  "2": 4 / 2,
  "3": 5 / 2,
  "4": 6 / 2,
  "5": 7 / 2,
  "6": 8 / 2,
};

// 能力ランク補正を取得
export function getStatMultiplier(stages: number): number {
  const clampedStages = Math.max(-6, Math.min(6, stages));
  return STAT_STAGE_MULTIPLIERS[clampedStages];
}

// 能力値を能力ランク補正込みで取得
export function getEffectiveStat(
  pokemon: BattlePokemon,
  stat: "attack" | "defense" | "spAttack" | "spDefense" | "speed",
): number {
  const baseStat = pokemon.stats[stat];
  const stages = pokemon.statStages[stat];
  return Math.floor(baseStat * getStatMultiplier(stages));
}

// 追加効果を適用
export function applyMoveEffects(
  effects: MoveEffect[],
  attacker: BattlePokemon,
  defender: BattlePokemon,
): MoveEffectResult[] {
  const results: MoveEffectResult[] = [];

  for (const effect of effects) {
    // 技効果発動判定
    if (effect.chance && Math.random() * 100 > effect.chance) {
      continue;
    }

    let target: BattlePokemon;
    // 対象が自ポケモンの場合
    if (effect.target === "self") {
      target = attacker;
    } else {
      target = defender;
      // 相手が瀕死の場合は効果を適用しない
      if (defender.currentHp === 0) {
        continue;
      }
    }

    // 技効果がステータス変更の場合
    if (effect.type === "statChange" && effect.stat && effect.stages) {
      const result = applyStatChange(target, effect.stat, effect.stages);
      if (result) {
        results.push(result);
      }
    }
    // 技効果が状態異常付与の場合
    else if (effect.type === "status" && effect.status) {
      const result = applyStatus(target, effect.status);
      if (result) {
        results.push(result);
      }
    }
    // 技効果がまもるの場合
    else if (effect.type === "protect") {
      target.isProtected = true;
      results.push({
        type: "protect",
        target: target.name,
        success: true,
      });
    }
    // 技効果がためるの場合
    else if (effect.type === "recharge") {
      target.mustRecharge = true;
      results.push({
        type: "recharge",
        target: target.name,
        success: true,
      });
    }
  }

  return results;
}

// 能力変化を適用
function applyStatChange(
  pokemon: BattlePokemon,
  stat:
    | "attack"
    | "defense"
    | "spAttack"
    | "spDefense"
    | "speed"
    | "evasion"
    | "accuracy",
  stages: number,
): MoveEffectResult | null {
  const oldStage = pokemon.statStages[stat];
  const newStage = Math.max(-6, Math.min(6, oldStage + stages));

  // 変化なしの場合
  if (newStage === oldStage) {
    return {
      type: "statChange",
      target: pokemon.name,
      success: false,
      stat,
      oldStage,
      newStage,
    };
  }

  pokemon.statStages[stat] = newStage;

  return {
    type: "statChange",
    target: pokemon.name,
    success: true,
    stat,
    oldStage,
    newStage,
  };
}

// 状態異常を付与
function applyStatus(
  pokemon: BattlePokemon,
  status: "まひ" | "どく" | "やけど" | "ねむり" | "こおり",
): MoveEffectResult | null {
  // すでに状態異常がある場合は付与できない
  if (pokemon.status) {
    return {
      type: "status",
      target: pokemon.name,
      success: false,
      status,
    };
  }

  pokemon.status = status;

  return {
    type: "status",
    target: pokemon.name,
    success: true,
    status,
  };
}

// 特殊な技のロジック
export interface CustomMoveLogic {
  power?: number; // 威力を変更する場合
  modifyDamage?: (baseDamage: number) => number; // ダメージを直接変更する場合
}

// 特殊な技の処理を取得
export function getCustomMoveLogic(
  move: Move,
  attacker: BattlePokemon,
  isFirst: boolean,
): CustomMoveLogic | null {
  if (!move.customLogic) {
    return null;
  }

  if (move.customLogic === "reversal") {
    // きしかいせい：HP残量で威力変動
    const hpRatio = attacker.currentHp / attacker.maxHp;
    let power = 20;
    if (hpRatio < 0.04) {
      power = 200;
    } else if (hpRatio < 0.1) {
      power = 150;
    } else if (hpRatio < 0.2) {
      power = 100;
    } else if (hpRatio < 0.35) {
      power = 80;
    } else if (hpRatio < 0.7) {
      power = 40;
    }

    return { power };
  }

  if (move.customLogic === "fishiousRend") {
    // エラがみ：先制なら威力2倍
    let power = move.power;
    if (isFirst) {
      power = power * 2;
    }

    return { power };
  }

  if (move.customLogic === "consecutiveCut") {
    // れんぞくぎり：連続使用で威力上昇（未実装）
    // TODO: バトル状態に連続使用カウンターを追加する必要がある
    return { power: move.power };
  }

  return null;
}
