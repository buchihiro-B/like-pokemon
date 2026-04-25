# WebSocket (Pusher) イベント仕様書

このドキュメントでは、ポケモン対戦アプリケーションで使用される全WebSocketイベントの仕様を記載します。

## チャンネル構成

### 1. プレイヤーチャンネル: `player-{playerId}`
- **用途**: 個別プレイヤーへのマッチング通知
- **イベント**: `match-found`

### 2. バトルチャンネル: `battle-{battleId}`
- **用途**: バトル中のリアルタイム更新
- **イベント**: `turn-result`

---

## イベント詳細

### 1. match-found

**チャンネル**: `player-{playerId}`  
**送信タイミング**: マッチング成立時  
**送信元**: `/api/matchmaking/join/route.ts`

#### ペイロード
```typescript
{
  battleId: string;        // バトルID
  opponentId: string;      // 対戦相手のプレイヤーID
  isPlayer1: boolean;      // 自分がプレイヤー1かどうか
}
```

#### 説明
マッチングが成立し、バトルが作成されたことを両プレイヤーに通知します。
クライアントはこのイベントを受信後、バトル画面へ遷移します。

---

### 2. turn-result

**チャンネル**: `battle-{battleId}`  
**送信タイミング**: ターン処理完了時（両プレイヤーのコマンド実行後）  
**送信元**: `/api/battle/[battleId]/command/route.ts` - `processTurn()`

#### ペイロード
```typescript
{
  turnNumber: number;                // ターン番号
  actions: TurnAction[];             // ターン内で発生したアクションの配列
  battleState: {                     // ターン終了後のバトル状態
    player1Pokemon: BattlePokemon[];
    player2Pokemon: BattlePokemon[];
    player1ActiveIndex: number;
    player2ActiveIndex: number;
  };
  battleEnd?: {                      // バトル終了時のみ存在
    winnerId: string;
    reason: 'all-fainted' | 'surrender';
  };
}
```

#### TurnAction型定義

```typescript
type TurnAction = 
  | {
      type: "attack";
      attackerId: string;
      defenderId: string;
      move: string;
      damage: number;
      effectiveness: number;
      isCritical: boolean;
    }
  | {
      type: "faint";
      playerId: string;
      pokemonIndex: number;
      pokemonName: string;
    }
  | {
      type: "need-switch";
      playerId: string;
    }
  | {
      type: "switch";
      playerId: string;
      pokemonIndex: number;
      pokemonName: string;
    };
```

#### 説明
ターン処理の結果を1つのイベントにまとめて送信します。
クライアント側で `actions` 配列を順次処理することで、バトルの流れをアニメーション表示できます。

**重要な設計上の利点**:
1. **タイミング問題の回避**: すべての情報が一度に届くため、イベント受信漏れが発生しない
2. **状態同期の確実性**: `battleState` で最終状態を保証
3. **クライアント側の自由度**: アニメーション速度や演出をクライアント側で制御可能

---

## クライアント側の実装パターン

### 基本的な処理フロー

```typescript
channel.bind('turn-result', async (data: TurnResult) => {
  // 1. アニメーションフェーズに移行
  setCurrentPhase('animating');

  // 2. アクションを順次処理
  for (const action of data.actions) {
    await processAction(action);
    await sleep(800); // アクション間の待機時間
  }

  // 3. 最終状態を更新
  setMyPokemon(data.battleState.player1Pokemon);
  setOpponentPokemon(data.battleState.player2Pokemon);

  // 4. 次のフェーズへ遷移
  if (data.battleEnd) {
    // バトル終了処理
    setCurrentPhase('finished');
  } else if (needSwitchAction) {
    // ポケモン交換が必要
    setCurrentPhase('switching');
  } else {
    // 次のターンへ
    setCurrentPhase('selecting');
  }
});
```

### アクション別の処理例

```typescript
const processAction = async (action: TurnAction) => {
  switch (action.type) {
    case 'attack':
      addLog(`${attackerName}の${action.move}！`);
      if (action.effectiveness > 1) {
        addLog('効果は抜群だ！');
      }
      break;

    case 'faint':
      addLog(`${action.pokemonName}は倒れた！`);
      updatePokemonHP(action.pokemonIndex, 0);
      break;

    case 'need-switch':
      if (action.playerId === myPlayerId) {
        addLog('次のポケモンを選択してください');
      }
      break;

    case 'switch':
      addLog(`${action.pokemonName}に交換した！`);
      setActivePokemonIndex(action.pokemonIndex);
      break;
  }
};
```

---

## イベント処理のフロー図

```
両プレイヤーが技を選択
  ↓
サーバーが行動順を決定
  ↓
ターン処理を実行（processTurn）
  ├─ 先攻の攻撃 → attackアクション追加
  ├─ 後攻が倒れた？
  │   ├─ Yes → faintアクション追加
  │   │       → 全滅？
  │   │           ├─ Yes → battleEnd設定
  │   │           └─ No  → need-switchアクション追加
  │   └─ No  → 後攻の攻撃 → attackアクション追加
  │               → 先攻が倒れた？（同様の処理）
  └─ turn-resultイベントを送信
  
  ↓
クライアントが受信
  ↓
actionsを順次処理してアニメーション
  ↓
battleStateで最終状態を同期
  ↓
次のフェーズへ遷移
```

---

## 統合アプローチの利点

### 従来の分離アプローチ（attack/faint/need-switch）との比較

| 項目 | 分離アプローチ | 統合アプローチ（現在） |
|------|--------------|---------------------|
| イベント数 | 多い（3-8個/ターン） | 1個/ターン |
| タイミング問題 | ❌ 発生しやすい | ✅ なし |
| デバッグ | 難しい | 容易 |
| 状態同期 | 複雑 | シンプル |
| ネットワーク負荷 | やや高い | 低い |
| 演出の自由度 | サーバー依存 | クライアント自由 |

### 実装上の注意点

1. **useEffect依存配列の管理**
   - `myPokemon` などのstateをPusher useEffectの依存配列に含めない
   - useRefを使用して最新値を参照

2. **アニメーション処理**
   - `async/await` と `sleep()` で順次処理
   - `currentPhase = 'animating'` 中はUI操作を無効化

3. **エラーハンドリング**
   - ネットワーク切断時の再接続ロジック
   - イベント受信失敗時のリトライ

---

## デバッグ時の確認ポイント

1. **サーバーログ**: 
   - `[Turn Processing]` でアクション生成を確認
   - `Turn-result event sent` でイベント送信を確認

2. **ブラウザコンソール**: 
   - `[Pusher] Received turn-result event` でイベント受信を確認
   - `actions` 配列の内容を確認

3. **Pusherダッシュボード**: 
   - イベントのペイロードサイズを確認
   - 送信タイミングを監視

4. **チャンネル接続状態**: 
   - `pusher.connection.state` で接続状態を確認

---

## 今後の改善案

1. **型安全性の向上**
   - イベントペイロードの厳密な型定義
   - Zod等でランタイム型チェック

2. **パフォーマンス最適化**
   - 大規模なバトル時のペイロード圧縮
   - 差分更新の検討

3. **リプレイ機能**
   - `TurnResult` を保存してリプレイ可能に
   - バトルログのエクスポート機能

4. **オフライン対応**
   - ローカルストレージへの一時保存
   - 再接続時の状態復元

---

**最終更新**: 2026年4月25日  
**バージョン**: 2.0.0  
**変更履歴**: イベント統合アプローチへ刷新（v1.0.0 → v2.0.0）
