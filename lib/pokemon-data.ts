import pokemonData from "@/data/pokemon.json";
import { Pokemon } from "./types/pokemon";

export function getAllPokemon(): Pokemon[] {
  return pokemonData as Pokemon[];
}

export function getPokemonById(id: number): Pokemon | undefined {
  return pokemonData.find((p: Pokemon) => p.id === id);
}
