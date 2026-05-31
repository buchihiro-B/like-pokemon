// メッセージ定義
export const MESSAGES = {
  // バトル開始・終了
  BATTLE_START: "バトル開始！",
  VICTORY: "あなたの勝利！",
  DEFEAT: "あなたの敗北...",
  OPPONENT_SURRENDERED: "相手が降参した！",
  YOU_SURRENDERED: "あなたは降参した",
  
  // 待機中
  WAITING_FOR_OPPONENT: "相手の行動を待っています...",
  OPPONENT_SWITCHING: "相手がポケモンを交換しています...",
  SELECT_COMMAND: "コマンドを選択してください",
  SELECT_NEXT_POKEMON: "次のポケモンを選択してください",
  
  // 技使用
  MOVE_USE: "{attackerName}は {moveName}を つかった！",
  MOVE_MISS: "しかし こうげきは はずれた！",
  CRITICAL_HIT: "きゅうしょに あたった！",
  SUPER_EFFECTIVE: "こうかは ばつぐんだ！",
  NOT_VERY_EFFECTIVE: "こうかは いまひとつの ようだ...",
  DAMAGE: "{damage}の ダメージ！",
  PROTECT: "{target}は みを まもっている！",
  
  // 状態異常
  STATUS_INFLICTED: "{target}は{status}になった！",
  STATUS_DAMAGE: "{pokemonName}は{status}のダメージをうけている！",
  
  // ステータス変化
  STAT_NO_CHANGE: "{target}の {stat}は これいじょう かわらない！",
  STAT_UP_2: "{target}の {stat}が ぐーんと あがった！",
  STAT_UP_1: "{target}の {stat}が あがった！",
  STAT_DOWN_1: "{target}の {stat}が さがった！",
  STAT_DOWN_2: "{target}の {stat}が がくっと さがった！",
  EFFECT_FAILED: "しかし うまく きまらなかった…",
  OTHER_EFFECT: "{target}は{effectType}の効果を受けた！",
  
  // ポケモン交換
  SWITCH_MINE: "{pokemonName}に交換した！",
  SWITCH_OPPONENT: "相手は{pokemonName}に交換した！",
  
  // 瀕死
  FAINTED: "{pokemonName}は たおれた！",
} as const;

// 読み替え定義
// ステータス名の読み替え
export const STAT_NAMES: Record<string, string> = {
  attack: "こうげき",
  defense: "ぼうぎょ",
  spAttack: "とくこう",
  spDefense: "とくぼう",
  speed: "すばやさ",
  evasion: "かいひ",
  accuracy: "めいちゅう",
} as const;

// メッセージ生成
export function formatMessage(
  template: string, 
  params: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      result = result.replace(`{${key}}`, String(value));
    }
  }
  return result;
}