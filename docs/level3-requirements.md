# Level 3 Rule-Based Analysis System Requirements

## 現在実装済みの機能

### Level 1 (基本的な戦術)
- ✅ 基本的な戦術パターン検出
  - フォーク（特にナイトフォーク）
  - チェック
  - 駒取り（キャプチャー）
  - 脅威の作成
- ✅ 移動タイプの識別
- ✅ マテリアル計算
- ✅ 基本的な脅威検出

### Level 2 (ポジショナル要素)
- ✅ 中央支配の評価
- ✅ 駒の活動性分析
  - 開放ファイル/セミオープンファイル
  - 良いビショップ/悪いビショップ
  - 駒の機動性
- ✅ ポーン構造分析
  - 孤立ポーン
  - ダブルポーン
- ✅ アウトポスト（前進拠点）
- ✅ 弱いマスの検出

## Level 3 で追加する機能

### 1. 具体的な変化手順の生成と説明
```javascript
// 例：「もしRxe5なら、Qxe5 Nxe5 Rxe5で駒得になります」
generateConcreteVariation(position, depth, startingMove)
```

**要件：**
- 1-3手先までの具体的な手順を生成
- 各変化の評価（良い/悪い）
- なぜその手順が最善かの説明

### 2. 高度な戦術パターンの検出

#### a) 串刺し（Skewer）
```javascript
detectSkewer(position, move)
// 例：「ビショップがクイーンとルークを串刺しにします」
```

#### b) 開き攻撃（Discovered Attack）
```javascript
detectDiscoveredAttack(position, move)
// 例：「ナイトが動くことで、背後のビショップがクイーンを攻撃します」
```

#### c) 除去（Removal/Deflection）
```javascript
detectRemovalTactics(position, move)
// 例：「守り駒を除去して、次の手でメイトを狙います」
```

### 3. 戦略的プランの分析

#### a) 攻撃プラン
```javascript
analyzeAttackPlan(position, targetSide)
// 例：「キングサイドに駒を集中させて攻撃を準備」
```

#### b) ポジション改善プラン
```javascript
analyzePositionalPlan(position)
// 例：「悪いビショップを交換して、ナイトをd5の理想的な位置に」
```

#### c) エンドゲームへの移行
```javascript
analyzeEndgamePlan(position)
// 例：「クイーン交換を目指して有利なエンドゲームへ」
```

### 4. より詳細な評価説明

#### a) 候補手の比較
```javascript
compareAlternativeMoves(position, playedMove, alternatives)
// 例：「Nf3も良い手ですが、Nd5の方が中央を支配し、より積極的です」
```

#### b) 長期的影響の説明
```javascript
explainLongTermConsequences(position, move)
// 例：「このポーン前進は、将来的にキングサイドを弱体化させる可能性があります」
```

## 実装上の注意点

### 1. エラーハンドリング
- すべての関数にtry-catchを実装
- Chess.jsのmove()には必ず文字列（SAN形式）を渡す
- 無効な局面では graceful degradation

### 2. パフォーマンス
- 変化手順生成は最大3手まで
- 重い計算は必要な時のみ実行
- キャッシュの活用を検討

### 3. 型の一貫性
```typescript
// 明確な型定義
type MoveString = string;  // "e2e4" or "Nf3"
type MoveObject = {
  from: string;
  to: string;
  piece?: string;
  captured?: string;
  promotion?: string;
  san?: string;
};
```

### 4. テスタビリティ
- 各機能を独立した関数として実装
- 単体テストを書きやすい設計
- モックデータでのテストが可能

## 実装優先順位

1. **Phase 1**: 基本的な変化手順生成（1手のみ）
2. **Phase 2**: 高度な戦術パターン（串刺し、開き攻撃）
3. **Phase 3**: 複数手の変化手順（2-3手）
4. **Phase 4**: 戦略的プラン分析
5. **Phase 5**: 詳細な評価説明

## 成功基準

- エラーなく動作すること
- 説明が具体的で理解しやすいこと
- パフォーマンスが許容範囲内であること
- 既存のLevel 1, 2機能と調和していること