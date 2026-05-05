"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  const [needSwitchPlayerId, setNeedSwitchPlayerId] = useState<string | null>(
    null,
  );
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [selectedCommand, setSelectedCommand] = useState<BattleCommand | null>(
    null,
  );
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [showSurrenderDialog, setShowSurrenderDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
        const attackerName = event.attackerName;

        let message = `${attackerName}の${event.moveName}！`;

        // ダメージが0の場合
        if (event.damage === 0) {
          message += " しかし攻撃は外れた！";
        } else {
          // 急所の場合
          if (event.isCritical) {
            message += " 急所に当たった！";
          }

          // 効果抜群の場合
          if (event.effectiveness > 1) {
            message += " 効果は抜群だ！";
          }
          // 効果いまひとつの場合
          else if (event.effectiveness < 1 && event.effectiveness > 0) {
            message += " 効果はいまひとつのようだ...";
          }

          message += ` ${event.damage}のダメージ！`;
        }

        addLog(message);

        // ポケモンが倒れた場合
        if (event.fainted) {
          addLog(`${event.defenderName}は倒れた！`);
        }

        await sleep(800);
      }
      // 交換イベント
      else if (event.type === "switch") {
        const isMine = event.player === playerId;

        // 自分が交換する場合
        if (isMine) {
          addLog(`${event.pokemonName}に交換した！`);
        } else {
          addLog(`相手は${event.pokemonName}に交換した！`);
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
          addLog("バトル開始！");
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

      // ゲーム終了判定
      if (data.gameOver) {
        console.log("[Pusher] Battle ended:", data.gameOver);
        setWinnerId(data.gameOver.winnerId);
        setBattlePhase("finished");
        setShowResultDialog(true);

        const iWon = data.gameOver.winnerId === playerId;
        if (data.gameOver.reason === "surrender") {
          addLog(iWon ? "相手が降参した！" : "あなたは降参した");
        } else {
          addLog(iWon ? "あなたの勝利！" : "あなたの敗北...");
        }
        return;
      }

      // 行動フェーズかつポケモンを交代する場合
      if (
        data.battleState.phase === "action" &&
        data.battleState.needSwitchPlayerId
      ) {
        if (data.battleState.needSwitchPlayerId === playerId) {
          addLog("次のポケモンを選択してください");
        } else {
          addLog("相手がポケモンを交換しています...");
        }
      }
      // コマンド選択フェーズの場合
      else if (data.battleState.phase === "selecting") {
        addLog("コマンドを選択してください");
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
        addLog("相手の行動を待っています...");
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

    if (needSwitchPlayerId === playerId) {
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
      <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-purple-100 to-purple-200">
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
    battlePhase === "action" && needSwitchPlayerId === playerId;

  // 待機中（相手の行動待ちまたはアニメーション中）
  const isWaiting =
    (battlePhase === "action" && needSwitchPlayerId !== playerId) ||
    (battlePhase === "selecting" && selectedCommand !== null);

  return (
    <div className="min-h-screen bg-linear-to-b from-purple-100 to-purple-200 p-4">
      <div className="max-w-6xl mx-auto">
        {/* 相手のポケモン表示（Player1の視点ならPlayer2、Player2の視点ならPlayer1） */}
        <div className="mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-2">
                  {isPlayer1
                    ? player2ActivePokemon?.name
                    : player1ActivePokemon?.name}
                </h3>
                <div className="flex gap-2 mb-3">
                  {(isPlayer1
                    ? player2ActivePokemon?.types
                    : player1ActivePokemon?.types
                  )?.map((type) => (
                    <Badge key={type} variant="secondary">
                      {type}
                    </Badge>
                  ))}
                </div>
                <div className="space-y-2">
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
              </div>
              <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center ml-4">
                <span className="text-5xl">👾</span>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-4 mb-8 max-h-32 overflow-y-auto">
          {battleLog.slice(-5).map((log, index) => (
            <p key={index} className="text-sm mb-1">
              {log}
            </p>
          ))}
        </Card>

        {/* 自分のポケモン表示（Player1の視点ならPlayer1、Player2の視点ならPlayer2） */}
        <div className="mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center mr-4">
                <span className="text-5xl">🎮</span>
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-2">
                  {isPlayer1
                    ? player1ActivePokemon?.name
                    : player2ActivePokemon?.name}
                </h3>
                <div className="flex gap-2 mb-3">
                  {(isPlayer1
                    ? player1ActivePokemon?.types
                    : player2ActivePokemon?.types
                  )?.map((type) => (
                    <Badge key={type} variant="secondary">
                      {type}
                    </Badge>
                  ))}
                </div>
                <div className="space-y-2">
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
              </div>
            </div>
          </Card>
        </div>

        {isWaiting && (
          <Card className="p-8">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-center">
              {needSwitchPlayerId && needSwitchPlayerId !== playerId
                ? "相手がポケモンを交換しています..."
                : "相手の行動を待っています..."}
            </p>
          </Card>
        )}

        {canSelectCommand &&
          (isPlayer1 ? player1ActivePokemon : player2ActivePokemon) && (
            <Card className="p-6">
              <h3 className="text-xl font-bold mb-4">
                コマンドを選択してください
              </h3>

              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">技</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {(isPlayer1
                      ? player1ActivePokemon
                      : player2ActivePokemon
                    )?.moves.map((move, index) => (
                      <Button
                        key={index}
                        onClick={() =>
                          submitCommand({ type: "move", moveIndex: index })
                        }
                        className="h-auto py-3 flex flex-col items-start"
                      >
                        <span className="font-bold">{move.name}</span>
                        <span className="text-xs">
                          威力: {move.power} / 命中: {move.accuracy}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">交換</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {(isPlayer1 ? player1State : player2State).pokemon.map(
                      (pokemon, index) =>
                        index !==
                          (isPlayer1 ? player1State : player2State)
                            .activePokemonIndex &&
                        pokemon.currentHp > 0 && (
                          <Button
                            key={index}
                            onClick={() =>
                              submitCommand({
                                type: "switch",
                                pokemonIndex: index,
                              })
                            }
                            variant="outline"
                          >
                            {pokemon.name} (HP: {pokemon.currentHp}/
                            {pokemon.maxHp})
                          </Button>
                        ),
                    )}
                  </div>
                </div>

                <Button
                  onClick={() => setShowSurrenderDialog(true)}
                  variant="destructive"
                  className="w-full"
                >
                  降参
                </Button>
              </div>
            </Card>
          )}

        {mustSwitch && (
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4 text-red-600">
              交換するポケモンを選択してください
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(isPlayer1 ? player1State : player2State).pokemon.map(
                (pokemon, index) =>
                  pokemon.currentHp > 0 &&
                  index !==
                    (isPlayer1 ? player1State : player2State)
                      .activePokemonIndex && (
                    <Button key={index} onClick={() => handleSwitch(index)}>
                      {pokemon.name} (HP: {pokemon.currentHp}/{pokemon.maxHp})
                    </Button>
                  ),
              )}
            </div>
          </Card>
        )}
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
