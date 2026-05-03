import { NextRequest, NextResponse } from 'next/server';
import { battleManager } from '@/lib/battle-manager';
import { pusherServer } from '@/lib/pusher';
import { calculateDamage, determineOrder } from '@/lib/battle-logic';
import { BattleCommand, TurnEvent, TurnResult, BattleState, PlayerState } from '@/lib/types/pokemon';

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

function buildBattleState(battle: {
  player1Id: string;
  player2Id: string;
  player1Pokemon: import("@/lib/types/pokemon").BattlePokemon[];
  player2Pokemon: import("@/lib/types/pokemon").BattlePokemon[];
  player1ActiveIndex: number;
  player2ActiveIndex: number;
  turn: number;
  phase: import("@/lib/types/pokemon").BattlePhase;
  needSwitchPlayerId: string | null;
}): BattleState {
  const player1: PlayerState = {
    id: battle.player1Id,
    pokemon: battle.player1Pokemon,
    activePokemonIndex: battle.player1ActiveIndex,
  };

  const player2: PlayerState = {
    id: battle.player2Id,
    pokemon: battle.player2Pokemon,
    activePokemonIndex: battle.player2ActiveIndex,
  };

  return {
    player1,
    player2,
    turn: battle.turn,
    phase: battle.phase,
    needSwitchPlayerId: battle.needSwitchPlayerId,
  };
}

