import { NextRequest, NextResponse } from 'next/server';
import { battleManager } from '@/lib/battle-manager';
import { pusherServer } from '@/lib/pusher';
import { calculateDamage, determineOrder } from '@/lib/battle-logic';
import { BattleCommand, TurnAction, TurnResult } from '@/lib/types/pokemon';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ battleId: string }> }
) {
  try {
    const { battleId } = await params;
    const { playerId, command }: { playerId: string; command: BattleCommand } = await request.json();

    console.log('[Battle Command] Received command:', { battleId, playerId, command });

    const battle = battleManager.getBattle(battleId);
    
    if (!battle) {
      console.log('[Battle Command] Battle not found!');
      return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
    }

    // コマンドを保存
    battleManager.setCommand(battleId, playerId, command);
    console.log('[Battle Command] Command saved');

    // 両者のコマンドが揃ったかチェック
    const bothReady = battleManager.bothCommandsReady(battleId);
    console.log('[Battle Command] Both commands ready:', bothReady);

    // 両者のコマンドが揃ったらターン処理
    if (bothReady) {
      console.log('[Battle Command] Processing turn...');
      await processTurn(battleId);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error in battle command:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function processTurn(battleId: string) {
  console.log('[Turn Processing] Starting turn for battle:', battleId);
  
  const battle = battleManager.getBattle(battleId);
  if (!battle) {
    console.log('[Turn Processing] Battle not found');
    return;
  }

  const player1Command = battle.player1Command!;
  const player2Command = battle.player2Command!;
  const actions: TurnAction[] = [];

  console.log('[Turn Processing] Player1 command:', player1Command);
  console.log('[Turn Processing] Player2 command:', player2Command);

  // 降参チェック
  if (player1Command.type === 'surrender') {
    console.log('[Turn Processing] Player1 surrendered');
    battle.winnerId = battle.player2Id;
    
    const turnResult: TurnResult = {
      turnNumber: battle.turn,
      actions: [],
      battleState: {
        player1Pokemon: battle.player1Pokemon,
        player2Pokemon: battle.player2Pokemon,
        player1ActiveIndex: battle.player1ActiveIndex,
        player2ActiveIndex: battle.player2ActiveIndex,
      },
      battleEnd: {
        winnerId: battle.player2Id,
        reason: 'surrender',
      },
    };

    await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
    battleManager.endBattle(battleId);
    return;
  }

  if (player2Command.type === 'surrender') {
    console.log('[Turn Processing] Player2 surrendered');
    battle.winnerId = battle.player1Id;
    
    const turnResult: TurnResult = {
      turnNumber: battle.turn,
      actions: [],
      battleState: {
        player1Pokemon: battle.player1Pokemon,
        player2Pokemon: battle.player2Pokemon,
        player1ActiveIndex: battle.player1ActiveIndex,
        player2ActiveIndex: battle.player2ActiveIndex,
      },
      battleEnd: {
        winnerId: battle.player1Id,
        reason: 'surrender',
      },
    };

    await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
    battleManager.endBattle(battleId);
    return;
  }

  // 交換は優先
  if (player1Command.type === 'switch') {
    console.log('[Turn Processing] Player1 switching to:', player1Command.pokemonIndex);
    battle.player1ActiveIndex = player1Command.pokemonIndex;
    actions.push({
      type: 'switch',
      playerId: battle.player1Id,
      pokemonIndex: player1Command.pokemonIndex,
      pokemonName: battle.player1Pokemon[player1Command.pokemonIndex].name,
    });
  }

  if (player2Command.type === 'switch') {
    console.log('[Turn Processing] Player2 switching to:', player2Command.pokemonIndex);
    battle.player2ActiveIndex = player2Command.pokemonIndex;
    actions.push({
      type: 'switch',
      playerId: battle.player2Id,
      pokemonIndex: player2Command.pokemonIndex,
      pokemonName: battle.player2Pokemon[player2Command.pokemonIndex].name,
    });
  }

  // 技の処理
  if (player1Command.type === 'move' && player2Command.type === 'move') {
    console.log('[Turn Processing] Both players using moves');
    
    const player1Pokemon = battle.player1Pokemon[battle.player1ActiveIndex];
    const player2Pokemon = battle.player2Pokemon[battle.player2ActiveIndex];

    // 先攻/後攻を決定
    const [first, second] = determineOrder(player1Pokemon, player2Pokemon);
    const firstIsPlayer1 = first === player1Pokemon;

    console.log('[Turn Processing] First attacker is Player1:', firstIsPlayer1);

    const firstCommand = firstIsPlayer1 ? player1Command : player2Command;
    const secondCommand = firstIsPlayer1 ? player2Command : player1Command;

    // 先攻の技
    if (firstCommand.type === 'move') {
      const attacker = first;
      const defender = second;
      const move = attacker.moves[firstCommand.moveIndex];

      console.log('[Turn Processing] First attack:', move.name);

      const result = calculateDamage(attacker, defender, move);
      defender.currentHp = Math.max(0, defender.currentHp - result.damage);

      actions.push({
        type: 'attack',
        attackerId: firstIsPlayer1 ? battle.player1Id : battle.player2Id,
        defenderId: firstIsPlayer1 ? battle.player2Id : battle.player1Id,
        move: move.name,
        damage: result.damage,
        effectiveness: result.effectiveness,
        isCritical: result.isCritical,
      });

      // 戦闘不能チェック
      if (defender.currentHp === 0) {
        console.log('[Turn Processing] Defender fainted');
        
        const faintedIndex = firstIsPlayer1 ? battle.player2ActiveIndex : battle.player1ActiveIndex;
        const faintedPokemon = firstIsPlayer1 ? battle.player2Pokemon[faintedIndex] : battle.player1Pokemon[faintedIndex];
        
        actions.push({
          type: 'faint',
          playerId: firstIsPlayer1 ? battle.player2Id : battle.player1Id,
          pokemonIndex: faintedIndex,
          pokemonName: faintedPokemon.name,
        });

        // 全滅チェック
        const defenderPokemon = firstIsPlayer1 ? battle.player2Pokemon : battle.player1Pokemon;
        const allFainted = defenderPokemon.every(p => p.currentHp === 0);

        if (allFainted) {
          console.log('[Turn Processing] All Pokemon fainted, battle over');
          battle.winnerId = firstIsPlayer1 ? battle.player1Id : battle.player2Id;
          
          const turnResult: TurnResult = {
            turnNumber: battle.turn,
            actions,
            battleState: {
              player1Pokemon: battle.player1Pokemon,
              player2Pokemon: battle.player2Pokemon,
              player1ActiveIndex: battle.player1ActiveIndex,
              player2ActiveIndex: battle.player2ActiveIndex,
            },
            battleEnd: {
              winnerId: battle.winnerId,
              reason: 'all-fainted',
            },
          };

          await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
          battleManager.endBattle(battleId);
          return;
        }

        // 交換が必要
        console.log('[Turn Processing] Defender needs to switch');
        actions.push({
          type: 'need-switch',
          playerId: firstIsPlayer1 ? battle.player2Id : battle.player1Id,
        });

        // コマンドをリセット
        battle.player1Command = null;
        battle.player2Command = null;
        battleManager.updateBattle(battleId, battle);
        
        const turnResult: TurnResult = {
          turnNumber: battle.turn,
          actions,
          battleState: {
            player1Pokemon: battle.player1Pokemon,
            player2Pokemon: battle.player2Pokemon,
            player1ActiveIndex: battle.player1ActiveIndex,
            player2ActiveIndex: battle.player2ActiveIndex,
          },
        };

        await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
        return;
      }
    }

    // 後攻の技
    if (secondCommand.type === 'move' && second.currentHp > 0) {
      const attacker = second;
      const defender = first;
      const move = attacker.moves[secondCommand.moveIndex];

      console.log('[Turn Processing] Second attack:', move.name);

      const result = calculateDamage(attacker, defender, move);
      defender.currentHp = Math.max(0, defender.currentHp - result.damage);

      actions.push({
        type: 'attack',
        attackerId: firstIsPlayer1 ? battle.player2Id : battle.player1Id,
        defenderId: firstIsPlayer1 ? battle.player1Id : battle.player2Id,
        move: move.name,
        damage: result.damage,
        effectiveness: result.effectiveness,
        isCritical: result.isCritical,
      });

      // 戦闘不能チェック
      if (defender.currentHp === 0) {
        console.log('[Turn Processing] Defender fainted');
        
        const faintedIndex = firstIsPlayer1 ? battle.player1ActiveIndex : battle.player2ActiveIndex;
        const faintedPokemon = firstIsPlayer1 ? battle.player1Pokemon[faintedIndex] : battle.player2Pokemon[faintedIndex];
        
        actions.push({
          type: 'faint',
          playerId: firstIsPlayer1 ? battle.player1Id : battle.player2Id,
          pokemonIndex: faintedIndex,
          pokemonName: faintedPokemon.name,
        });

        // 全滅チェック
        const defenderPokemon = firstIsPlayer1 ? battle.player1Pokemon : battle.player2Pokemon;
        const allFainted = defenderPokemon.every(p => p.currentHp === 0);

        if (allFainted) {
          console.log('[Turn Processing] All Pokemon fainted, battle over');
          battle.winnerId = firstIsPlayer1 ? battle.player2Id : battle.player1Id;
          
          const turnResult: TurnResult = {
            turnNumber: battle.turn,
            actions,
            battleState: {
              player1Pokemon: battle.player1Pokemon,
              player2Pokemon: battle.player2Pokemon,
              player1ActiveIndex: battle.player1ActiveIndex,
              player2ActiveIndex: battle.player2ActiveIndex,
            },
            battleEnd: {
              winnerId: battle.winnerId,
              reason: 'all-fainted',
            },
          };

          await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
          battleManager.endBattle(battleId);
          return;
        }

        // 交換が必要
        console.log('[Turn Processing] Defender needs to switch');
        actions.push({
          type: 'need-switch',
          playerId: firstIsPlayer1 ? battle.player1Id : battle.player2Id,
        });

        // コマンドをリセット
        battle.player1Command = null;
        battle.player2Command = null;
        battleManager.updateBattle(battleId, battle);
        
        const turnResult: TurnResult = {
          turnNumber: battle.turn,
          actions,
          battleState: {
            player1Pokemon: battle.player1Pokemon,
            player2Pokemon: battle.player2Pokemon,
            player1ActiveIndex: battle.player1ActiveIndex,
            player2ActiveIndex: battle.player2ActiveIndex,
          },
        };

        await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
        return;
      }
    }
  }

  // ターン終了、次のターンへ
  console.log('[Turn Processing] Turn completed, moving to next turn');
  battle.turn += 1;
  battle.player1Command = null;
  battle.player2Command = null;
  battleManager.updateBattle(battleId, battle);

  const turnResult: TurnResult = {
    turnNumber: battle.turn,
    actions,
    battleState: {
      player1Pokemon: battle.player1Pokemon,
      player2Pokemon: battle.player2Pokemon,
      player1ActiveIndex: battle.player1ActiveIndex,
      player2ActiveIndex: battle.player2ActiveIndex,
    },
  };

  await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
  console.log('[Turn Processing] Turn-result event sent');
}
