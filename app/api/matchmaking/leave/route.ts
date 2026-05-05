import { NextRequest, NextResponse } from "next/server";
import { matchmakingManager } from "@/lib/matchmaking";

export async function POST(request: NextRequest) {
  try {
    const { playerId }: { playerId: string } = await request.json();

    // バリデーションチェック
    if (!playerId) {
      return NextResponse.json(
        { error: "playerId is required" },
        { status: 400 },
      );
    }

    matchmakingManager.leaveQueue(playerId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error in matchmaking leave:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
