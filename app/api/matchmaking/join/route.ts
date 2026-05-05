import { NextRequest, NextResponse } from "next/server";
import { matchmakingManager } from "@/lib/matchmaking";
import { battleManager } from "@/lib/battle-manager";
import { pusherServer } from "@/lib/pusher";
import { Pokemon } from "@/lib/types/pokemon";
import { initializeBattlePokemon } from "@/lib/battle-logic";

export async function POST(request: NextRequest) {
  try {
    const {
      playerId,
      selectedPokemon,
    }: { playerId: string; selectedPokemon: Pokemon[] } = await request.json();

    // バリデーションチェック
    if (!playerId || !selectedPokemon || selectedPokemon.length !== 3) {
      return NextResponse.json(
        {
          error:
            "Invalid request. playerId and 3 selectedPokemon are required.",
        },
        { status: 400 },
      );
    }

    console.log("[Matchmaking] Player joining queue:", playerId);

    // キューに参加
    matchmakingManager.joinQueue(playerId, selectedPokemon);

    // マッチング試行
    const match = matchmakingManager.tryMatch();

    if (match) {
      // マッチング成立
      const { battleId, player1, player2 } = match;

      console.log("[Matchmaking] Match found! Battle ID:", battleId);
      console.log("[Matchmaking] Player1:", player1.playerId);
      console.log("[Matchmaking] Player2:", player2.playerId);

      // バトルポケモンを初期化
      const player1Pokemon = player1.selectedPokemon.map((p) =>
        initializeBattlePokemon(p),
      );
      const player2Pokemon = player2.selectedPokemon.map((p) =>
        initializeBattlePokemon(p),
      );

      // バトルを作成
      battleManager.createBattle(
        battleId,
        player1.playerId,
        player2.playerId,
        player1Pokemon,
        player2Pokemon,
      );

      console.log("[Matchmaking] Battle created in manager");

      // 両プレイヤーにマッチング成立を通知（パブリックチャンネルに変更）
      await pusherServer.trigger(`player-${player1.playerId}`, "match-found", {
        battleId,
        isPlayer1: true,
      });

      console.log("[Matchmaking] Sent match-found to player1");

      await pusherServer.trigger(`player-${player2.playerId}`, "match-found", {
        battleId,
        isPlayer1: false,
      });

      console.log("[Matchmaking] Sent match-found to player2");

      return NextResponse.json({
        status: "matched",
        battleId,
        isPlayer1: playerId === player1.playerId,
      });
    }

    console.log(
      "[Matchmaking] No match yet, queue size:",
      matchmakingManager.getQueueSize(),
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error in matchmaking join:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
