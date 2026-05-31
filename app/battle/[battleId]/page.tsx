"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  getTypeColor,
  getTypeTextColor,
  getTypeEffectiveness,
  getEffectivenessSymbol,
} from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BattleCommand,
  TurnResult,
  TurnEvent,
  PlayerState,
} from "@/lib/types/pokemon";
import { getPusherClient } from "@/lib/pusher";
import { MESSAGES, STAT_NAMES, formatMessage } from "@/lib/messages";

export default function BattlePage({
  params,
}: {
  params: Promise<{ battleId: string }>;
}) {
  const resolvedParams = use(params);
  const battleId = resolvedParams.battleId;
  const searchParams = useSearchParams();
  const router = useRouter();

  const playerId = searchParams.get("playerId") || "";
  const isPlayer1 = searchParams.get("isPlayer1") === "true";

  const [player1State, setPlayer1State] = useState<PlayerState | null>(null);
  const [player2State, setPlayer2State] = useState<PlayerState | null>(null);
  const [battlePhase, setBattlePhase] = useState<
    "waiting" | "selecting" | "action" | "finished"
  >("waiting");
  const [needSwitchPlayerId, setNeedSwitchPlayerId] = useState<string[]>([]);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [selectedCommand, setSelectedCommand] = useState<BattleCommand | null>(
    null,
  );
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [showSurrenderDialog, setShowSurrenderDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [commandMenu, setCommandMenu] = useState<"main" | "move" | "pokemon">(
    "main",
  );

  // バトルログにメッセージを追加
  const addLog = (message: string) => {
    console.log("[Battle Log]", message);
    setBattleLog((prev) => [...prev, message]);
  };

  // 簡易的なsleep関数
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // ターンイベントを処理してログに追加
  const processEvent = useCallback(
    async (event: TurnEvent) => {
      // 技の使用イベント
      if (event.type === "move") {
        // 技使用メッセージ
        addLog(
          formatMessage(MESSAGES.MOVE_USE, {
            attackerName: event.attackerName,
            moveName: event.moveName,
          }),
        );

        // プロテクトで攻撃を防いだ場合
        if (event.protected) {
          addLog(
            formatMessage(MESSAGES.PROTECT, {
              target: event.defenderName,
            }),
          );
          return;
        }

        // 攻撃が外れた場合
        if (!event.hit) {
          addLog(MESSAGES.MOVE_MISS);
        }
        // 効果技が命中した場合
        else if (event.damage === 0) {
          // 型ガード
          if (event.effects === undefined) {
            return;
          }

          for (const effect of event.effects) {
            // 状態異常付与の場合
            if (effect.type === "status") {
              addLog(
                formatMessage(MESSAGES.STATUS_INFLICTED, {
                  target: effect.target,
                  status: effect.status,
                }),
              );
            }
            // ステータス変化の場合
            else if (effect.type === "statChange") {
              if (effect.success) {
                const changeStage = effect.newStage - effect.oldStage;
                const statName = STAT_NAMES[effect.stat] || effect.stat;
                if (changeStage === 0) {
                  addLog(
                    formatMessage(MESSAGES.STAT_NO_CHANGE, {
                      target: effect.target,
                      stat: statName,
                    }),
                  );
                } else if (changeStage === 2) {
                  addLog(
                    formatMessage(MESSAGES.STAT_UP_2, {
                      target: effect.target,
                      stat: statName,
                    }),
                  );
                } else if (changeStage === 1) {
                  addLog(
                    formatMessage(MESSAGES.STAT_UP_1, {
                      target: effect.target,
                      stat: statName,
                    }),
                  );
                } else if (changeStage === -1) {
                  addLog(
                    formatMessage(MESSAGES.STAT_DOWN_1, {
                      target: effect.target,
                      stat: statName,
                    }),
                  );
                } else if (changeStage === -2) {
                  addLog(
                    formatMessage(MESSAGES.STAT_DOWN_2, {
                      target: effect.target,
                      stat: statName,
                    }),
                  );
                }
              } else {
                addLog(MESSAGES.EFFECT_FAILED);
              }
            }
            // まもる系の効果の場合（技を使った時は表示しない）
            else if (effect.type === "protect") {
              // プロテクト効果の発動メッセージは、攻撃を防いだ時に表示される
              // ここでは何も表示しない
            }
            // その他の効果の場合
            else {
              addLog(
                formatMessage(MESSAGES.OTHER_EFFECT, {
                  target: effect.target,
                  effectType: effect.type,
                }),
              );
            }
          }
        }
        // 威力技が命中した場合
        else {
          // 急所の場合
          if (event.isCritical) {
            addLog(MESSAGES.CRITICAL_HIT);
          }

          // 効果抜群の場合
          if (event.effectiveness > 1) {
            addLog(MESSAGES.SUPER_EFFECTIVE);
          }
          // 効果いまひとつの場合
          else if (event.effectiveness < 1) {
            addLog(MESSAGES.NOT_VERY_EFFECTIVE);
          }

          addLog(
            formatMessage(MESSAGES.DAMAGE, {
              damage: event.damage.toString(),
            }),
          );
        }

        // ポケモンが倒れた場合
        if (event.fainted) {
          addLog(
            formatMessage(MESSAGES.FAINTED, {
              pokemonName: event.defenderName,
            }),
          );
        }

        await sleep(800);
      }
      // 交換イベント
      else if (event.type === "switch") {
        const isMine = event.player === playerId;

        // 自分が交換する場合
        if (isMine) {
          addLog(
            formatMessage(MESSAGES.SWITCH_MINE, {
              pokemonName: event.pokemonName,
            }),
          );
        } else {
          addLog(
            formatMessage(MESSAGES.SWITCH_OPPONENT, {
              pokemonName: event.pokemonName,
            }),
          );
        }
        await sleep(600);
      }
      // 状態異常ダメージイベント
      else if (event.type === "statusDamage") {
        addLog(
          formatMessage(MESSAGES.STATUS_DAMAGE, {
            pokemonName: event.pokemonName,
            status: event.status,
          }),
        );

        if (event.fainted) {
          addLog(
            formatMessage(MESSAGES.FAINTED, {
              pokemonName: event.pokemonName,
            }),
          );
        }

        await sleep(600);
      }
    },
    [playerId],
  );

  useEffect(() => {
    // バトル初期化
    const fetchBattleInit = async () => {
      try {
        console.log("[Battle Init] Fetching battle data:", battleId, playerId);
        const response = await fetch(`/api/battle/${battleId}/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log("[Battle Init] Received data:", data);

          const p1State: PlayerState = {
            id: data.player1Id,
            pokemon: data.player1Pokemon,
            activePokemonIndex: data.player1ActiveIndex,
          };

          const p2State: PlayerState = {
            id: data.player2Id,
            pokemon: data.player2Pokemon,
            activePokemonIndex: data.player2ActiveIndex,
          };

          setPlayer1State(p1State);
          setPlayer2State(p2State);
          setBattlePhase("selecting");
          addLog(MESSAGES.BATTLE_START);
        } else {
          console.error("[Battle Init] Failed to fetch:", response.status);
          // バトルルームを解散
          await fetch(`/api/battle/${battleId}/leave`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId, reason: "init-failed" }),
          });
          setErrorMessage(
            "バトルの初期化に失敗しました。\n通信エラーが発生した可能性があります。",
          );
          setShowErrorDialog(true);
        }
      } catch (error) {
        console.error("[Battle Init] Error:", error);
        // バトルルームを解散
        try {
          await fetch(`/api/battle/${battleId}/leave`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId, reason: "connection-error" }),
          });
        } catch (leaveError) {
          console.error("[Battle Init] Failed to leave battle:", leaveError);
        }
        setErrorMessage(
          "通信エラーが発生しました。\nネットワーク接続を確認してください。",
        );
        setShowErrorDialog(true);
      }
    };

    fetchBattleInit();
  }, [battleId, playerId, isPlayer1]);

  useEffect(() => {
    // バトル状態が揃うまで待機
    if (!player1State || !player2State) {
      console.log("[Pusher] Waiting for battle state...");
      return;
    }

    const pusher = getPusherClient();
    const channel = pusher.subscribe(`battle-${battleId}`);

    console.log(
      "[Pusher] Subscribing to battle channel:",
      `battle-${battleId}`,
    );

    channel.bind("turn-result", async (data: TurnResult) => {
      console.log("[Pusher] Received turn-result:", data);

      // アニメーション中は操作不可
      setBattlePhase("action");
      setSelectedCommand(null);

      // イベントを順次処理
      for (const event of data.turnEvents) {
        await processEvent(event);
      }

      // バトル状態を更新
      setPlayer1State(data.battleState.player1);
      setPlayer2State(data.battleState.player2);
      setBattlePhase(data.battleState.phase);
      setNeedSwitchPlayerId(data.battleState.needSwitchPlayerId);
      setCommandMenu("main");

      // ゲーム終了判定
      if (data.gameOver) {
        console.log("[Pusher] Battle ended:", data.gameOver);
        setWinnerId(data.gameOver.winnerId);
        setBattlePhase("finished");
        setShowResultDialog(true);

        const iWon = data.gameOver.winnerId === playerId;
        if (data.gameOver.reason === "surrender") {
          addLog(
            iWon ? MESSAGES.OPPONENT_SURRENDERED : MESSAGES.YOU_SURRENDERED,
          );
        } else {
          addLog(iWon ? MESSAGES.VICTORY : MESSAGES.DEFEAT);
        }
        return;
      }

      // 行動フェーズかつポケモンを交代する場合
      if (
        data.battleState.phase === "action" &&
        data.battleState.needSwitchPlayerId.length > 0
      ) {
        if (data.battleState.needSwitchPlayerId.includes(playerId)) {
          addLog(MESSAGES.SELECT_NEXT_POKEMON);
        } else {
          addLog(MESSAGES.OPPONENT_SWITCHING);
        }
      }
      // コマンド選択フェーズの場合
      else if (data.battleState.phase === "selecting") {
        addLog(MESSAGES.SELECT_COMMAND);
      }
    });

    channel.bind(
      "battle-ended",
      (data: { reason: string; winnerId: string }) => {
        console.log("[Pusher] Battle ended by opponent:", data);
        setErrorMessage(
          "相手プレイヤーとの接続が切断されました。\n試合を続行できません。",
        );
        setShowErrorDialog(true);
      },
    );

    return () => {
      console.log("[Pusher] Unsubscribing from battle channel");
      channel.unbind_all();
      channel.unsubscribe();
    };
  }, [battleId, playerId, player1State, player2State, processEvent]);

  // コマンド送信
  const submitCommand = async (command: BattleCommand) => {
    console.log("[Command] Submitting command:", command);
    setSelectedCommand(command);

    try {
      const response = await fetch(`/api/battle/${battleId}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, command }),
      });

      if (response.ok) {
        console.log("[Command] Command submitted successfully");
        addLog(MESSAGES.WAITING_FOR_OPPONENT);
      } else {
        console.error("[Command] Failed to submit:", response.status);
        setSelectedCommand(null);
      }
    } catch (error) {
      console.error("[Command] Error submitting command:", error);
      setSelectedCommand(null);
    }
  };

  // ポケモン交換の処理
  const handleSwitch = async (pokemonIndex: number) => {
    console.log("[Switch] Switching to pokemon:", pokemonIndex);

    if (needSwitchPlayerId.includes(playerId)) {
      try {
        const response = await fetch(`/api/battle/${battleId}/forced-switch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId, pokemonIndex }),
        });

        if (response.ok) {
          console.log("[Forced Switch] Switched successfully");
        } else {
          console.error("[Forced Switch] Failed:", response.status);
        }
      } catch (error) {
        console.error("[Forced Switch] Error:", error);
      }
    } else {
      await submitCommand({ type: "switch", pokemonIndex });
    }
  };

  const handleSurrender = () => {
    submitCommand({ type: "surrender" });
    setShowSurrenderDialog(false);
  };

  const returnToSelection = () => {
    router.push("/");
  };

  // ローディング
  if (!player1State || !player2State) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <Card className="p-8">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-center">バトル準備中...</p>
        </Card>
      </div>
    );
  }

  const player1ActivePokemon =
    player1State.pokemon[player1State.activePokemonIndex];
  const player2ActivePokemon =
    player2State.pokemon[player2State.activePokemonIndex];

  // コマンド選択待ち判定
  const canSelectCommand = battlePhase === "selecting" && !selectedCommand;

  // 強制交代判定
  const mustSwitch =
    battlePhase === "action" && needSwitchPlayerId.includes(playerId);

  // 待機中（相手の行動待ちまたはアニメーション中）
  const isWaiting =
    (battlePhase === "action" &&
      needSwitchPlayerId.length > 0 &&
      !needSwitchPlayerId.includes(playerId)) ||
    (battlePhase === "selecting" && selectedCommand !== null);

  return (
    <div className="min-h-screen bg-green-50 p-4">
      <div className="mx-24 flex flex-col h-[calc(100vh-2rem)]">
        {/* 戦闘画面（上段・中段） */}
        <Card className="p-6 mb-4 flex-6 flex flex-col justify-between">
          {/* 上段：相手のポケモン */}
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
            {/* 上段左：相手のステータス */}
            <Card className="p-4 bg-white/50 h-fit">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-bold">
                    {isPlayer1
                      ? player2ActivePokemon?.name
                      : player1ActivePokemon?.name}
                  </h3>
                  <span className="text-sm text-gray-600">Lv50</span>
                </div>
                <div className="flex gap-2 mb-3">
                  {(isPlayer1
                    ? player2ActivePokemon?.types
                    : player1ActivePokemon?.types
                  )?.map((type) => (
                    <Badge
                      key={type}
                      style={{
                        backgroundColor: getTypeColor(type),
                        color: getTypeTextColor(type),
                      }}
                    >
                      {type}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">HP:</span>
                  <Progress
                    value={
                      isPlayer1
                        ? player2ActivePokemon
                          ? (player2ActivePokemon.currentHp /
                              player2ActivePokemon.maxHp) *
                            100
                          : 0
                        : player1ActivePokemon
                          ? (player1ActivePokemon.currentHp /
                              player1ActivePokemon.maxHp) *
                            100
                          : 0
                    }
                    className="flex-1"
                  />
                  <span className="text-sm">
                    {isPlayer1
                      ? `${player2ActivePokemon?.currentHp || 0}/${player2ActivePokemon?.maxHp || 0}`
                      : `${player1ActivePokemon?.currentHp || 0}/${player1ActivePokemon?.maxHp || 0}`}
                  </span>
                </div>
              </div>
            </Card>

            {/* 上段右：相手の画像 */}
            <div className="flex items-center justify-center h-full relative">
              {(isPlayer1 ? player2ActivePokemon : player1ActivePokemon)
                ?.imageUrl && (
                <Image
                  src={
                    (isPlayer1 ? player2ActivePokemon : player1ActivePokemon)
                      ?.imageUrl || ""
                  }
                  alt={
                    (isPlayer1 ? player2ActivePokemon : player1ActivePokemon)
                      ?.name || ""
                  }
                  fill
                  className="object-contain"
                />
              )}
            </div>
          </div>

          {/* 中段：自分のポケモン */}
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
            {/* 中段左：自分の画像 */}
            <div className="flex items-center justify-center h-full relative">
              {(isPlayer1 ? player1ActivePokemon : player2ActivePokemon)
                ?.imageUrl && (
                <Image
                  src={
                    (isPlayer1 ? player1ActivePokemon : player2ActivePokemon)
                      ?.imageUrl || ""
                  }
                  alt={
                    (isPlayer1 ? player1ActivePokemon : player2ActivePokemon)
                      ?.name || ""
                  }
                  fill
                  className="object-contain"
                />
              )}
            </div>

            {/* 中段右：自分のステータス */}
            <Card className="p-4 bg-white/50 h-fit self-end">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-2xl font-bold">
                    {isPlayer1
                      ? player1ActivePokemon?.name
                      : player2ActivePokemon?.name}
                  </h3>
                  <span className="text-sm text-gray-600">Lv50</span>
                </div>
                <div className="flex gap-2 mb-3">
                  {(isPlayer1
                    ? player1ActivePokemon?.types
                    : player2ActivePokemon?.types
                  )?.map((type) => (
                    <Badge
                      key={type}
                      style={{
                        backgroundColor: getTypeColor(type),
                        color: getTypeTextColor(type),
                      }}
                    >
                      {type}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">HP:</span>
                  <Progress
                    value={
                      isPlayer1
                        ? player1ActivePokemon
                          ? (player1ActivePokemon.currentHp /
                              player1ActivePokemon.maxHp) *
                            100
                          : 0
                        : player2ActivePokemon
                          ? (player2ActivePokemon.currentHp /
                              player2ActivePokemon.maxHp) *
                            100
                          : 0
                    }
                    className="flex-1"
                  />
                  <span className="text-sm">
                    {isPlayer1
                      ? `${player1ActivePokemon?.currentHp || 0}/${player1ActivePokemon?.maxHp || 0}`
                      : `${player2ActivePokemon?.currentHp || 0}/${player2ActivePokemon?.maxHp || 0}`}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </Card>

        {/* 下段：バトルログとコマンド */}
        <Card className="grid grid-cols-2 gap-4 flex-4 p-4">
          {/* 下段左：バトルログ */}
          <Card className="p-4 h-full overflow-y-auto">
            {battleLog.slice(-5).map((log, index) => (
              <p key={index} className="text-sm mb-1">
                {log}
              </p>
            ))}
          </Card>

          {/* 下段右：コマンド選択 */}
          <div className="h-full overflow-hidden">
            {isWaiting && (
              <Card className="p-8 h-full flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mb-4"></div>
                <p className="text-center">
                  {needSwitchPlayerId.length > 0 &&
                  !needSwitchPlayerId.includes(playerId)
                    ? "相手がポケモンを交換しています..."
                    : "相手の行動を待っています..."}
                </p>
              </Card>
            )}

            {canSelectCommand &&
              (isPlayer1 ? player1ActivePokemon : player2ActivePokemon) && (
                <Card className="p-6 h-full overflow-y-auto">
                  {commandMenu === "main" && (
                    <div className="space-y-3">
                      <h3 className="text-xl font-bold mb-4">
                        コマンドを選択してください
                      </h3>
                      <Button
                        onClick={() => setCommandMenu("move")}
                        className="w-full h-16 text-lg font-bold bg-gray-100 hover:bg-gray-200 shadow-md hover:shadow-lg transition-shadow text-black"
                      >
                        たたかう
                      </Button>
                      <Button
                        onClick={() => setCommandMenu("pokemon")}
                        className="w-full h-16 text-lg font-bold bg-gray-100 hover:bg-gray-200 shadow-md hover:shadow-lg transition-shadow text-black"
                      >
                        ポケモン
                      </Button>
                      <Button
                        onClick={() => setShowSurrenderDialog(true)}
                        className="w-full h-16 text-lg font-bold bg-gray-100 hover:bg-gray-200 shadow-md hover:shadow-lg transition-shadow text-black"
                      >
                        こうさん
                      </Button>
                    </div>
                  )}

                  {commandMenu === "move" && (
                    <div className="flex flex-col h-full">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">技を選択</h3>
                        <Button
                          onClick={() => setCommandMenu("main")}
                          size="sm"
                          className="font-bold bg-gray-100 hover:bg-gray-200 shadow-md hover:shadow-lg transition-shadow text-black"
                        >
                          もどる
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 flex-1">
                        {(isPlayer1
                          ? player1ActivePokemon
                          : player2ActivePokemon
                        )?.moves.map((move, index) => {
                          const opponentPokemon = isPlayer1
                            ? player2ActivePokemon
                            : player1ActivePokemon;
                          const effectiveness = getTypeEffectiveness(
                            move.type,
                            opponentPokemon.types,
                          );
                          const effectivenessSymbol =
                            getEffectivenessSymbol(effectiveness);

                          return (
                            <Button
                              key={index}
                              onClick={() =>
                                submitCommand({
                                  type: "move",
                                  moveIndex: index,
                                })
                              }
                              className="h-full py-3 flex flex-col items-start font-bold shadow-lg hover:shadow-2xl transition-all relative border-b-4 hover:-translate-y-0.5"
                              style={{
                                backgroundColor: getTypeColor(move.type),
                                color: getTypeTextColor(move.type),
                                borderBottomColor: `${getTypeColor(move.type)}dd`,
                              }}
                            >
                              <div className="flex items-center gap-2 w-full mb-1">
                                <span className="font-bold">{move.name}</span>
                                <Badge
                                  className="text-xs"
                                  style={{
                                    backgroundColor: getTypeColor(move.type),
                                    color: getTypeTextColor(move.type),
                                    border: `1px solid ${getTypeTextColor(move.type)}`,
                                  }}
                                >
                                  {move.type}
                                </Badge>
                                <span className="ml-auto text-xl font-bold">
                                  {effectivenessSymbol}
                                </span>
                              </div>
                              <span className="text-xs">
                                【{move.category}】威力：{move.power} / 命中：
                                {move.accuracy}
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {commandMenu === "pokemon" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">ポケモンを選択</h3>
                        <Button
                          onClick={() => setCommandMenu("main")}
                          size="sm"
                          className="font-bold bg-gray-100 hover:bg-gray-200 shadow-md hover:shadow-lg transition-shadow text-black"
                        >
                          もどる
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(isPlayer1 ? player1State : player2State).pokemon.map(
                          (pokemon, index) => {
                            const isActive =
                              index ===
                              (isPlayer1 ? player1State : player2State)
                                .activePokemonIndex;
                            const isFainted = pokemon.currentHp === 0;

                            if (isActive) return null;

                            return (
                              <Button
                                key={index}
                                onClick={() => {
                                  if (!isFainted) {
                                    submitCommand({
                                      type: "switch",
                                      pokemonIndex: index,
                                    });
                                  }
                                }}
                                disabled={isFainted}
                                className={`h-auto py-3 flex flex-col items-start font-bold shadow-md hover:shadow-lg transition-shadow text-black ${
                                  isFainted
                                    ? "bg-red-200 cursor-not-allowed opacity-60"
                                    : "bg-gray-100 hover:bg-gray-200"
                                }`}
                              >
                                <div className="flex items-center gap-2 w-full mb-1">
                                  <span className="font-bold">
                                    {pokemon.name}
                                  </span>
                                  {pokemon.types.map((type, i) => (
                                    <Badge
                                      key={i}
                                      className="text-xs"
                                      style={{
                                        backgroundColor: getTypeColor(type),
                                        color: getTypeTextColor(type),
                                      }}
                                    >
                                      {type}
                                    </Badge>
                                  ))}
                                </div>
                                <span className="text-xs mb-1">
                                  HP: {pokemon.currentHp}/{pokemon.maxHp}
                                </span>
                                <div className="text-xs grid grid-cols-2 gap-x-2 gap-y-1 w-full">
                                  <span className="inline-flex">
                                    <span className="inline-block min-w-16 text-right">
                                      攻　撃：
                                    </span>
                                    {pokemon.stats.attack}
                                  </span>
                                  <span className="inline-flex">
                                    <span className="inline-block min-w-16 text-right">
                                      防　御：
                                    </span>
                                    {pokemon.stats.defense}
                                  </span>
                                  <span className="inline-flex">
                                    <span className="inline-block min-w-16 text-right">
                                      特　攻：
                                    </span>
                                    {pokemon.stats.spAttack}
                                  </span>
                                  <span className="inline-flex">
                                    <span className="inline-block min-w-16 text-right">
                                      特　防：
                                    </span>
                                    {pokemon.stats.spDefense}
                                  </span>
                                  <span className="inline-flex">
                                    <span className="inline-block min-w-16 text-right">
                                      素早さ：
                                    </span>
                                    {pokemon.stats.speed}
                                  </span>
                                </div>
                              </Button>
                            );
                          },
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              )}

            {mustSwitch && (
              <Card className="p-6 h-full overflow-y-auto">
                <h3 className="text-xl font-bold mb-4 text-red-600">
                  交換するポケモンを選択してください
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {(isPlayer1 ? player1State : player2State).pokemon.map(
                    (pokemon, index) => {
                      const isActive =
                        index ===
                        (isPlayer1 ? player1State : player2State)
                          .activePokemonIndex;
                      const isFainted = pokemon.currentHp === 0;

                      if (isActive || isFainted) return null;

                      return (
                        <Button
                          key={index}
                          onClick={() => handleSwitch(index)}
                          className="h-auto py-3 flex flex-col items-start font-bold bg-gray-100 hover:bg-gray-200 shadow-md hover:shadow-lg transition-shadow text-black"
                        >
                          <div className="flex items-center gap-2 w-full mb-1">
                            <span className="font-bold">{pokemon.name}</span>
                            {pokemon.types.map((type, i) => (
                              <Badge
                                key={i}
                                className="text-xs"
                                style={{
                                  backgroundColor: getTypeColor(type),
                                  color: getTypeTextColor(type),
                                }}
                              >
                                {type}
                              </Badge>
                            ))}
                          </div>
                          <span className="text-xs mb-1">
                            HP: {pokemon.currentHp}/{pokemon.maxHp}
                          </span>
                          <div className="text-xs grid grid-cols-2 gap-x-2 gap-y-1 w-full">
                            <span className="inline-flex">
                              <span className="inline-block min-w-16 text-right">
                                攻　撃：
                              </span>
                              {pokemon.stats.attack}
                            </span>
                            <span className="inline-flex">
                              <span className="inline-block min-w-16 text-right">
                                防　御：
                              </span>
                              {pokemon.stats.defense}
                            </span>
                            <span className="inline-flex">
                              <span className="inline-block min-w-16 text-right">
                                特　攻：
                              </span>
                              {pokemon.stats.spAttack}
                            </span>
                            <span className="inline-flex">
                              <span className="inline-block min-w-16 text-right">
                                特　防：
                              </span>
                              {pokemon.stats.spDefense}
                            </span>
                            <span className="inline-flex">
                              <span className="inline-block min-w-16 text-right">
                                素早さ：
                              </span>
                              {pokemon.stats.speed}
                            </span>
                          </div>
                        </Button>
                      );
                    },
                  )}
                </div>
              </Card>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={showSurrenderDialog} onOpenChange={setShowSurrenderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>降参しますか？</DialogTitle>
            <DialogDescription>
              降参すると負けになります。本当によろしいですか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSurrenderDialog(false)}
            >
              いいえ
            </Button>
            <Button variant="destructive" onClick={handleSurrender}>
              はい
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-3xl text-center">
              {winnerId === playerId ? "🎉 勝利！" : "😢 敗北..."}
            </DialogTitle>
            <DialogDescription className="text-center text-lg">
              {winnerId === playerId
                ? "おめでとうございます！"
                : "また挑戦してください"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={returnToSelection} className="w-full">
              ポケモン選択画面に戻る
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-2xl text-center text-red-600">
              ⚠️ 通信エラー
            </DialogTitle>
            <DialogDescription className="text-center whitespace-pre-line">
              {errorMessage}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={returnToSelection} className="w-full">
              ポケモン選択画面に戻る
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
