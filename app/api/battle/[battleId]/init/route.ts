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
      const myPokemon = isPlayer1 ? battle.player1Pokemon : battle.player2Pokemon;
      const opponentPokemon = isPlayer1 ? battle.player2Pokemon : battle.player1Pokemon;

      console.log('[Battle Init] Sending data - myPokemon count:', myPokemon.length);
      console.log('[Battle Init] Sending data - opponentPokemon count:', opponentPokemon.length);

      return NextResponse.json({
        myPokemon,
        opponentPokemon,
        myActiveIndex: isPlayer1 ? battle.player1ActiveIndex : battle.player2ActiveIndex,
        opponentActiveIndex: isPlayer1 ? battle.player2ActiveIndex : battle.player1ActiveIndex,
      });
    }

    console.log('[Battle Init] Battle not found!');
    return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
  } catch (error) {
    console.error('Error in battle init:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
