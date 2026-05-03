import { NextRequest, NextResponse } from 'next/server';
import { battleManager } from '@/lib/battle-manager';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ battleId: string }> }
) {
  try {
    const { battleId } = await params;
    const { playerId } = await request.json();

    console.log('[Battle Init] Request for battle:', battleId, 'player:', playerId);

    const battle = battleManager.getBattle(battleId);
    
    if (battle) {
      console.log('[Battle Init] Battle found');
      const isPlayer1 = battle.player1Id === playerId;

      return NextResponse.json({
        player1Pokemon: battle.player1Pokemon,
        player2Pokemon: battle.player2Pokemon,
        player1ActiveIndex: battle.player1ActiveIndex,
        player2ActiveIndex: battle.player2ActiveIndex,
        player1Id: battle.player1Id,
        player2Id: battle.player2Id,
        isPlayer1,
      });
    }

    console.log('[Battle Init] Battle not found!');
    return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
  } catch (error) {
    console.error('Error in battle init:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
