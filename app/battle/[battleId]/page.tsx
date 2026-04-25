"use client";

import { useState, useEffect, use, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { BattlePokemon, BattleCommand, TurnResult, TurnAction } from "@/lib/types/pokemon";
import { getPusherClient } from "@/lib/pusher";

export default function BattlePage({ params }: { params: Promise<{ battleId: string }> }) {
  const resolvedParams = use(params);
  const battleId = resolvedParams.battleId;
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const playerId = searchParams.get('playerId') || '';
  const isPlayer1 = searchParams.get('isPlayer1') === 'true';

  const [myPokemon, setMyPokemon] = useState<BattlePokemon[]>([]);
  const [opponentPokemon, setOpponentPokemon] = useState<BattlePokemon[]>([]);
  const [myActivePokemonIndex, setMyActivePokemonIndex] = useState(0);
  const [opponentActivePokemonIndex, setOpponentActivePokemonIndex] = useState(0);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [currentPhase, setCurrentPhase] = useState<'waiting' | 'selecting' | 'animating' | 'switching' | 'finished'>('waiting');
  const [myCommand, setMyCommand] = useState<BattleCommand | null>(null);
  const [winner, setWinner] = useState<'me' | 'opponent' | null>(null);
  const [showSurrenderDialog, setShowSurrenderDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);

  // 最新の状態を参照するためのRef
  const myPokemonRef = useRef(myPokemon);
  const opponentPokemonRef = useRef(opponentPokemon);
  const myActivePokemonIndexRef = useRef(myActivePokemonIndex);
  const opponentActivePokemonIndexRef = useRef(opponentActivePokemonIndex);

  useEffect(() => {
    myPokemonRef.current = myPokemon;
  }, [myPokemon]);

  useEffect(() => {
    opponentPokemonRef.current = opponentPokemon;
  }, [opponentPokemon]);

  useEffect(() => {
    myActivePokemonIndexRef.current = myActivePokemonIndex;
  }, [myActivePokemonIndex]);

  useEffect(() => {
    opponentActivePokemonIndexRef.current = opponentActivePokemonIndex;
  }, [opponentActivePokemonIndex]);

  const addLog = (message: string) => {
    console.log('[Battle Log]', message);
    setBattleLog(prev => [...prev, message]);
  };

  // アニメーション用のsleep関数
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // 個別アクションの処理（useEffectより前に定義）
  const processAction = useCallback(async (action: TurnAction) => {
    switch (action.type) {
      case 'attack': {
        const isMyAttack = action.attackerId === playerId;
        const attackerName = isMyAttack 
          ? myPokemonRef.current[myActivePokemonIndexRef.current]?.name 
          : opponentPokemonRef.current[opponentActivePokemonIndexRef.current]?.name;
        
        let message = `${attackerName}の${action.move}！`;
        
        if (action.damage === 0) {
          message += ' しかし攻撃は外れた！';
        } else {
          if (action.isCritical) {
            message += ' 急所に当たった！';
          }
          if (action.effectiveness > 1) {
            message += ' 効果は抜群だ！';
          } else if (action.effectiveness < 1) {
            message += ' 効果はいまひとつのようだ...';
          }
          message += ` ${action.damage}のダメージ！`;
        }
        
        addLog(message);
        break;
      }

      case 'faint': {
        addLog(`${action.pokemonName}は倒れた！`);
        
        const isMine = action.playerId === playerId;
        if (isMine) {
          setMyPokemon(prev => {
            const updated = [...prev];
            updated[action.pokemonIndex].currentHp = 0;
            return updated;
          });
        } else {
          setOpponentPokemon(prev => {
            const updated = [...prev];
            updated[action.pokemonIndex].currentHp = 0;
            return updated;
          });
        }
        break;
      }

      case 'need-switch': {
        if (action.playerId === playerId) {
          addLog('次のポケモンを選択してください');
        }
        break;
      }

      case 'switch': {
        const isMine = action.playerId === playerId;
        if (isMine) {
          setMyActivePokemonIndex(action.pokemonIndex);
          addLog(`${action.pokemonName}に交換した！`);
        } else {
          setOpponentActivePokemonIndex(action.pokemonIndex);
          addLog(`相手は${action.pokemonName}に交換した！`);
        }
        break;
      }
    }
  }, [playerId]);

  // 初期データ取得
  useEffect(() => {
    const fetchBattleInit = async () => {
      try {
        console.log('[Battle Init] Fetching battle data:', battleId, playerId);
        const response = await fetch(`/api/battle/${battleId}/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('[Battle Init] Received data:', data);
          setMyPokemon(data.myPokemon);
          setOpponentPokemon(data.opponentPokemon);
          setMyActivePokemonIndex(data.myActiveIndex);
          setOpponentActivePokemonIndex(data.opponentActiveIndex);
          setCurrentPhase('selecting');
          addLog('バトル開始！');
        } else {
          console.error('[Battle Init] Failed to fetch:', response.status);
        }
      } catch (error) {
        console.error('[Battle Init] Error:', error);
      }
    };

    fetchBattleInit();
  }, [battleId, playerId]);

  // Pusher接続
  useEffect(() => {
    if (myPokemon.length === 0) {
      console.log('[Pusher] Waiting for Pokemon data...');
      return;
    }

    const pusher = getPusherClient();
    const channel = pusher.subscribe(`battle-${battleId}`);

    console.log('[Pusher] Subscribing to battle channel:', `battle-${battleId}`);

    // ターン結果イベント（統合版）
    channel.bind('turn-result', async (data: TurnResult) => {
      console.log('[Pusher] Received turn-result event:', data);
      
      // アニメーションフェーズに移行
      setCurrentPhase('animating');

      // アクションを順次処理
      for (const action of data.actions) {
        await processAction(action);
        await sleep(800); // アクション間の待機時間
      }

      // 最終状態を更新
      const myUpdatedPokemon = isPlayer1 ? data.battleState.player1Pokemon : data.battleState.player2Pokemon;
      const opponentUpdatedPokemon = isPlayer1 ? data.battleState.player2Pokemon : data.battleState.player1Pokemon;
      const myUpdatedActiveIndex = isPlayer1 ? data.battleState.player1ActiveIndex : data.battleState.player2ActiveIndex;
      const opponentUpdatedActiveIndex = isPlayer1 ? data.battleState.player2ActiveIndex : data.battleState.player1ActiveIndex;
      
      setMyPokemon(myUpdatedPokemon);
      setOpponentPokemon(opponentUpdatedPokemon);
      setMyActivePokemonIndex(myUpdatedActiveIndex);
      setOpponentActivePokemonIndex(opponentUpdatedActiveIndex);

      // バトル終了チェック
      if (data.battleEnd) {
        console.log('[Pusher] Battle ended:', data.battleEnd);
        const iWon = data.battleEnd.winnerId === playerId;
        setWinner(iWon ? 'me' : 'opponent');
        setCurrentPhase('finished');
        setShowResultDialog(true);
        
        if (data.battleEnd.reason === 'surrender') {
          addLog(iWon ? '相手が降参した！' : 'あなたは降参した');
        } else {
          addLog(iWon ? 'あなたの勝利！' : 'あなたの敗北...');
        }
      } else {
        // need-switchアクションがあるかチェック
        const needSwitch = data.actions.find(
          a => a.type === 'need-switch' && a.playerId === playerId
        );
        
        if (needSwitch) {
          setCurrentPhase('switching');
        } else {
          setCurrentPhase('selecting');
          setMyCommand(null);
          addLog(`--- ターン${data.turnNumber} ---`);
        }
      }
    });

    return () => {
      console.log('[Pusher] Unsubscribing from battle channel');
      channel.unbind_all();
      channel.unsubscribe();
    };
  }, [battleId, playerId, isPlayer1, myPokemon.length, processAction]);

  // コマンド送信
  const submitCommand = async (command: BattleCommand) => {
    console.log('[Command] Submitting command:', command);
    setMyCommand(command);
    setCurrentPhase('waiting');

    try {
      const response = await fetch(`/api/battle/${battleId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, command }),
      });
      
      if (response.ok) {
        console.log('[Command] Command submitted successfully');
        addLog('相手の行動を待っています...');
      } else {
        console.error('[Command] Failed to submit:', response.status);
      }
    } catch (error) {
      console.error('[Command] Error submitting command:', error);
      setCurrentPhase('selecting');
      setMyCommand(null);
    }
  };

  const handleSwitch = async (pokemonIndex: number) => {
    console.log('[Switch] Switching to pokemon:', pokemonIndex);
    setMyActivePokemonIndex(pokemonIndex);
    setCurrentPhase('selecting');
    addLog(`${myPokemon[pokemonIndex].name}に交換した！`);
    
    // サーバーに交換を通知
    await fetch(`/api/battle/${battleId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        playerId, 
        command: { type: 'switch', pokemonIndex } 
      }),
    });
  };

  const handleSurrender = () => {
    submitCommand({ type: 'surrender' });
    setShowSurrenderDialog(false);
  };

  const returnToSelection = () => {
    router.push('/');
  };

  if (myPokemon.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-purple-100 to-purple-200">
        <Card className="p-8">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-center">バトル準備中...</p>
        </Card>
      </div>
    );
  }

  if (currentPhase === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-purple-100 to-purple-200">
        <Card className="p-8">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-center">相手の行動を待っています...</p>
        </Card>
      </div>
    );
  }

  const myActivePokemon = myPokemon[myActivePokemonIndex];
  const opponentActivePokemon = opponentPokemon[opponentActivePokemonIndex];

  return (
    <div className="min-h-screen bg-linear-to-b from-purple-100 to-purple-200 p-4">
      <div className="max-w-6xl mx-auto">
        {/* 相手のポケモン */}
        <div className="mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-2">{opponentActivePokemon?.name || '???'}</h3>
                <div className="flex gap-2 mb-3">
                  {opponentActivePokemon?.types.map((type) => (
                    <Badge key={type} variant="secondary">{type}</Badge>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">HP:</span>
                    <Progress 
                      value={opponentActivePokemon ? (opponentActivePokemon.currentHp / opponentActivePokemon.maxHp) * 100 : 0} 
                      className="flex-1"
                    />
                    <span className="text-sm">
                      {opponentActivePokemon?.currentHp || 0}/{opponentActivePokemon?.maxHp || 0}
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

        {/* バトルログ */}
        <Card className="p-4 mb-8 max-h-32 overflow-y-auto">
          {battleLog.slice(-5).map((log, index) => (
            <p key={index} className="text-sm mb-1">{log}</p>
          ))}
        </Card>

        {/* 自分のポケモン */}
        <div className="mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center mr-4">
                <span className="text-5xl">🎮</span>
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-2">{myActivePokemon?.name || '???'}</h3>
                <div className="flex gap-2 mb-3">
                  {myActivePokemon?.types.map((type) => (
                    <Badge key={type} variant="secondary">{type}</Badge>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">HP:</span>
                    <Progress 
                      value={myActivePokemon ? (myActivePokemon.currentHp / myActivePokemon.maxHp) * 100 : 0} 
                      className="flex-1"
                    />
                    <span className="text-sm">
                      {myActivePokemon?.currentHp || 0}/{myActivePokemon?.maxHp || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* コマンド選択 */}
        {currentPhase === 'selecting' && !myCommand && myActivePokemon && (
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">コマンドを選択してください</h3>
            
            <div className="space-y-4">
              {/* 技選択 */}
              <div>
                <h4 className="font-semibold mb-2">技</h4>
                <div className="grid grid-cols-2 gap-2">
                  {myActivePokemon.moves.map((move, index) => (
                    <Button
                      key={index}
                      onClick={() => submitCommand({ type: 'move', moveIndex: index })}
                      className="h-auto py-3 flex flex-col items-start"
                    >
                      <span className="font-bold">{move.name}</span>
                      <span className="text-xs">威力: {move.power} / 命中: {move.accuracy}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* 交換 */}
              <div>
                <h4 className="font-semibold mb-2">交換</h4>
                <div className="grid grid-cols-2 gap-2">
                  {myPokemon.map((pokemon, index) => (
                    index !== myActivePokemonIndex && pokemon.currentHp > 0 && (
                      <Button
                        key={index}
                        onClick={() => submitCommand({ type: 'switch', pokemonIndex: index })}
                        variant="outline"
                      >
                        {pokemon.name} (HP: {pokemon.currentHp}/{pokemon.maxHp})
                      </Button>
                    )
                  ))}
                </div>
              </div>

              {/* 降参 */}
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

        {currentPhase === 'switching' && (
          <Card className="p-6">
            <h3 className="text-xl font-bold mb-4">交換するポケモンを選択してください</h3>
            <div className="grid grid-cols-2 gap-2">
              {myPokemon.map((pokemon, index) => (
                pokemon.currentHp > 0 && index !== myActivePokemonIndex && (
                  <Button
                    key={index}
                    onClick={() => handleSwitch(index)}
                  >
                    {pokemon.name} (HP: {pokemon.currentHp}/{pokemon.maxHp})
                  </Button>
                )
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* 降参確認ダイアログ */}
      <Dialog open={showSurrenderDialog} onOpenChange={setShowSurrenderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>降参しますか？</DialogTitle>
            <DialogDescription>
              降参すると負けになります。本当によろしいですか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSurrenderDialog(false)}>
              いいえ
            </Button>
            <Button variant="destructive" onClick={handleSurrender}>
              はい
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 結果ダイアログ */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-3xl text-center">
              {winner === 'me' ? '🎉 勝利！' : '😢 敗北...'}
            </DialogTitle>
            <DialogDescription className="text-center text-lg">
              {winner === 'me' ? 'おめでとうございます！' : 'また挑戦してください'}
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
