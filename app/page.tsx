"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAllPokemon } from "@/lib/pokemon-data";
import { Pokemon } from "@/lib/types/pokemon";
import { getPusherClient } from "@/lib/pusher";

export default function PokemonSelectionPage() {
  const router = useRouter();
  const [allPokemon, setAllPokemon] = useState<Pokemon[]>([]);
  const [selectedPokemon, setSelectedPokemon] = useState<number[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [playerId] = useState(() => `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    setAllPokemon(getAllPokemon());
  }, []);

  useEffect(() => {
    if (!isSearching) return;

    const pusher = getPusherClient();
    const channel = pusher.subscribe(`player-${playerId}`);

    channel.bind('match-found', (data: any) => {
      console.log('Match found!', data);
      // バトル画面に遷移
      router.push(`/battle/${data.battleId}?playerId=${playerId}&isPlayer1=${data.isPlayer1}`);
    });

    return () => {
      channel.unbind_all();
      channel.unsubscribe();
    };
  }, [isSearching, playerId, router]);

  const togglePokemon = (pokemonId: number) => {
    if (selectedPokemon.includes(pokemonId)) {
      setSelectedPokemon(selectedPokemon.filter(id => id !== pokemonId));
    } else {
      if (selectedPokemon.length < 3) {
        setSelectedPokemon([...selectedPokemon, pokemonId]);
      }
    }
  };

  const startBattle = async () => {
    if (selectedPokemon.length !== 3) {
      alert('ポケモンを3匹選択してください');
      return;
    }

    setIsSearching(true);

    const selectedPokemonData = allPokemon.filter(p => selectedPokemon.includes(p.id));

    try {
      const response = await fetch('/api/matchmaking/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId,
          selectedPokemon: selectedPokemonData,
        }),
      });

      const data = await response.json();
      
      if (data.status === 'matched') {
        // 即座にマッチングした場合
        router.push(`/battle/${data.battleId}?playerId=${playerId}&isPlayer1=true`);
      }
    } catch (error) {
      console.error('Error joining matchmaking:', error);
      setIsSearching(false);
      alert('マッチングに失敗しました');
    }
  };

  const cancelSearch = async () => {
    try {
      await fetch('/api/matchmaking/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
    } catch (error) {
      console.error('Error leaving matchmaking:', error);
    }
    setIsSearching(false);
  };

  if (isSearching) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-b from-blue-100 to-blue-200 p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold mb-2">対戦相手を探しています...</h2>
          <p className="text-gray-600 mb-4">しばらくお待ちください</p>
          <Button onClick={cancelSearch} variant="outline">キャンセル</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-blue-100 to-blue-200 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2 text-blue-900">ポケモンバトル</h1>
        <p className="text-center mb-6 text-gray-700">対戦するポケモンを3匹選んでください ({selectedPokemon.length}/3)</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {allPokemon.map((pokemon) => {
            const isSelected = selectedPokemon.includes(pokemon.id);
            return (
              <Card
                key={pokemon.id}
                className={`p-4 cursor-pointer transition-all hover:scale-105 ${
                  isSelected ? 'ring-4 ring-blue-500 bg-blue-50' : 'hover:shadow-lg'
                }`}
                onClick={() => togglePokemon(pokemon.id)}
              >
                <div className="flex flex-col items-center">
                  <div className="w-32 h-32 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                    <span className="text-4xl">🎮</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">{pokemon.name}</h3>
                  <div className="flex gap-2 mb-3">
                    {pokemon.types.map((type) => (
                      <Badge key={type} variant="secondary">{type}</Badge>
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">特性: {pokemon.ability}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs w-full">
                    <div>HP: {pokemon.stats.hp}</div>
                    <div>攻撃: {pokemon.stats.attack}</div>
                    <div>防御: {pokemon.stats.defense}</div>
                    <div>素早: {pokemon.stats.speed}</div>
                  </div>
                  {isSelected && (
                    <Badge className="mt-3 bg-blue-500">選択中</Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-center">
          <Button
            onClick={startBattle}
            disabled={selectedPokemon.length !== 3}
            size="lg"
            className="text-xl px-8 py-6"
          >
            対戦開始 ({selectedPokemon.length}/3)
          </Button>
        </div>
      </div>
    </div>
  );
}
