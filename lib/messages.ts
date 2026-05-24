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
  MOVE_USE: "{attackerName}の{moveName}！",
  MOVE_MISS: "しかし攻撃は外れた！",
  CRITICAL_HIT: "急所に当たった！",
  SUPER_EFFECTIVE: "効果は抜群だ！",
  NOT_VERY_EFFECTIVE: "効果はいまひとつのようだ...",
  DAMAGE: "{damage}のダメージ！",
  
  // 状態異常
  STATUS_INFLICTED: "{target}は{status}になった！",
  STATUS_DAMAGE: "{pokemonName}は{status}のダメージをうけている！",
  
  // ステータス変化
  STAT_NO_CHANGE: "{target}の{stat}はこれ以上変わらない！",
  STAT_UP_2: "{target}の{stat}がぐーんと上がった！",
  STAT_UP_1: "{target}の{stat}が上がった！",
  STAT_DOWN_1: "{target}の{stat}が下がった！",
  STAT_DOWN_2: "{target}の{stat}ががくっと下がった！",
  EFFECT_FAILED: "しかし うまく きまらなかった…",
  OTHER_EFFECT: "{target}は{effectType}の効果を受けた！",
  
  // ポケモン交換
  SWITCH_MINE: "{pokemonName}に交換した！",
  SWITCH_OPPONENT: "相手は{pokemonName}に交換した！",
  
  // 瀕死
  FAINTED: "{pokemonName}は倒れた！",
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