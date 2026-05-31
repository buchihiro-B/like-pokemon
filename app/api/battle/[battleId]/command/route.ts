import { NextRequest, NextResponse } from "next/server";
import {
  battleManager,
  PlayerBattleState,
  InternalBattleState,
} from "@/lib/battle-manager";
import { pusherServer } from "@/lib/pusher";
import { calculateDamage, determineOrder } from "@/lib/battle-logic";
import { applyMoveEffects } from "@/lib/move-effects";
import {
  BattleCommand,
  TurnEvent,
  TurnResult,
  BattleState,
  PlayerState,
  MoveEffectResult,
  BattlePokemon,
  BattlePhase,
  Move,
} from "@/lib/types/pokemon";
import { getEffectiveStat } from "@/lib/move-effects";

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
    pokemon: BattlePokemon[];
    activeIndex: number;
    command: BattleCommand | null;
  };
  player2: {
    id: string;
    pokemon: BattlePokemon[];
    activeIndex: number;
    command: BattleCommand | null;
  };
  turn: number;
  phase: BattlePhase;
  needSwitchPlayerId: string[];
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

// 相手を対象とする技かどうかを判定するヘルパー関数
function isTargetingOpponent(move: Move): boolean {
  // 攻撃技（power > 0）は相手を対象
  if (move.power > 0) return true;

  // 変化技の場合、effectsのtargetがopponentかチェック
  if (move.effects) {
    return move.effects.some((effect) => effect.target === "opponent");
  }

  return false;
}

// 状態異常ダメージを適用するヘルパー関数
function applyStatusDamage(
  pokemon1: BattlePokemon,
  playerId1: string,
  pokemon2: BattlePokemon,
  playerId2: string,
  turnEvents: TurnEvent[],
): void {
  const pokemon1Speed = getEffectiveStat(pokemon1, "speed");
  const pokemon2Speed = getEffectiveStat(pokemon2, "speed");

  // ポケモン1の素早さが高い場合
  if (pokemon1Speed > pokemon2Speed) {
    // ポケモン1の状態異常ダメージ処理
    const statusDamage1 = calcStatusDamage(pokemon1, playerId1);
    if (statusDamage1) {
      turnEvents.push(statusDamage1);
    }

    // ポケモン2の状態異常ダメージ処理
    const statusDamage2 = calcStatusDamage(pokemon2, playerId2);
    if (statusDamage2) {
      turnEvents.push(statusDamage2);
    }
  }
  // ポケモン2の素早さが高い場合
  else {
    // ポケモン2の状態異常ダメージ処理
    const statusDamage2 = calcStatusDamage(pokemon2, playerId2);
    if (statusDamage2) {
      turnEvents.push(statusDamage2);
    }

    // ポケモン1の状態異常ダメージ処理
    const statusDamage1 = calcStatusDamage(pokemon1, playerId1);
    if (statusDamage1) {
      turnEvents.push(statusDamage1);
    }
  }
}

function calcStatusDamage(
  pokemon: BattlePokemon,
  playerId: string,
): TurnEvent | null {
  const damageStatusType = ["やけど", "どく"];
  // 状態異常がない、またはダメージを与えない状態異常の場合
  if (!pokemon.status || !damageStatusType.includes(pokemon.status)) {
    return null;
  }

  // やけどの場合
  if (pokemon.status === "やけど") {
    const damage = Math.floor(pokemon.maxHp);
    // const damage = Math.floor(pokemon.maxHp / 16);
    const newHp = Math.max(0, pokemon.currentHp - damage);
    pokemon.currentHp = newHp;

    return {
      type: "statusDamage",
      player: playerId,
      pokemonName: pokemon.name,
      status: "やけど",
      damage,
      newHp,
      fainted: newHp === 0,
    };
  }
  // どくの場合
  else if (pokemon.status === "どく") {
    const damage = Math.floor(pokemon.maxHp);
    // const damage = Math.floor(pokemon.maxHp / 8);
    const newHp = Math.max(0, pokemon.currentHp - damage);
    pokemon.currentHp = newHp;

    return {
      type: "statusDamage",
      player: playerId,
      pokemonName: pokemon.name,
      status: "どく",
      damage,
      newHp,
      fainted: newHp === 0,
    };
  }

  return null;
}

