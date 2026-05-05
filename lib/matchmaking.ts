import { Pokemon } from "./types/pokemon";

interface QueuedPlayer {
  playerId: string;
  selectedPokemon: Pokemon[];
  timestamp: number;
}

class MatchmakingManager {
  private queue: QueuedPlayer[] = [];
  private activeMatches: Map<string, string[]> = new Map();

  // キューに参加
  joinQueue(playerId: string, selectedPokemon: Pokemon[]): void {
    // 既にキューにいる場合は削除
    this.queue = this.queue.filter((p) => p.playerId !== playerId);

    this.queue.push({
      playerId,
      selectedPokemon,
      timestamp: Date.now(),
    });
  }

  // キューから退出
  leaveQueue(playerId: string): void {
    this.queue = this.queue.filter((p) => p.playerId !== playerId);
  }

  // マッチング試行
  tryMatch(): {
    battleId: string;
    player1: QueuedPlayer;
    player2: QueuedPlayer;
  } | null {
    if (this.queue.length < 2) {
      return null;
    }

    // 最も古い2人をマッチング
    const player1 = this.queue[0];
    const player2 = this.queue[1];

    // キューから削除
    this.queue = this.queue.slice(2);

    // アクティブマッチに追加
    const battleId = `battle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.activeMatches.set(battleId, [player1.playerId, player2.playerId]);

    return { battleId, player1, player2 };
  }

  // キューのサイズを取得
  getQueueSize(): number {
    return this.queue.length;
  }

  // バトル終了
  endBattle(battleId: string): void {
    this.activeMatches.delete(battleId);
  }
}

export const matchmakingManager = new MatchmakingManager();
