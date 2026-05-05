import { NextRequest, NextResponse } from "next/server";
import { battleManager, PlayerBattleState } from "@/lib/battle-manager";
import { pusherServer } from "@/lib/pusher";
import { calculateDamage, determineOrder } from "@/lib/battle-logic";
import {
  BattleCommand,
  TurnEvent,
  TurnResult,
  BattleState,
  PlayerState,
} from "@/lib/types/pokemon";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ battleId: string }> },
) {
  try {
    const { battleId } = await params;
    const { playerId, command }: { playerId: string; command: BattleCommand } =
      await request.json();

    console.log("[Battle Command] Received command:", {
      battleId,
      playerId,
      command,
    });

    const battle = battleManager.getBattle(battleId);

    if (!battle) {
      console.log("[Battle Command] Battle not found!");
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }

    battleManager.setCommand(battleId, playerId, command);
    console.log("[Battle Command] Command saved");

    const bothReady = battleManager.bothCommandsReady(battleId);
    console.log("[Battle Command] Both commands ready:", bothReady);

    if (bothReady) {
      console.log("[Battle Command] Processing turn...");
      await processTurn(battleId);
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Error in battle command:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

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
  needSwitchPlayerId: string | null;
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

// ターン処理の関数
async function processTurn(battleId: string) {
  console.log("[Turn Processing] Starting turn for battle:", battleId);

  const battle = battleManager.getBattle(battleId);
  // 対戦情報が取得できない場合
  if (!battle) {
    return;
  }

  const turnEvents: TurnEvent[] = [];

  const player1Command = battle.player1.command!;
  const player2Command = battle.player2.command!;

  // 降参処理（プレイヤー1）
  if (player1Command.type === "surrender") {
    battle.winnerId = battle.player2.id;
    battle.phase = "finished";

    const battleState = buildBattleState(battle);
    const turnResult: TurnResult = {
      battleState,
      turnEvents: [],
      gameOver: {
        winnerId: battle.player2.id,
        reason: "surrender",
      },
    };

    await pusherServer.trigger(`battle-${battleId}`, "turn-result", turnResult);
    battleManager.endBattle(battleId);
    return;
  }

  // 降参処理（プレイヤー2）
  if (player2Command.type === "surrender") {
    battle.winnerId = battle.player1.id;
    battle.phase = "finished";

    const battleState = buildBattleState(battle);
    const turnResult: TurnResult = {
      battleState,
      turnEvents: [],
      gameOver: {
        winnerId: battle.player1.id,
        reason: "surrender",
      },
    };

    await pusherServer.trigger(`battle-${battleId}`, "turn-result", turnResult);
    battleManager.endBattle(battleId);
    return;
  }

  // 片方が交代、片方が技の場合
  if (
    (player1Command.type === "switch" && player2Command.type === "move") ||
    (player1Command.type === "move" && player2Command.type === "switch")
  ) {
    let switchPlayer: PlayerBattleState;
    let movePlayer: PlayerBattleState;

    // 交代するのがプレイヤー1の場合
    if (player1Command.type === "switch") {
      switchPlayer = battle.player1;
      movePlayer = battle.player2;
    }
    // 交代するのがプレイヤー2の場合
    else {
      switchPlayer = battle.player2;
      movePlayer = battle.player1;
    }

    const switchCommand = switchPlayer.command!;
    const moveCommand = movePlayer.command!;

    // 型ガードで安全性を確保
    if (switchCommand.type !== "switch") return;
    if (moveCommand.type !== "move") return;

    // 交代実行
    switchPlayer.activeIndex = switchCommand.pokemonIndex;

    turnEvents.push({
      type: "switch",
      player: switchPlayer.id,
      pokemonName: switchPlayer.pokemon[switchCommand.pokemonIndex].name,
      pokemonIndex: switchCommand.pokemonIndex,
    });

    // 技使用処理
    const attacker = movePlayer.pokemon[movePlayer.activeIndex];
    const defender = switchPlayer.pokemon[switchPlayer.activeIndex];

    const move = attacker.moves[moveCommand.moveIndex];
    console.log("[Turn Processing] Move after switch:", move.name);

    const result = calculateDamage(attacker, defender, move);
    const newHp = Math.max(0, defender.currentHp - result.damage);
    defender.currentHp = newHp;

    turnEvents.push({
      type: "move",
      attacker: movePlayer.id,
      attackerName: attacker.name,
      defender: switchPlayer.id,
      defenderName: defender.name,
      moveName: move.name,
      damage: result.damage,
      newHp: newHp,
      effectiveness: result.effectiveness,
      isCritical: result.isCritical,
      fainted: newHp === 0,
    });

    // 瀕死判定
    if (defender.currentHp === 0) {
      const allFainted = switchPlayer.pokemon.every((p) => p.currentHp === 0);

      // すべてのポケモンが瀕死の場合
      if (allFainted) {
        battle.winnerId = movePlayer.id;
        battle.phase = "finished";

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
          gameOver: {
            winnerId: battle.winnerId,
            reason: "all-fainted",
          },
        };

        await pusherServer.trigger(
          `battle-${battleId}`,
          "turn-result",
          turnResult,
        );
        battleManager.endBattle(battleId);
        return;
      }
      // 交代可能な場合
      else {
        battle.phase = "action";
        battle.needSwitchPlayerId = switchPlayer.id;
        battle.player1.command = null;
        battle.player2.command = null;

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
        };

        await pusherServer.trigger(
          `battle-${battleId}`,
          "turn-result",
          turnResult,
        );
        battleManager.updateBattle(battleId, battle);
        return;
      }
    }

    // 次のターンへ
    battle.phase = "selecting";
    battle.turn += 1;
    battle.player1.command = null;
    battle.player2.command = null;

    const battleState = buildBattleState(battle);
    const turnResult: TurnResult = {
      battleState,
      turnEvents,
    };

    await pusherServer.trigger(`battle-${battleId}`, "turn-result", turnResult);
    battleManager.updateBattle(battleId, battle);

    return;
  }

  // 両方交代の場合
  if (player1Command.type === "switch" && player2Command.type === "switch") {
    battle.player1.activeIndex = player1Command.pokemonIndex;
    battle.player2.activeIndex = player2Command.pokemonIndex;

    turnEvents.push({
      type: "switch",
      player: battle.player1.id,
      pokemonName: battle.player1.pokemon[player1Command.pokemonIndex].name,
      pokemonIndex: player1Command.pokemonIndex,
    });

    turnEvents.push({
      type: "switch",
      player: battle.player2.id,
      pokemonName: battle.player2.pokemon[player2Command.pokemonIndex].name,
      pokemonIndex: player2Command.pokemonIndex,
    });

    battle.phase = "selecting";
    battle.turn += 1;
    battle.player1.command = null;
    battle.player2.command = null;

    const battleState = buildBattleState(battle);
    const turnResult: TurnResult = {
      battleState,
      turnEvents,
    };

    await pusherServer.trigger(`battle-${battleId}`, "turn-result", turnResult);
    battleManager.updateBattle(battleId, battle);

    return;
  }

  // 両者技を選択した場合
  if (player1Command.type === "move" && player2Command.type === "move") {
    const [firstPokemon, secondPokemon] = determineOrder(
      battle.player1.pokemon[battle.player1.activeIndex],
      battle.player2.pokemon[battle.player2.activeIndex],
    );

    let firstPlayer: PlayerBattleState;
    let secondPlayer: PlayerBattleState;

    // プレイヤー1のポケモンが先行の場合
    if (battle.player1.pokemon.includes(firstPokemon)) {
      firstPlayer = battle.player1;
      secondPlayer = battle.player2;
    } else {
      firstPlayer = battle.player2;
      secondPlayer = battle.player1;
    }

    // 型ガードで安全性を確保
    if (firstPlayer.command!.type !== "move") return;
    if (secondPlayer.command!.type !== "move") return;

    // 先攻の攻撃
    const move = firstPokemon.moves[firstPlayer.command!.moveIndex];

    console.log("[Turn Processing] First attack:", move.name);

    const result = calculateDamage(firstPokemon, secondPokemon, move);
    const newHp = Math.max(0, secondPokemon.currentHp - result.damage);
    secondPokemon.currentHp = newHp;

    turnEvents.push({
      type: "move",
      attacker: firstPlayer.id,
      attackerName: firstPokemon.name,
      defender: secondPlayer.id,
      defenderName: secondPokemon.name,
      moveName: move.name,
      damage: result.damage,
      newHp: newHp,
      effectiveness: result.effectiveness,
      isCritical: result.isCritical,
      fainted: newHp === 0,
    });

    // 後攻が瀕死になった場合
    if (secondPokemon.currentHp === 0) {
      const allFainted = secondPlayer.pokemon.every((p) => p.currentHp === 0);

      // すべてのポケモンが瀕死の場合
      if (allFainted) {
        // 全滅→ゲーム終了
        battle.winnerId = firstPlayer.id;
        battle.phase = "finished";

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
          gameOver: {
            winnerId: battle.winnerId,
            reason: "all-fainted",
          },
        };

        await pusherServer.trigger(
          `battle-${battleId}`,
          "turn-result",
          turnResult,
        );
        battleManager.endBattle(battleId);
        return;
      } 
      // 交代可能な場合
      else {
        battle.phase = "action";
        battle.needSwitchPlayerId = secondPlayer.id;
        battle.player1.command = null;
        battle.player2.command = null;

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
        };

        await pusherServer.trigger(
          `battle-${battleId}`,
          "turn-result",
          turnResult,
        );
        battleManager.updateBattle(battleId, battle);
        return;
      }
    }

    // 後攻の攻撃
    if (firstPokemon.currentHp > 0) {
      const secondMove = secondPokemon.moves[secondPlayer.command!.moveIndex];

      console.log("[Turn Processing] Second attack:", secondMove.name);

      const secondResult = calculateDamage(
        secondPokemon,
        firstPokemon,
        secondMove,
      );
      const secondNewHp = Math.max(
        0,
        firstPokemon.currentHp - secondResult.damage,
      );
      firstPokemon.currentHp = secondNewHp;

      turnEvents.push({
        type: "move",
        attacker: secondPlayer.id,
        attackerName: secondPokemon.name,
        defender: firstPlayer.id,
        defenderName: firstPokemon.name,
        moveName: secondMove.name,
        damage: secondResult.damage,
        newHp: secondNewHp,
        effectiveness: secondResult.effectiveness,
        isCritical: secondResult.isCritical,
        fainted: secondNewHp === 0,
      });

      // 先攻が瀕死になった場合
      if (firstPokemon.currentHp === 0) {
        const allFainted = firstPlayer.pokemon.every((p) => p.currentHp === 0);

        // すべてのポケモンが瀕死の場合
        if (allFainted) {
          battle.winnerId = secondPlayer.id;
          battle.phase = "finished";

          const battleState = buildBattleState(battle);
          const turnResult: TurnResult = {
            battleState,
            turnEvents,
            gameOver: {
              winnerId: battle.winnerId,
              reason: "all-fainted",
            },
          };

          await pusherServer.trigger(
            `battle-${battleId}`,
            "turn-result",
            turnResult,
          );
          battleManager.endBattle(battleId);
          return;
        } 
        // 交代可能な場合
        else {
          battle.phase = "action";
          battle.needSwitchPlayerId = firstPlayer.id;
          battle.player1.command = null;
          battle.player2.command = null;

          const battleState = buildBattleState(battle);
          const turnResult: TurnResult = {
            battleState,
            turnEvents,
          };

          await pusherServer.trigger(
            `battle-${battleId}`,
            "turn-result",
            turnResult,
          );
          battleManager.updateBattle(battleId, battle);
          return;
        }
      }
    }
  }

  // 両攻撃で誰も瀕死にならなかった場合、次のターンへ
  battle.phase = "selecting";
  battle.turn += 1;
  battle.player1.command = null;
  battle.player2.command = null;

  const battleState = buildBattleState(battle);
  const turnResult: TurnResult = {
    battleState,
    turnEvents,
  };

  await pusherServer.trigger(`battle-${battleId}`, "turn-result", turnResult);
  battleManager.updateBattle(battleId, battle);
}
