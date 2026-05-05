import { BattlePokemon, BattleCommand, BattlePhase } from "./types/pokemon";

export interface PlayerBattleState {
  id: string;
  pokemon: BattlePokemon[];
  activeIndex: number;
  command: BattleCommand | null;
}

interface BattleState {
  battleId: string;
  player1: PlayerBattleState;
  player2: PlayerBattleState;
  turn: number;
  winnerId: string | null;
  phase: BattlePhase;
  needSwitchPlayerId: string | null;
}

class BattleManager {
  private battles: Map<string, BattleState> = new Map();

  createBattle(
    battleId: string,
    player1Id: string,
    player2Id: string,
    player1Pokemon: BattlePokemon[],
    player2Pokemon: BattlePokemon[],
  ): void {
    this.battles.set(battleId, {
      battleId,
      player1: {
        id: player1Id,
        pokemon: player1Pokemon,
        activeIndex: 0,
        command: null,
      },
      player2: {
        id: player2Id,
        pokemon: player2Pokemon,
        activeIndex: 0,
        command: null,
      },
      turn: 1,
      winnerId: null,
      phase: "selecting",
      needSwitchPlayerId: null,
    });
  }

  getBattle(battleId: string): BattleState | undefined {
    return this.battles.get(battleId);
  }

  setCommand(battleId: string, playerId: string, command: BattleCommand): void {
    const battle = this.battles.get(battleId);
    if (!battle) return;

    if (battle.player1.id === playerId) {
      battle.player1.command = command;
    } else if (battle.player2.id === playerId) {
      battle.player2.command = command;
    }

    this.battles.set(battleId, battle);
  }

  bothCommandsReady(battleId: string): boolean {
    const battle = this.battles.get(battleId);
    if (!battle) return false;

    // action フェーズかつ強制交代中の場合、該当プレイヤーのコマンドのみ確認
    if (battle.phase === "action" && battle.needSwitchPlayerId) {
      if (battle.needSwitchPlayerId === battle.player1.id) {
        return battle.player1.command !== null;
      }
      if (battle.needSwitchPlayerId === battle.player2.id) {
        return battle.player2.command !== null;
      }
    }

    // 通常のコマンド選択時は両方必要
    return battle.player1.command !== null && battle.player2.command !== null;
  }

  updateBattle(battleId: string, updates: Partial<BattleState>): void {
    const battle = this.battles.get(battleId);
    if (!battle) return;

    this.battles.set(battleId, { ...battle, ...updates });
  }

  setPhase(battleId: string, phase: BattlePhase): void {
    const battle = this.battles.get(battleId);
    if (!battle) return;

    battle.phase = phase;
    this.battles.set(battleId, battle);
  }

  setNeedSwitch(battleId: string, playerId: string | null): void {
    const battle = this.battles.get(battleId);
    if (!battle) return;

    battle.needSwitchPlayerId = playerId;
    this.battles.set(battleId, battle);
  }

  endBattle(battleId: string): void {
    this.battles.delete(battleId);
  }
}

export const battleManager = new BattleManager();
