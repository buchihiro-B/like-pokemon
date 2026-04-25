import { BattlePokemon, BattleCommand } from './types/pokemon';

interface BattleState {
  battleId: string;
  player1Id: string;
  player2Id: string;
  player1Pokemon: BattlePokemon[];
  player2Pokemon: BattlePokemon[];
  player1ActiveIndex: number;
  player2ActiveIndex: number;
  player1Command: BattleCommand | null;
  player2Command: BattleCommand | null;
  turn: number;
  winnerId: string | null;
}

class BattleManager {
  private battles: Map<string, BattleState> = new Map();

  createBattle(
    battleId: string,
    player1Id: string,
    player2Id: string,
    player1Pokemon: BattlePokemon[],
    player2Pokemon: BattlePokemon[]
  ): void {
    this.battles.set(battleId, {
      battleId,
      player1Id,
      player2Id,
      player1Pokemon,
      player2Pokemon,
      player1ActiveIndex: 0,
      player2ActiveIndex: 0,
      player1Command: null,
      player2Command: null,
      turn: 1,
      winnerId: null,
    });
  }

  getBattle(battleId: string): BattleState | undefined {
    return this.battles.get(battleId);
  }

  setCommand(battleId: string, playerId: string, command: BattleCommand): void {
    const battle = this.battles.get(battleId);
    if (!battle) return;

    if (battle.player1Id === playerId) {
      battle.player1Command = command;
    } else if (battle.player2Id === playerId) {
      battle.player2Command = command;
    }

    this.battles.set(battleId, battle);
  }

  bothCommandsReady(battleId: string): boolean {
    const battle = this.battles.get(battleId);
    if (!battle) return false;
    return battle.player1Command !== null && battle.player2Command !== null;
  }

  updateBattle(battleId: string, updates: Partial<BattleState>): void {
    const battle = this.battles.get(battleId);
    if (!battle) return;

    this.battles.set(battleId, { ...battle, ...updates });
  }

  endBattle(battleId: string): void {
    this.battles.delete(battleId);
  }
}

export const battleManager = new BattleManager();
