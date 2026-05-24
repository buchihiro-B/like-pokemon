// lib/types/pokemon.ts
export type PokemonType =
  | "ノーマル"
  | "ほのお"
  | "みず"
  | "でんき"
  | "くさ"
  | "こおり"
  | "かくとう"
  | "どく"
  | "じめん"
  | "ひこう"
  | "エスパー"
  | "むし"
  | "いわ"
  | "ゴースト"
  | "ドラゴン"
  | "あく"
  | "はがね"
  | "フェアリー";

export type MoveCategory = "物理" | "特殊" | "変化";

// 技の追加効果
export interface MoveEffect {
  type: "statChange" | "status" | "protect" | "recharge";
  stat?:
    | "attack"
    | "defense"
    | "spAttack"
    | "spDefense"
    | "speed"
    | "evasion"
    | "accuracy";
  stages?: number;
  status?: "まひ" | "どく" | "やけど" | "ねむり" | "こおり";
  chance?: number; // 発動確率（%）
  target?: "self" | "opponent";
}

export interface Move {
  id: number;
  name: string;
  type: PokemonType;
  category: MoveCategory;
  power: number;
  accuracy: number;
  pp: number;
  description?: string;
  priority?: number; // 優先度（デフォルト0）
  effects?: MoveEffect[]; // 追加効果
  customLogic?: string; // 特殊な処理が必要な技の識別子
}

export interface PokemonStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
}

export interface Pokemon {
  id: number;
  name: string;
  types: PokemonType[];
  stats: PokemonStats;
  ability: string;
  moves: Move[];
  imageUrl: string;
}

export interface BattlePokemon extends Pokemon {
  currentHp: number;
  maxHp: number;
  status?: "まひ" | "どく" | "やけど" | "ねむり" | "こおり";
  // 能力ランク（-6〜+6）
  statStages: {
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
    evasion: number;
    accuracy: number;
  };
  // バトル状態フラグ
  isProtected?: boolean; // みきり・まもる状態
  mustRecharge?: boolean; // はかいこうせん等の反動
}

export interface Player {
  id: string;
  selectedPokemon: BattlePokemon[];
  activePokemonIndex: number;
}

export interface Battle {
  id: string;
  player1: Player;
  player2: Player;
  turn: number;
  winnerId?: string;
}

export type BattleCommand =
  | { type: "move"; moveIndex: number }
  | { type: "switch"; pokemonIndex: number }
  | { type: "surrender" };

// バトルフェーズ
export type BattlePhase = "selecting" | "action" | "finished";

// 技効果の結果
export type MoveEffectResult =
  | {
      type: "statChange";
      target: string; // ポケモン名
      success: boolean;
      stat:
        | "attack"
        | "defense"
        | "spAttack"
        | "spDefense"
        | "speed"
        | "evasion"
        | "accuracy";
      oldStage: number;
      newStage: number;
    }
  | {
      type: "status";
      target: string; // ポケモン名
      success: boolean;
      status: "まひ" | "どく" | "やけど" | "ねむり" | "こおり";
    }
  | {
      type: "protect";
      target: string; // ポケモン名
      success: true;
    }
  | {
      type: "recharge";
      target: string; // ポケモン名
      success: true;
    };

// ターンイベント（アニメーション用）
export type TurnEvent =
  | {
      type: "move";
      attacker: string;
      attackerName: string;
      defender: string;
      defenderName: string;
      moveName: string;
      damage: number;
      newHp: number;
      effectiveness: number;
      isCritical: boolean;
      fainted: boolean;
      effects?: MoveEffectResult[];
    }
  | {
      type: "switch";
      player: string;
      pokemonName: string;
      pokemonIndex: number;
    }
  | {
      type: "statusDamage";
      player: string;
      pokemonName: string;
      status: "やけど" | "どく";
      damage: number;
      newHp: number;
      fainted: boolean;
    };

// プレイヤー状態
export interface PlayerState {
  id: string;
  pokemon: BattlePokemon[];
  activePokemonIndex: number;
}

// バトル状態
export interface BattleState {
  player1: PlayerState;
  player2: PlayerState;
  turn: number;
  phase: BattlePhase;
  needSwitchPlayerId: string[];
}

// ターン結果
export interface TurnResult {
  battleState: BattleState;
  turnEvents: TurnEvent[];
  gameOver?: {
    winnerId: string | null;
    reason: "all-fainted" | "surrender" | "draw";
  };
}
