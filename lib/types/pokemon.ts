// lib/types/pokemon.ts
export type PokemonType = 
  | "ノーマル" | "ほのお" | "みず" | "でんき" | "くさ" | "こおり"
  | "かくとう" | "どく" | "じめん" | "ひこう" | "エスパー" | "むし"
  | "いわ" | "ゴースト" | "ドラゴン" | "あく" | "はがね" | "フェアリー";

export type MoveCategory = "物理" | "特殊" | "変化";

export interface Move {
  id: number;
  name: string;
  type: PokemonType;
  category: MoveCategory;
  power: number; // 変化技は0
  accuracy: number; // 必中は100
  pp: number;
  description?: string;
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
// ターン内のアクション型定義
export type TurnAction = 
  | {
      type: "attack";
      attackerId: string;
      defenderId: string;
      move: string;
      damage: number;
      effectiveness: number;
      isCritical: boolean;
    }
  | {
      type: "faint";
      playerId: string;
      pokemonIndex: number;
      pokemonName: string;
    }
  | {
      type: "need-switch";
      playerId: string;
    }
  | {
      type: "switch";
      playerId: string;
      pokemonIndex: number;
      pokemonName: string;
    };

// ターン結果の型定義
export interface TurnResult {
  turnNumber: number;
  actions: TurnAction[];
  battleState: {
    player1Pokemon: BattlePokemon[];
    player2Pokemon: BattlePokemon[];
    player1ActiveIndex: number;
    player2ActiveIndex: number;
  };
  battleEnd?: {
    winnerId: string;
    reason: "all-fainted" | "surrender";
  };
}

// バトルアクションイベント型定義（個別イベント送信用）
export interface BattleActionEvent {
  action: TurnAction;
  battleState: {
    player1Pokemon: BattlePokemon[];
    player2Pokemon: BattlePokemon[];
    player1ActiveIndex: number;
    player2ActiveIndex: number;
  };
  needSwitch?: boolean;
  battleEnd?: {
    winnerId: string;
    reason: "all-fainted" | "surrender";
  };
}