async function processTurn(battleId: string) {
  console.log('[Turn Processing] Starting turn for battle:', battleId);
  
  const battle = battleManager.getBattle(battleId);
  if (!battle) {
    console.log('[Turn Processing] Battle not found');
    return;
  }

  const turnEvents: TurnEvent[] = [];
  
  // フェーズに応じた処理
  if (battle.phase === 'action' && battle.needSwitchPlayerId) {
    // 強制交代の処理
    console.log('[Turn Processing] Processing forced switch');
    
    const switchCommand = battle.needSwitchPlayerId === battle.player1Id 
      ? battle.player1Command 
      : battle.player2Command;
    
    if (!switchCommand || switchCommand.type !== 'switch') {
      console.error('[Turn Processing] Invalid command for forced switch');
      return;
    }

    if (battle.needSwitchPlayerId === battle.player1Id) {
      battle.player1ActiveIndex = switchCommand.pokemonIndex;
    } else {
      battle.player2ActiveIndex = switchCommand.pokemonIndex;
    }

    const switchedPokemonArray = battle.needSwitchPlayerId === battle.player1Id 
      ? battle.player1Pokemon 
      : battle.player2Pokemon;

    turnEvents.push({
      type: 'switch',
      player: battle.needSwitchPlayerId,
      pokemonName: switchedPokemonArray[switchCommand.pokemonIndex].name,
      pokemonIndex: switchCommand.pokemonIndex,
    });

    // 強制交代完了後、次のターンへ
    battle.phase = 'selecting';
    battle.needSwitchPlayerId = null;
    battle.turn += 1;
    battle.player1Command = null;
    battle.player2Command = null;

    const battleState = buildBattleState(battle);
    const turnResult: TurnResult = {
      battleState,
      turnEvents,
    };

    await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
    battleManager.updateBattle(battleId, battle);
    
    console.log('[Turn Processing] Forced switch completed');
    return;
  }

  // 通常のターン処理（selecting フェーズ）
  const player1Command = battle.player1Command!;
  const player2Command = battle.player2Command!;

  console.log('[Turn Processing] Player1 command:', player1Command);
  console.log('[Turn Processing] Player2 command:', player2Command);

  // 降参処理
  if (player1Command.type === 'surrender') {
    console.log('[Turn Processing] Player1 surrendered');
    battle.winnerId = battle.player2Id;
    battle.phase = 'finished';

    const battleState = buildBattleState(battle);
    const turnResult: TurnResult = {
      battleState,
      turnEvents: [],
      gameOver: {
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
    battle.phase = 'finished';

    const battleState = buildBattleState(battle);
    const turnResult: TurnResult = {
      battleState,
      turnEvents: [],
      gameOver: {
        winnerId: battle.player1Id,
        reason: 'surrender',
      },
    };

    await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
    battleManager.endBattle(battleId);
    return;
  }

  // パターン3: 片方が交代、片方が技
  if ((player1Command.type === 'switch' && player2Command.type === 'move') ||
      (player1Command.type === 'move' && player2Command.type === 'switch')) {
    console.log('[Turn Processing] One switch, one move');

    const switchCommand = player1Command.type === 'switch' ? player1Command : player2Command;
    if (switchCommand.type !== 'switch') return;
    
    const switchPlayerId = player1Command.type === 'switch' ? battle.player1Id : battle.player2Id;
    const switchPokemonArray = player1Command.type === 'switch' ? battle.player1Pokemon : battle.player2Pokemon;

    if (player1Command.type === 'switch') {
      battle.player1ActiveIndex = switchCommand.pokemonIndex;
    } else {
      battle.player2ActiveIndex = switchCommand.pokemonIndex;
    }

    turnEvents.push({
      type: 'switch',
      player: switchPlayerId,
      pokemonName: switchPokemonArray[switchCommand.pokemonIndex].name,
      pokemonIndex: switchCommand.pokemonIndex,
    });

    battle.phase = 'selecting';
    battle.turn += 1;
    battle.player1Command = null;
    battle.player2Command = null;

    const battleState = buildBattleState(battle);
    const turnResult: TurnResult = {
      battleState,
      turnEvents,
    };

    await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
    battleManager.updateBattle(battleId, battle);

    console.log('[Turn Processing] Switch completed, moving to next turn');
    return;
  }

  // パターン4: 両方が交代
  if (player1Command.type === 'switch' && player2Command.type === 'switch') {
    console.log('[Turn Processing] Both players switching');

    battle.player1ActiveIndex = player1Command.pokemonIndex;
    battle.player2ActiveIndex = player2Command.pokemonIndex;

    turnEvents.push({
      type: 'switch',
      player: battle.player1Id,
      pokemonName: battle.player1Pokemon[player1Command.pokemonIndex].name,
      pokemonIndex: player1Command.pokemonIndex,
    });

    turnEvents.push({
      type: 'switch',
      player: battle.player2Id,
      pokemonName: battle.player2Pokemon[player2Command.pokemonIndex].name,
      pokemonIndex: player2Command.pokemonIndex,
    });

    battle.phase = 'selecting';
    battle.turn += 1;
    battle.player1Command = null;
    battle.player2Command = null;

    const battleState = buildBattleState(battle);
    const turnResult: TurnResult = {
      battleState,
      turnEvents,
    };

    await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
    battleManager.updateBattle(battleId, battle);

    console.log('[Turn Processing] Both switches completed');
    return;
  }

  // パターン1/2: 両方が技
  if (player1Command.type === 'move' && player2Command.type === 'move') {
    console.log('[Turn Processing] Both players using moves');

    const player1Pokemon = battle.player1Pokemon[battle.player1ActiveIndex];
    const player2Pokemon = battle.player2Pokemon[battle.player2ActiveIndex];

    const [first, second] = determineOrder(player1Pokemon, player2Pokemon);
    const firstIsPlayer1 = first === player1Pokemon;

    console.log('[Turn Processing] First attacker is Player1:', firstIsPlayer1);

    const firstCommand = firstIsPlayer1 ? player1Command : player2Command;
    const secondCommand = firstIsPlayer1 ? player2Command : player1Command;

    // 先攻の攻撃
    if (firstCommand.type === 'move') {
      const attacker = first;
      const defender = second;
      const move = attacker.moves[firstCommand.moveIndex];

      console.log('[Turn Processing] First attack:', move.name);

      const result = calculateDamage(attacker, defender, move);
      const newHp = Math.max(0, defender.currentHp - result.damage);
      defender.currentHp = newHp;

      turnEvents.push({
        type: 'move',
        attacker: firstIsPlayer1 ? battle.player1Id : battle.player2Id,
        attackerName: attacker.name,
        defender: firstIsPlayer1 ? battle.player2Id : battle.player1Id,
        defenderName: defender.name,
        moveName: move.name,
        damage: result.damage,
        newHp: newHp,
        effectiveness: result.effectiveness,
        isCritical: result.isCritical,
        fainted: newHp === 0,
      });

      // 後攻が瀕死になった場合
      if (defender.currentHp === 0) {
        console.log('[Turn Processing] Defender fainted');

        const defenderPokemon = firstIsPlayer1 ? battle.player2Pokemon : battle.player1Pokemon;
        const allFainted = defenderPokemon.every(p => p.currentHp === 0);

        if (allFainted) {
          // パターン1: 後攻瀕死→ゲーム終了
          console.log('[Turn Processing] All Pokemon fainted, battle over');
          battle.winnerId = firstIsPlayer1 ? battle.player1Id : battle.player2Id;
          battle.phase = 'finished';

          const battleState = buildBattleState(battle);
          const turnResult: TurnResult = {
            battleState,
            turnEvents,
            gameOver: {
              winnerId: battle.winnerId,
              reason: 'all-fainted',
            },
          };

          await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
          battleManager.endBattle(battleId);
          return;
        }

        // 後攻の強制交代が必要
        console.log('[Turn Processing] Defender needs to switch');
        battle.phase = 'action';
        battle.needSwitchPlayerId = firstIsPlayer1 ? battle.player2Id : battle.player1Id;
        battle.player1Command = null;
        battle.player2Command = null;

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
        };

        await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
        battleManager.updateBattle(battleId, battle);
        return;
      }
    }

    // 後攻の攻撃
    if (secondCommand.type === 'move' && second.currentHp > 0) {
      const attacker = second;
      const defender = first;
      const move = attacker.moves[secondCommand.moveIndex];

      console.log('[Turn Processing] Second attack:', move.name);

      const result = calculateDamage(attacker, defender, move);
      const newHp = Math.max(0, defender.currentHp - result.damage);
      defender.currentHp = newHp;

      turnEvents.push({
        type: 'move',
        attacker: firstIsPlayer1 ? battle.player2Id : battle.player1Id,
        attackerName: attacker.name,
        defender: firstIsPlayer1 ? battle.player1Id : battle.player2Id,
        defenderName: defender.name,
        moveName: move.name,
        damage: result.damage,
        newHp: newHp,
        effectiveness: result.effectiveness,
        isCritical: result.isCritical,
        fainted: newHp === 0,
      });

      // 先攻が瀕死になった場合
      if (defender.currentHp === 0) {
        console.log('[Turn Processing] First attacker fainted');

        const defenderPokemon = firstIsPlayer1 ? battle.player1Pokemon : battle.player2Pokemon;
        const allFainted = defenderPokemon.every(p => p.currentHp === 0);

        if (allFainted) {
          // パターン2: 先攻瀕死→ゲーム終了
          console.log('[Turn Processing] All Pokemon fainted, battle over');
          battle.winnerId = firstIsPlayer1 ? battle.player2Id : battle.player1Id;
          battle.phase = 'finished';

          const battleState = buildBattleState(battle);
          const turnResult: TurnResult = {
            battleState,
            turnEvents,
            gameOver: {
              winnerId: battle.winnerId,
              reason: 'all-fainted',
            },
          };

          await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
          battleManager.endBattle(battleId);
          return;
        }

        // 先攻の強制交代が必要
        console.log('[Turn Processing] First attacker needs to switch');
        battle.phase = 'action';
        battle.needSwitchPlayerId = firstIsPlayer1 ? battle.player1Id : battle.player2Id;
        battle.player1Command = null;
        battle.player2Command = null;

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
        };

        await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
        battleManager.updateBattle(battleId, battle);
        return;
      }
    }
  }

  // 両攻撃で誰も瀕死にならなかった場合、次のターンへ
  console.log('[Turn Processing] Turn completed, moving to next turn');
  battle.phase = 'selecting';
  battle.turn += 1;
  battle.player1Command = null;
  battle.player2Command = null;

  const battleState = buildBattleState(battle);
  const turnResult: TurnResult = {
    battleState,
    turnEvents,
  };

  await pusherServer.trigger(`battle-${battleId}`, 'turn-result', turnResult);
  battleManager.updateBattle(battleId, battle);

  console.log('[Turn Processing] Turn ended, waiting for next commands');
}
