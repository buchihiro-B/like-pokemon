import { NextRequest, NextResponse } from "next/server";
import { battleManager } from "@/lib/battle-manager";
import { pusherServer } from "@/lib/pusher";
import {
  TurnEvent,
  TurnResult,
  BattleState,
  PlayerState,
} from "@/lib/types/pokemon";

// バトル状態を構築するヘルパー関数
function buildBattleState(battle: {
  player1: {
    id: string;
    pokemon: import("@/lib/types/pokemon").BattlePokemon[];
    activeIndex: number;
    command: import("@/lib/types/pokemon").BattleCommand | null;
  };
  player2: {
    id: string;
    pokemon: import("@/lib/types/pokemon").BattlePokemon[];
    activeIndex: number;
    command: import("@/lib/types/pokemon").BattleCommand | null;
  };
  turn: number;
  phase: import("@/lib/types/pokemon").BattlePhase;
  needSwitchPlayerId: string[];
}): BattleState {
  const player1: PlayerState = {
    id: battle.player1.id,
    pokemon: battle.player1.pokemon,
    activePokemonIndex: battle.player1.activeIndex,
  };

  const player2: PlayerState = {
    id: battle.player2.id,
    pokemon: battle.player2.pokemon,
    activePokemonIndex: battle.player2.activeIndex,
  };

  return {
    player1,
    player2,
    turn: battle.turn,
    phase: battle.phase,
    needSwitchPlayerId: battle.needSwitchPlayerId,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ battleId: string }> },
) {
  try {
    const { battleId } = await params;
    const {
      playerId,
      pokemonIndex,
    }: { playerId: string; pokemonIndex: number } = await request.json();

    const battle = battleManager.getBattle(battleId);

    if (!battle) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }

    if (battle.needSwitchPlayerId.length === 0) {
      return NextResponse.json(
        { error: "No forced switch required" },
        { status: 400 },
      );
    }

    if (!battle.needSwitchPlayerId.includes(playerId)) {
      return NextResponse.json(
        { error: "Not your turn to switch" },
        { status: 403 },
      );
    }

    if (battle.phase !== "action") {
      return NextResponse.json(
        { error: "Invalid phase for forced switch" },
        { status: 400 },
      );
    }

    const turnEvents: TurnEvent[] = [];

    if (battle.player1.id === playerId) {
      battle.player1.activeIndex = pokemonIndex;
    } else {
      battle.player2.activeIndex = pokemonIndex;
    }

    const switchedPokemonArray =
      battle.player1.id === playerId
        ? battle.player1.pokemon
        : battle.player2.pokemon;

    turnEvents.push({
      type: "switch",
      player: playerId,
      pokemonName: switchedPokemonArray[pokemonIndex].name,
      pokemonIndex: pokemonIndex,
    });

    // 交代完了したプレイヤーIDを配列から削除
    battle.needSwitchPlayerId = battle.needSwitchPlayerId.filter(
      (id) => id !== playerId,
    );

    // 全員の交代が完了したら次のターンへ
    if (battle.needSwitchPlayerId.length === 0) {
      battle.phase = "selecting";
      battle.turn += 1;
      battle.player1.command = null;
      battle.player2.command = null;
    }

    const battleState = buildBattleState(battle);
    const turnResult: TurnResult = {
      battleState,
      turnEvents,
    };

    await pusherServer.trigger(`battle-${battleId}`, "turn-result", turnResult);
    battleManager.updateBattle(battleId, battle);

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Error in forced switch:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
