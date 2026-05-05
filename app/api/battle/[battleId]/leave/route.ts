import { NextRequest, NextResponse } from "next/server";
import { battleManager } from "@/lib/battle-manager";
import { pusherServer } from "@/lib/pusher";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ battleId: string }> },
) {
  try {
    const { battleId } = await params;
    const { playerId, reason } = await request.json();

    console.log("[Battle Leave] Player leaving:", playerId, "Reason:", reason);

    const battle = battleManager.getBattle(battleId);

    if (battle) {
      // 相手プレイヤーに通知
      const opponentId =
        battle.player1.id === playerId ? battle.player2.id : battle.player1.id;

      await pusherServer.trigger(`battle-${battleId}`, "battle-ended", {
        reason: reason || "opponent-disconnected",
        winnerId: opponentId,
      });

      // バトルを削除
      battleManager.endBattle(battleId);
      console.log("[Battle Leave] Battle ended and cleaned up");
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error in battle leave:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
