import { NextRequest, NextResponse } from 'next/server';
import { matchmakingManager } from '@/lib/matchmaking';
import { battleManager } from '@/lib/battle-manager';
import { pusherServer } from '@/lib/pusher';
import { Pokemon } from '@/lib/types/pokemon';
import { initializeBattlePokemon } from '@/lib/battle-logic';

export async function POST(request: NextRequest) {
  try {
    const { playerId, selectedPokemon }: { playerId: string; selectedPokemon: Pokemon[] } = await request.json();

    if (!playerId || !selectedPokemon || selectedPokemon.length !== 3) {
      return NextResponse.json(
        { error: 'Invalid request. playerId and 3 selectedPokemon are required.' },
        { status: 400 }
      );
    }

    console.log('[Matchmaking] Player joining queue:', playerId);

    // キューに参加
    matchmakingManager.joinQueue(playerId, selectedPokemon);

    // マッチング試行
    const match = matchmakingManager.tryMatch();

    if (match) {
      // マッチング成立
      const battleId = `battle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      console.log('[Matchmaking] Match found! Battle ID:', battleId);
      console.log('[Matchmaking] Player1:', match.player1.playerId);
      console.log('[Matchmaking] Player2:', match.player2.playerId);

      // バトルポケモンを初期化
      const player1Pokemon = match.player1.selectedPokemon.map(p => initializeBattlePokemon(p));
      const player2Pokemon = match.player2.selectedPokemon.map(p => initializeBattlePokemon(p));

      // バトルを作成
      battleManager.createBattle(
        battleId,
        match.player1.playerId,
        match.player2.playerId,
        player1Pokemon,
        player2Pokemon
      );

      console.log('[Matchmaking] Battle created in manager');

      // 両プレイヤーにマッチング成立を通知（パブリックチャンネルに変更）
      await pusherServer.trigger(`player-${match.player1.playerId}`, 'match-found', {
        battleId,
        opponentId: match.player2.playerId,
        isPlayer1: true,
      });

      console.log('[Matchmaking] Sent match-found to player1');

      await pusherServer.trigger(`player-${match.player2.playerId}`, 'match-found', {
        battleId,
        opponentId: match.player1.playerId,
        isPlayer1: false,
      });

      console.log('[Matchmaking] Sent match-found to player2');

      // バトル初期化イベントを送信
      await pusherServer.trigger(`battle-${battleId}`, 'battle-init', {
        battleId,
        player1Id: match.player1.playerId,
        player2Id: match.player2.playerId,
        player1Pokemon,
        player2Pokemon,
      });

      console.log('[Matchmaking] Sent battle-init event');

      return NextResponse.json({ 
        status: 'matched',
        battleId,
        opponentId: playerId === match.player1.playerId ? match.player2.playerId : match.player1.playerId,
      });
    }

    console.log('[Matchmaking] No match yet, queue size:', matchmakingManager.getQueueSize());

    return NextResponse.json({ status: 'waiting', queueSize: matchmakingManager.getQueueSize() });
  } catch (error) {
    console.error('Error in matchmaking join:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
