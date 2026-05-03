import { NextRequest, NextResponse } from 'next/server';
import { battleManager } from '@/lib/battle-manager';
import { pusherServer } from '@/lib/pusher';
import { calculateDamage, determineOrder } from '@/lib/battle-logic';
import { BattleCommand, TurnAction, BattleActionEvent } from '@/lib/types/pokemon';

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

    battleManager.setCommand(battleId, playerId, command);
    console.log('[Battle Command] Command saved');

    const bothReady = battleManager.bothCommandsReady(battleId);
    console.log('[Battle Command] Both commands ready:', bothReady);

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

function getBattleState(battle: { player1Pokemon: import("@/lib/types/pokemon").BattlePokemon[]; player2Pokemon: import("@/lib/types/pokemon").BattlePokemon[]; player1ActiveIndex: number; player2ActiveIndex: number }) {
  return {
    player1Pokemon: battle.player1Pokemon,
    player2Pokemon: battle.player2Pokemon,
    player1ActiveIndex: battle.player1ActiveIndex,
    player2ActiveIndex: battle.player2ActiveIndex,
  };
}

async function sendBattleAction(
  battleId: string,
  action: TurnAction,
  battle: { player1Pokemon: import("@/lib/types/pokemon").BattlePokemon[]; player2Pokemon: import("@/lib/types/pokemon").BattlePokemon[]; player1ActiveIndex: number; player2ActiveIndex: number },
  needSwitch?: boolean,
  battleEnd?: { winnerId: string; reason: 'all-fainted' | 'surrender' }
) {
  const event: BattleActionEvent = {
    action,
    battleState: getBattleState(battle),
    needSwitch,
    battleEnd,
  };
  await pusherServer.trigger(`battle-${battleId}`, 'battle-action', event);
  console.log('[Battle Action] Sent:', action.type, needSwitch ? '(needs switch)' : '');
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

  console.log('[Turn Processing] Player1 command:', player1Command);
  console.log('[Turn Processing] Player2 command:', player2Command);

  if (player1Command.type === 'surrender') {
    console.log('[Turn Processing] Player1 surrendered');
    battle.winnerId = battle.player2Id;
    
    await sendBattleAction(
      battleId,
      { type: 'need-switch', playerId: battle.player1Id },
      battle,
      false,
      { winnerId: battle.player2Id, reason: 'surrender' }
    );
    
    battleManager.endBattle(battleId);
    return;
  }

  if (player2Command.type === 'surrender') {
    console.log('[Turn Processing] Player2 surrendered');
    battle.winnerId = battle.player1Id;
    
    await sendBattleAction(
      battleId,
      { type: 'need-switch', playerId: battle.player2Id },
      battle,
      false,
      { winnerId: battle.player1Id, reason: 'surrender' }
    );
    
    battleManager.endBattle(battleId);
    return;
  }

  if ((player1Command.type === 'switch' && player2Command.type === 'move') ||
      (player1Command.type === 'move' && player2Command.type === 'switch')) {
    console.log('[Turn Processing] Switch after faint detected');
    
    const switchCommand = player1Command.type === 'switch' ? player1Command : player2Command;
    if (switchCommand.type !== 'switch') return;
    const switchPlayerId = player1Command.type === 'switch' ? battle.player1Id : battle.player2Id;
    const switchPokemonArray = player1Command.type === 'switch' ? battle.player1Pokemon : battle.player2Pokemon;
    
    if (player1Command.type === 'switch') {
      battle.player1ActiveIndex = switchCommand.pokemonIndex;
    } else {
      battle.player2ActiveIndex = switchCommand.pokemonIndex;
    }
    
    await sendBattleAction(
      battleId,
      {
        type: 'switch',
        playerId: switchPlayerId,
        pokemonIndex: switchCommand.pokemonIndex,
        pokemonName: switchPokemonArray[switchCommand.pokemonIndex].name,
      },
      battle
    );

    battle.turn += 1;
    battle.player1Command = null;
    battle.player2Command = null;
    battleManager.updateBattle(battleId, battle);

    console.log('[Turn Processing] Switch completed, moving to next turn');
    return;
  }

  if (player1Command.type === 'switch' && player2Command.type === 'switch') {
    console.log('[Turn Processing] Both players switching');
    
    battle.player1ActiveIndex = player1Command.pokemonIndex;
    battle.player2ActiveIndex = player2Command.pokemonIndex;
    
    await sendBattleAction(
      battleId,
      {
        type: 'switch',
        playerId: battle.player1Id,
        pokemonIndex: player1Command.pokemonIndex,
        pokemonName: battle.player1Pokemon[player1Command.pokemonIndex].name,
      },
      battle
    );
    
    await sendBattleAction(
      battleId,
      {
        type: 'switch',
        playerId: battle.player2Id,
        pokemonIndex: player2Command.pokemonIndex,
        pokemonName: battle.player2Pokemon[player2Command.pokemonIndex].name,
      },
      battle
    );

    battle.turn += 1;
    battle.player1Command = null;
    battle.player2Command = null;
    battleManager.updateBattle(battleId, battle);

    return;
  }

  if (player1Command.type === 'move' && player2Command.type === 'move') {
    console.log('[Turn Processing] Both players using moves');
    
    const player1Pokemon = battle.player1Pokemon[battle.player1ActiveIndex];
    const player2Pokemon = battle.player2Pokemon[battle.player2ActiveIndex];

    const [first, second] = determineOrder(player1Pokemon, player2Pokemon);
    const firstIsPlayer1 = first === player1Pokemon;

    console.log('[Turn Processing] First attacker is Player1:', firstIsPlayer1);

    const firstCommand = firstIsPlayer1 ? player1Command : player2Command;
    const secondCommand = firstIsPlayer1 ? player2Command : player1Command;

    if (firstCommand.type === 'move') {
      const attacker = first;
      const defender = second;
      const move = attacker.moves[firstCommand.moveIndex];

      console.log('[Turn Processing] First attack:', move.name);

      const result = calculateDamage(attacker, defender, move);
      defender.currentHp = Math.max(0, defender.currentHp - result.damage);

      await sendBattleAction(
        battleId,
        {
          type: 'attack',
          attackerId: firstIsPlayer1 ? battle.player1Id : battle.player2Id,
          defenderId: firstIsPlayer1 ? battle.player2Id : battle.player1Id,
          move: move.name,
          damage: result.damage,
          effectiveness: result.effectiveness,
          isCritical: result.isCritical,
        },
        battle
      );

      if (defender.currentHp === 0) {
        console.log('[Turn Processing] Defender fainted');
        
        const faintedIndex = firstIsPlayer1 ? battle.player2ActiveIndex : battle.player1ActiveIndex;
        const faintedPokemon = firstIsPlayer1 ? battle.player2Pokemon[faintedIndex] : battle.player1Pokemon[faintedIndex];
        
        await sendBattleAction(
          battleId,
          {
            type: 'faint',
            playerId: firstIsPlayer1 ? battle.player2Id : battle.player1Id,
            pokemonIndex: faintedIndex,
            pokemonName: faintedPokemon.name,
          },
          battle
        );

        const defenderPokemon = firstIsPlayer1 ? battle.player2Pokemon : battle.player1Pokemon;
        const allFainted = defenderPokemon.every(p => p.currentHp === 0);

        if (allFainted) {
          console.log('[Turn Processing] All Pokemon fainted, battle over');
          battle.winnerId = firstIsPlayer1 ? battle.player1Id : battle.player2Id;
          
          await sendBattleAction(
            battleId,
            {
              type: 'need-switch',
              playerId: firstIsPlayer1 ? battle.player2Id : battle.player1Id,
            },
            battle,
            false,
            {
              winnerId: battle.winnerId,
              reason: 'all-fainted',
            }
          );

          battleManager.endBattle(battleId);
          return;
        }

        console.log('[Turn Processing] Defender needs to switch');
        await sendBattleAction(
          battleId,
          {
            type: 'need-switch',
            playerId: firstIsPlayer1 ? battle.player2Id : battle.player1Id,
          },
          battle,
          true
        );

        battle.player1Command = null;
        battle.player2Command = null;
        battleManager.updateBattle(battleId, battle);
        
        return;
      }
    }

    if (secondCommand.type === 'move' && second.currentHp > 0) {
      const attacker = second;
      const defender = first;
      const move = attacker.moves[secondCommand.moveIndex];

      console.log('[Turn Processing] Second attack:', move.name);

      const result = calculateDamage(attacker, defender, move);
      defender.currentHp = Math.max(0, defender.currentHp - result.damage);

      await sendBattleAction(
        battleId,
        {
          type: 'attack',
          attackerId: firstIsPlayer1 ? battle.player2Id : battle.player1Id,
          defenderId: firstIsPlayer1 ? battle.player1Id : battle.player2Id,
          move: move.name,
          damage: result.damage,
          effectiveness: result.effectiveness,
          isCritical: result.isCritical,
        },
        battle
      );

      if (defender.currentHp === 0) {
        console.log('[Turn Processing] Defender fainted');
        
        const faintedIndex = firstIsPlayer1 ? battle.player1ActiveIndex : battle.player2ActiveIndex;
        const faintedPokemon = firstIsPlayer1 ? battle.player1Pokemon[faintedIndex] : battle.player2Pokemon[faintedIndex];
        
        await sendBattleAction(
          battleId,
          {
            type: 'faint',
            playerId: firstIsPlayer1 ? battle.player1Id : battle.player2Id,
            pokemonIndex: faintedIndex,
            pokemonName: faintedPokemon.name,
          },
          battle
        );

        const defenderPokemon = firstIsPlayer1 ? battle.player1Pokemon : battle.player2Pokemon;
        const allFainted = defenderPokemon.every(p => p.currentHp === 0);

        if (allFainted) {
          console.log('[Turn Processing] All Pokemon fainted, battle over');
          battle.winnerId = firstIsPlayer1 ? battle.player2Id : battle.player1Id;
          
          await sendBattleAction(
            battleId,
            {
              type: 'need-switch',
              playerId: firstIsPlayer1 ? battle.player1Id : battle.player2Id,
            },
            battle,
            false,
            {
              winnerId: battle.winnerId,
              reason: 'all-fainted',
            }
          );

          battleManager.endBattle(battleId);
          return;
        }

        console.log('[Turn Processing] Defender needs to switch');
        await sendBattleAction(
          battleId,
          {
            type: 'need-switch',
            playerId: firstIsPlayer1 ? battle.player1Id : battle.player2Id,
          },
          battle,
          true
        );

        battle.player1Command = null;
        battle.player2Command = null;
        battleManager.updateBattle(battleId, battle);
        
        return;
      }
    }
  }

  console.log('[Turn Processing] Turn completed, moving to next turn');
  battle.turn += 1;
  battle.player1Command = null;
  battle.player2Command = null;
  battleManager.updateBattle(battleId, battle);

  console.log('[Turn Processing] Turn ended, waiting for next commands');
}
