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
  power: number;
  accuracy: number;
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

// バトルフェーズ
export type BattlePhase = "selecting" | "action" | "finished";

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
    }
  | {
      type: "switch";
      player: string;
      pokemonName: string;
      pokemonIndex: number;
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
  needSwitchPlayerId: string | null;
}

// ターン結果
export interface TurnResult {
  battleState: BattleState;
  turnEvents: TurnEvent[];
  gameOver?: {
    winnerId: string;
    reason: "all-fainted" | "surrender";
  };
}
