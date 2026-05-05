"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAllPokemon } from "@/lib/pokemon-data";
import { getPusherClient } from "@/lib/pusher";
import { getTypeColor, getTypeTextColor } from "@/lib/utils";

export default function PokemonSelectionPage() {
  const router = useRouter();
  const [selectedPokemon, setSelectedPokemon] = useState<number[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [playerId] = useState(
    () => `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  );
  const [allPokemon] = useState(() => getAllPokemon());

  // Pusherチャンネルを常にサブスクライブ（コンポーネントマウント時）
  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`player-${playerId}`);

    console.log("[Pusher] Subscribed to channel:", `player-${playerId}`);

    channel.bind(
      "match-found",
      (data: { battleId: string; isPlayer1: boolean }) => {
        console.log("[Pusher] Match found!", data);
        // バトル画面に遷移
        router.push(
          `/battle/${data.battleId}?playerId=${playerId}&isPlayer1=${data.isPlayer1}`,
        );
      },
    );

    return () => {
      console.log("[Pusher] Unsubscribing from channel");
      channel.unbind_all();
      channel.unsubscribe();
    };
  }, [playerId, router]);

  // ポケモンの選択・解除を切り替える関数
  const togglePokemon = (pokemonId: number) => {
    if (selectedPokemon.includes(pokemonId)) {
      setSelectedPokemon(selectedPokemon.filter((id) => id !== pokemonId));
    } else {
      if (selectedPokemon.length < 3) {
        setSelectedPokemon([...selectedPokemon, pokemonId]);
      }
    }
  };

  // バトル開始の関数
  const startBattle = async () => {
    // ポケモンが3匹選択されていない場合
    if (selectedPokemon.length !== 3) {
      alert("ポケモンを3匹選択してください");
      return;
    }

    setIsSearching(true);

    const selectedPokemonData = allPokemon.filter((p) =>
      selectedPokemon.includes(p.id),
    );

    try {
      console.log("[Matchmaking] Sending join request for:", playerId);

      const response = await fetch("/api/matchmaking/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          selectedPokemon: selectedPokemonData,
        }),
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 204 No Content（マッチング待ち）の場合はJSONパースしない
      if (response.status !== 204) {
        const data = await response.json();
        console.log("[Matchmaking] API response:", data);
      } else {
        console.log("[Matchmaking] Waiting for opponent...");
      }

      // マッチング結果はPusherで受け取る（APIレスポンスは使用しない）
    } catch (error) {
      console.error("[Matchmaking] Error joining matchmaking:", error);
      setIsSearching(false);
      alert("マッチングに失敗しました");
    }
  };

  // マッチングキャンセルの関数
  const cancelSearch = async () => {
    try {
      await fetch("/api/matchmaking/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      setIsSearching(false);
    } catch (error) {
      console.error("Error leaving matchmaking:", error);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-blue-100 to-blue-200 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8">ポケモン選択</h1>

        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold mb-2">
                選択中のポケモン: {selectedPokemon.length}/3
              </h2>
              <p className="text-gray-600">
                バトル用のポケモンを3匹選んでください
              </p>
            </div>
            <div className="flex gap-4">
              {!isSearching ? (
                <Button
                  onClick={startBattle}
                  disabled={selectedPokemon.length !== 3}
                  size="lg"
                >
                  バトル開始
                </Button>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <span className="text-lg">マッチング中...</span>
                  <Button onClick={cancelSearch} variant="outline">
                    キャンセル
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allPokemon.map((pokemon) => {
            const isSelected = selectedPokemon.includes(pokemon.id);

            return (
              <Card
                key={pokemon.id}
                className={`cursor-pointer transition-all ${
                  isSelected
                    ? "ring-4 ring-purple-500 bg-purple-50"
                    : "hover:shadow-lg"
                } ${selectedPokemon.length >= 3 && !isSelected ? "opacity-50" : ""}`}
                onClick={() => togglePokemon(pokemon.id)}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold">{pokemon.name}</h3>
                    {isSelected && (
                      <Badge className="bg-purple-600">選択中</Badge>
                    )}
                  </div>

                  <div className="flex gap-2 mb-3">
                    {pokemon.types.map((type) => (
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

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-semibold">HP:</span>{" "}
                      {pokemon.stats.hp}
                    </div>
                    <div>
                      <span className="font-semibold">攻撃:</span>{" "}
                      {pokemon.stats.attack}
                    </div>
                    <div>
                      <span className="font-semibold">防御:</span>{" "}
                      {pokemon.stats.defense}
                    </div>
                    <div>
                      <span className="font-semibold">素早さ:</span>{" "}
                      {pokemon.stats.speed}
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-sm font-semibold mb-1">技:</p>
                    <div className="flex flex-wrap gap-1">
                      {pokemon.moves.map((move, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="text-xs"
                        >
                          {move.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