function vergeOfDeathJudge(
  pokemon1: BattlePokemon,
  pokemon2: BattlePokemon,
  battle: InternalBattleState,
  turnEvents: TurnEvent[],
): TurnResult {
  const pokemon1Fainted = pokemon1.currentHp === 0;
  const pokemon2Fainted = pokemon2.currentHp === 0;

  // ポケモン1が瀕死かつポケモン2が瀕死の場合
  if (pokemon1Fainted && pokemon2Fainted) {
    const allFaintedPokemon1 = battle.player1.pokemon.every(
      (p) => p.currentHp === 0,
    );
    const allFaintedPokemon2 = battle.player2.pokemon.every(
      (p) => p.currentHp === 0,
    );

    // 両者交代可能の場合
    if (!allFaintedPokemon1 && !allFaintedPokemon2) {
      battle.phase = "action";
      battle.needSwitchPlayerId = [battle.player1.id, battle.player2.id];
      battle.player1.command = null;
      battle.player2.command = null;

      const battleState = buildBattleState(battle);
      const turnResult: TurnResult = {
        battleState,
        turnEvents,
      };
      return turnResult;
    }
    // プレイヤー1のみ交代可能の場合
    else if (!allFaintedPokemon1 && allFaintedPokemon2) {
      battle.phase = "finished";

      const battleState = buildBattleState(battle);
      const turnResult: TurnResult = {
        battleState,
        turnEvents,
        gameOver: {
          winnerId: battle.player1.id,
          reason: "all-fainted",
        },
      };
      return turnResult;
    }
    // プレイヤー2のみ交代可能の場合
    else if (allFaintedPokemon1 && !allFaintedPokemon2) {
      battle.phase = "finished";

      const battleState = buildBattleState(battle);
      const turnResult: TurnResult = {
        battleState,
        turnEvents,
        gameOver: {
          winnerId: battle.player2.id,
          reason: "all-fainted",
        },
      };
      return turnResult;
    }
    // 両者全滅の場合
    else {
      battle.phase = "finished";

      const battleState = buildBattleState(battle);
      const turnResult: TurnResult = {
        battleState,
        turnEvents,
        gameOver: {
          winnerId: null,
          reason: "draw",
        },
      };
      return turnResult;
    }
  }
  // ポケモン1が瀕死かつポケモン2が瀕死ではない場合
  else if (pokemon1Fainted && !pokemon2Fainted) {
    const allFaintedPokemon1 = battle.player1.pokemon.every(
      (p) => p.currentHp === 0,
    );

    // プレイヤー1のポケモンが全滅している場合
    if (allFaintedPokemon1) {
      battle.phase = "finished";

      const battleState = buildBattleState(battle);
      const turnResult: TurnResult = {
        battleState,
        turnEvents,
        gameOver: {
          winnerId: battle.player2.id,
          reason: "all-fainted",
        },
      };
      return turnResult;
    } else {
      battle.phase = "action";
      battle.needSwitchPlayerId = [battle.player1.id];
      battle.player1.command = null;
      battle.player2.command = null;

      const battleState = buildBattleState(battle);
      const turnResult: TurnResult = {
        battleState,
        turnEvents,
      };
      return turnResult;
    }
  }
  // ポケモン1が瀕死ではないかつポケモン2が瀕死の場合
  else if (!pokemon1Fainted && pokemon2Fainted) {
    const allFaintedPokemon2 = battle.player2.pokemon.every(
      (p) => p.currentHp === 0,
    );

    // プレイヤー2のポケモンが全滅している場合
    if (allFaintedPokemon2) {
      battle.phase = "finished";

      const battleState = buildBattleState(battle);
      const turnResult: TurnResult = {
        battleState,
        turnEvents,
        gameOver: {
          winnerId: battle.player1.id,
          reason: "all-fainted",
        },
      };
      return turnResult;
    } else {
      battle.phase = "action";
      battle.needSwitchPlayerId = [battle.player2.id];
      battle.player1.command = null;
      battle.player2.command = null;

      const battleState = buildBattleState(battle);
      const turnResult: TurnResult = {
        battleState,
        turnEvents,
      };
      return turnResult;
    }
  }
  // ポケモン1が瀕死ではないかつポケモン2が瀕死ではない場合
  else {
    battle.phase = "action";
    battle.player1.command = null;
    battle.player2.command = null;

    const battleState = buildBattleState(battle);
    const turnResult: TurnResult = {
      battleState,
      turnEvents,
    };
    return turnResult;
  }
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

    // リチャージ中の場合はスキップ
    if (attacker.mustRecharge) {
      attacker.mustRecharge = false;
      turnEvents.push({
        type: "move",
        attacker: movePlayer.id,
        attackerName: attacker.name,
        defender: switchPlayer.id,
        defenderName: defender.name,
        moveName: "行動不能",
        damage: 0,
        newHp: defender.currentHp,
        effectiveness: 1,
        isCritical: false,
        fainted: false,
        hit: false,
      });
    } else if (defender.isProtected && isTargetingOpponent(move)) {
      // プロテクト状態で相手を対象とする技を受けた場合
      defender.isProtected = false;
      turnEvents.push({
        type: "move",
        attacker: movePlayer.id,
        attackerName: attacker.name,
        defender: switchPlayer.id,
        defenderName: defender.name,
        moveName: move.name,
        damage: 0,
        newHp: defender.currentHp,
        effectiveness: 1,
        isCritical: false,
        fainted: false,
        hit: true,
        protected: true,
      });
    } else {
      const result = calculateDamage(attacker, defender, move, true);
      const newHp = Math.max(0, defender.currentHp - result.damage);
      defender.currentHp = newHp;

      // 技の追加効果を適用
      let effectResults: MoveEffectResult[] = [];
      // 変化技は常に効果発動、攻撃技はダメージを与えた場合のみ
      if (move.effects && (move.category === "変化" || result.damage > 0)) {
        effectResults = applyMoveEffects(move.effects, attacker, defender);
      }

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
        hit: result.hit,
        effects: effectResults.length > 0 ? effectResults : undefined,
      });
    }

    // 瀕死判定
    if (defender.currentHp === 0) {
      const allFainted = switchPlayer.pokemon.every((p) => p.currentHp === 0);

      // すべてのポケモンが瀕死の場合
      if (allFainted) {
        battle.phase = "finished";

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
          gameOver: {
            winnerId: switchPlayer.id,
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
        battle.needSwitchPlayerId = [switchPlayer.id];
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

    // ターン終了時の状態異常ダメージ
    applyStatusDamage(
      attacker,
      movePlayer.id,
      defender,
      switchPlayer.id,
      turnEvents,
    );

    // 状態異常ダメージによる瀕死判定
    const turnStatusDamageResult = vergeOfDeathJudge(
      defender,
      attacker,
      battle,
      turnEvents,
    );
    if (turnStatusDamageResult.gameOver) {
      await pusherServer.trigger(
        `battle-${battleId}`,
        "turn-result",
        turnStatusDamageResult,
      );
      battleManager.endBattle(battleId);
      return;
    }
    // 状態異常ダメージによる交代判定
    else if (turnStatusDamageResult.battleState.needSwitchPlayerId.length > 0) {
      await pusherServer.trigger(
        `battle-${battleId}`,
        "turn-result",
        turnStatusDamageResult,
      );

      battleManager.updateBattle(battleId, battle);
      return;
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

    // ターン終了時の状態異常ダメージ
    applyStatusDamage(
      battle.player1.pokemon[player1Command.pokemonIndex],
      battle.player1.id,
      battle.player2.pokemon[player2Command.pokemonIndex],
      battle.player2.id,
      turnEvents,
    );

    // 状態異常ダメージによる瀕死判定
    const turnStatusDamageResult = vergeOfDeathJudge(
      battle.player1.pokemon[player1Command.pokemonIndex],
      battle.player2.pokemon[player2Command.pokemonIndex],
      battle,
      turnEvents,
    );

    // 状態異常ダメージによるゲーム終了判定
    if (turnStatusDamageResult.gameOver) {
      await pusherServer.trigger(
        `battle-${battleId}`,
        "turn-result",
        turnStatusDamageResult,
      );
      battleManager.endBattle(battleId);
      return;
    }
    // 状態異常ダメージによる交代判定
    else if (turnStatusDamageResult.battleState.needSwitchPlayerId.length > 0) {
      await pusherServer.trigger(
        `battle-${battleId}`,
        "turn-result",
        turnStatusDamageResult,
      );
      battleManager.updateBattle(battleId, battle);
      return;
    }

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
    const attacker1 = battle.player1.pokemon[battle.player1.activeIndex];
    const attacker2 = battle.player2.pokemon[battle.player2.activeIndex];
    const move1 = attacker1.moves[player1Command.moveIndex];
    const move2 = attacker2.moves[player2Command.moveIndex];

    const [firstPokemon, secondPokemon, isPlayer1First] = determineOrder(
      attacker1,
      attacker2,
      move1,
      move2,
    );

    let firstPlayer: PlayerBattleState;
    let secondPlayer: PlayerBattleState;
    let firstMove;
    let secondMove;

    // プレイヤー1のポケモンが先行の場合
    if (isPlayer1First) {
      firstPlayer = battle.player1;
      secondPlayer = battle.player2;
      firstMove = move1;
      secondMove = move2;
    } else {
      firstPlayer = battle.player2;
      secondPlayer = battle.player1;
      firstMove = move2;
      secondMove = move1;
    }

    // 型ガードで安全性を確保
    if (firstPlayer.command!.type !== "move") return;
    if (secondPlayer.command!.type !== "move") return;

    // 先攻がリチャージ中の場合はスキップ
    if (firstPokemon.mustRecharge) {
      firstPokemon.mustRecharge = false;
      turnEvents.push({
        type: "move",
        attacker: firstPlayer.id,
        attackerName: firstPokemon.name,
        defender: secondPlayer.id,
        defenderName: secondPokemon.name,
        moveName: "行動不能",
        damage: 0,
        newHp: secondPokemon.currentHp,
        effectiveness: 1,
        isCritical: false,
        fainted: false,
        hit: false,
      });
    } else {
      console.log("[Turn Processing] First attack:", firstMove.name);

      // プロテクト状態の確認
      if (secondPokemon.isProtected && isTargetingOpponent(firstMove)) {
        secondPokemon.isProtected = false;
        turnEvents.push({
          type: "move",
          attacker: firstPlayer.id,
          attackerName: firstPokemon.name,
          defender: secondPlayer.id,
          defenderName: secondPokemon.name,
          moveName: firstMove.name,
          damage: 0,
          newHp: secondPokemon.currentHp,
          effectiveness: 1,
          isCritical: false,
          fainted: false,
          hit: true,
          protected: true,
        });
      } else {
        const result = calculateDamage(
          firstPokemon,
          secondPokemon,
          firstMove,
          true,
        );
        const newHp = Math.max(0, secondPokemon.currentHp - result.damage);
        secondPokemon.currentHp = newHp;

        // 技の追加効果を適用
        let effectResults: MoveEffectResult[] = [];
        // 変化技は常に効果発動、攻撃技はダメージを与えた場合のみ
        if (
          firstMove.effects &&
          (firstMove.category === "変化" || result.damage > 0)
        ) {
          effectResults = applyMoveEffects(
            firstMove.effects,
            firstPokemon,
            secondPokemon,
          );
        }

        turnEvents.push({
          type: "move",
          attacker: firstPlayer.id,
          attackerName: firstPokemon.name,
          defender: secondPlayer.id,
          defenderName: secondPokemon.name,
          moveName: firstMove.name,
          damage: result.damage,
          newHp: newHp,
          effectiveness: result.effectiveness,
          isCritical: result.isCritical,
          fainted: newHp === 0,
          hit: result.hit,
          effects: effectResults.length > 0 ? effectResults : undefined,
        });
      }
    }

    // 後攻が瀕死になった場合
    if (secondPokemon.currentHp === 0) {
      const allFainted = secondPlayer.pokemon.every((p) => p.currentHp === 0);

      // すべてのポケモンが瀕死の場合
      if (allFainted) {
        // 全滅→ゲーム終了
        battle.phase = "finished";

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
          gameOver: {
            winnerId: firstPlayer.id,
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
        battle.needSwitchPlayerId = [secondPlayer.id];
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
      // 後攻がリチャージ中の場合はスキップ
      if (secondPokemon.mustRecharge) {
        secondPokemon.mustRecharge = false;
        turnEvents.push({
          type: "move",
          attacker: secondPlayer.id,
          attackerName: secondPokemon.name,
          defender: firstPlayer.id,
          defenderName: firstPokemon.name,
          moveName: "行動不能",
          damage: 0,
          newHp: firstPokemon.currentHp,
          effectiveness: 1,
          isCritical: false,
          fainted: false,
          hit: false,
        });
      } else {
        console.log("[Turn Processing] Second attack:", secondMove.name);

        // プロテクト状態の確認
        if (firstPokemon.isProtected && isTargetingOpponent(secondMove)) {
          firstPokemon.isProtected = false;
          turnEvents.push({
            type: "move",
            attacker: secondPlayer.id,
            attackerName: secondPokemon.name,
            defender: firstPlayer.id,
            defenderName: firstPokemon.name,
            moveName: secondMove.name,
            damage: 0,
            newHp: firstPokemon.currentHp,
            effectiveness: 1,
            isCritical: false,
            fainted: false,
            hit: true,
            protected: true,
          });
        } else {
          const secondResult = calculateDamage(
            secondPokemon,
            firstPokemon,
            secondMove,
            false,
          );
          const secondNewHp = Math.max(
            0,
            firstPokemon.currentHp - secondResult.damage,
          );
          firstPokemon.currentHp = secondNewHp;

          // 技の追加効果を適用
          let effectResults: MoveEffectResult[] = [];
          // 変化技は常に効果発動、攻撃技はダメージを与えた場合のみ
          if (
            secondMove.effects &&
            (secondMove.category === "変化" || secondResult.damage > 0)
          ) {
            effectResults = applyMoveEffects(
              secondMove.effects,
              secondPokemon,
              firstPokemon,
            );
          }

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
            hit: secondResult.hit,
            effects: effectResults.length > 0 ? effectResults : undefined,
          });
        }

        // プロテクト状態をリセット
        firstPokemon.isProtected = false;
      }

      // 先攻が瀕死になった場合
      if (firstPokemon.currentHp === 0) {
        const allFainted = firstPlayer.pokemon.every((p) => p.currentHp === 0);

        // すべてのポケモンが瀕死の場合
        if (allFainted) {
          battle.phase = "finished";

          const battleState = buildBattleState(battle);
          const turnResult: TurnResult = {
            battleState,
            turnEvents,
            gameOver: {
              winnerId: secondPlayer.id,
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
          battle.needSwitchPlayerId = [firstPlayer.id];
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

    // プロテクト状態をリセット（ターン終了時）
    attacker1.isProtected = false;
    attacker2.isProtected = false;

    // ターン終了時の状態異常ダメージ
    applyStatusDamage(
      attacker1,
      battle.player1.id,
      attacker2,
      battle.player2.id,
      turnEvents,
    );

    // 状態異常ダメージによる瀕死判定
    const player1Fainted = attacker1.currentHp === 0;
    const player2Fainted = attacker2.currentHp === 0;

    // 両者瀕死の場合
    if (player1Fainted && player2Fainted) {
      const player1AllFainted = battle.player1.pokemon.every(
        (p) => p.currentHp === 0,
      );
      const player2AllFainted = battle.player2.pokemon.every(
        (p) => p.currentHp === 0,
      );

      // 両者全滅の場合は引き分け（先に全滅したほうの負け、ここでは引き分けとする）
      if (player1AllFainted && player2AllFainted) {
        battle.phase = "finished";

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
          gameOver: {
            winnerId: battle.player1.id, // 仮に player1 を勝者とする
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
      // プレイヤー1のみ全滅
      else if (player1AllFainted) {
        battle.phase = "finished";

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
          gameOver: {
            winnerId: battle.player2.id,
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
      // プレイヤー2のみ全滅
      else if (player2AllFainted) {
        battle.phase = "finished";

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
          gameOver: {
            winnerId: battle.player1.id,
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
      // 両者とも交代可能
      else {
        battle.phase = "action";
        battle.needSwitchPlayerId = [battle.player1.id, battle.player2.id];
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
    // プレイヤー1のみ瀕死
    else if (player1Fainted) {
      const allFainted = battle.player1.pokemon.every((p) => p.currentHp === 0);

      if (allFainted) {
        battle.phase = "finished";

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
          gameOver: {
            winnerId: battle.player2.id,
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
      } else {
        battle.phase = "action";
        battle.needSwitchPlayerId = [battle.player1.id];
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
    // プレイヤー2のみ瀕死
    else if (player2Fainted) {
      const allFainted = battle.player2.pokemon.every((p) => p.currentHp === 0);

      if (allFainted) {
        battle.phase = "finished";

        const battleState = buildBattleState(battle);
        const turnResult: TurnResult = {
          battleState,
          turnEvents,
          gameOver: {
            winnerId: battle.player1.id,
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
      } else {
        battle.phase = "action";
        battle.needSwitchPlayerId = [battle.player2.id];
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
