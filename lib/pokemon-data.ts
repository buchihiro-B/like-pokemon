import pokemonData from "@/data/pokemon.json";
import movesData from "@/data/moves.json";
import { Pokemon, Move } from "./types/pokemon";

// pokemon.jsonの生データ型（moveIdsを持つ）
interface RawPokemonData {
  id: number;
  name: string;
  types: string[];
  stats: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
  ability: string;
  moveIds: number[];
  imageUrl: string;
}

// moves.jsonから技を取得
export function getMoveById(id: number): Move | undefined {
  return movesData.find((m) => m.id === id) as Move | undefined;
}

// 技IDを技オブジェクトに変換
function resolveMoves(moveIds: number[]): Move[] {
  return moveIds
    .map((id) => getMoveById(id))
    .filter((move): move is Move => move !== undefined);
}

// RawPokemonDataをPokemonに変換
function toPokemon(raw: RawPokemonData): Pokemon {
  return {
    ...raw,
    types: raw.types as Pokemon["types"],
    moves: resolveMoves(raw.moveIds),
  };
}

export function getAllPokemon(): Pokemon[] {
  const rawData = pokemonData as RawPokemonData[];
  return rawData.map(toPokemon);
}

export function getPokemonById(id: number): Pokemon | undefined {
  const rawData = pokemonData as RawPokemonData[];
  const raw = rawData.find((p) => p.id === id);
  return raw ? toPokemon(raw) : undefined;
}
