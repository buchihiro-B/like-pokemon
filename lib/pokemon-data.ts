import pokemonData from '@/data/pokemon.json';
import { Pokemon } from './types/pokemon';

export function getAllPokemon(): Pokemon[] {
  return pokemonData as Pokemon[];
}

export function getPokemonById(id: number): Pokemon | undefined {
  return pokemonData.find((p: any) => p.id === id) as Pokemon | undefined;
}
