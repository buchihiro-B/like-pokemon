import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ポケモンのタイプごとの色を定義
const typeColors: Record<string, string> = {
  ほのお: "#F08030",
  みず: "#6890F0",
  くさ: "#78C850",
  でんき: "#F8D030",
  ノーマル: "#A8A878",
  かくとう: "#C03028",
  どく: "#A040A0",
  じめん: "#E0C068",
  ひこう: "#A890F0",
  エスパー: "#F85888",
  むし: "#A8B820",
  いわ: "#B8A038",
  ゴースト: "#705898",
  ドラゴン: "#7038F8",
  はがね: "#B8B8D0",
  こおり: "#98D8D8",
  あく: "#705848",
  フェアリー: "#EE99AC",
};

// タイプの背景色を取得する関数
export function getTypeColor(type: string): string {
  return typeColors[type] || "#A8A878"; // デフォルトはノーマルタイプの色
}

// テキストの視認性を考慮して、白または黒のテキスト色を返す関数
export function getTypeTextColor(type: string): string {
  // 明るいタイプは黒文字、暗いタイプは白文字
  const darkTypes = [
    "みず",
    "かくとう",
    "どく",
    "ゴースト",
    "ドラゴン",
    "あく",
  ];
  return darkTypes.includes(type) ? "#FFFFFF" : "#000000";
}

// タイプ相性のデータ（攻撃側タイプ → 防御側タイプ → 倍率）
const typeEffectiveness: Record<string, Record<string, number>> = {
  ノーマル: { いわ: 0.5, ゴースト: 0, はがね: 0.5 },
  ほのお: {
    ほのお: 0.5,
    みず: 0.5,
    くさ: 2,
    こおり: 2,
    むし: 2,
    いわ: 0.5,
    ドラゴン: 0.5,
    はがね: 2,
  },
  みず: { ほのお: 2, みず: 0.5, くさ: 0.5, じめん: 2, いわ: 2, ドラゴン: 0.5 },
  でんき: {
    みず: 2,
    でんき: 0.5,
    くさ: 0.5,
    じめん: 0,
    ひこう: 2,
    ドラゴン: 0.5,
  },
  くさ: {
    ほのお: 0.5,
    みず: 2,
    くさ: 0.5,
    どく: 0.5,
    じめん: 2,
    ひこう: 0.5,
    むし: 0.5,
    いわ: 2,
    ドラゴン: 0.5,
    はがね: 0.5,
  },
  こおり: {
    ほのお: 0.5,
    みず: 0.5,
    くさ: 2,
    こおり: 0.5,
    じめん: 2,
    ひこう: 2,
    ドラゴン: 2,
    はがね: 0.5,
  },
  かくとう: {
    ノーマル: 2,
    こおり: 2,
    どく: 0.5,
    ひこう: 0.5,
    エスパー: 0.5,
    むし: 0.5,
    いわ: 2,
    ゴースト: 0,
    あく: 2,
    はがね: 2,
    フェアリー: 0.5,
  },
  どく: {
    くさ: 2,
    どく: 0.5,
    じめん: 0.5,
    いわ: 0.5,
    ゴースト: 0.5,
    はがね: 0,
    フェアリー: 2,
  },
  じめん: {
    ほのお: 2,
    でんき: 2,
    くさ: 0.5,
    どく: 2,
    ひこう: 0,
    むし: 0.5,
    いわ: 2,
    はがね: 2,
  },
  ひこう: {
    でんき: 0.5,
    くさ: 2,
    かくとう: 2,
    むし: 2,
    いわ: 0.5,
    はがね: 0.5,
  },
  エスパー: { かくとう: 2, どく: 2, エスパー: 0.5, あく: 0, はがね: 0.5 },
  むし: {
    ほのお: 0.5,
    くさ: 2,
    かくとう: 0.5,
    どく: 0.5,
    ひこう: 0.5,
    エスパー: 2,
    ゴースト: 0.5,
    あく: 2,
    はがね: 0.5,
    フェアリー: 0.5,
  },
  いわ: {
    ほのお: 2,
    こおり: 2,
    かくとう: 0.5,
    じめん: 0.5,
    ひこう: 2,
    むし: 2,
    はがね: 0.5,
  },
  ゴースト: { ノーマル: 0, エスパー: 2, ゴースト: 2, あく: 0.5 },
  ドラゴン: { ドラゴン: 2, はがね: 0.5, フェアリー: 0 },
  あく: { かくとう: 0.5, エスパー: 2, ゴースト: 2, あく: 0.5, フェアリー: 0.5 },
  はがね: {
    ほのお: 0.5,
    みず: 0.5,
    でんき: 0.5,
    こおり: 2,
    いわ: 2,
    はがね: 0.5,
    フェアリー: 2,
  },
  フェアリー: {
    ほのお: 0.5,
    かくとう: 2,
    どく: 0.5,
    ドラゴン: 2,
    あく: 2,
    はがね: 0.5,
  },
};

// タイプ相性を計算する関数（複合タイプ対応）
export function getTypeEffectiveness(
  attackType: string,
  defenseTypes: string[],
): number {
  let effectiveness = 1;

  for (const defenseType of defenseTypes) {
    const multiplier = typeEffectiveness[attackType]?.[defenseType] ?? 1;
    effectiveness *= multiplier;
  }

  return effectiveness;
}

// 相性を記号で返す関数
export function getEffectivenessSymbol(effectiveness: number): string {
  if (effectiveness === 0) return "-";
  if (effectiveness >= 4) return "★";
  if (effectiveness >= 2) return "◎";
  if (effectiveness === 1) return "○";
  if (effectiveness >= 0.5) return "△";
  return "▽";
}
