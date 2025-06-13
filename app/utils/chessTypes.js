// Chess Move Analyzer Type Definitions
// JavaScriptでもJSDocコメントで型情報を提供

/**
 * @typedef {string} MoveString
 * @description チェスの手を表す文字列（"e2e4" or "Nf3" 形式）
 */

/**
 * @typedef {Object} MoveObject
 * @property {string} from - 移動元のマス（例: "e2"）
 * @property {string} to - 移動先のマス（例: "e4"）
 * @property {string} [piece] - 動かす駒のタイプ（'p', 'n', 'b', 'r', 'q', 'k'）
 * @property {string} [captured] - 取る駒のタイプ
 * @property {string} [promotion] - プロモーション先の駒タイプ
 * @property {string} [san] - Standard Algebraic Notation形式の手
 * @property {string} [color] - 手番の色（'w' or 'b'）
 * @property {string} [flags] - 特殊な手のフラグ（キャスリングなど）
 */

/**
 * @typedef {Object} MoveContext
 * @property {string[]} type - 手のタイプ（'capture', 'check', 'development'など）
 * @property {boolean} captures - 駒取りかどうか
 * @property {string|null} capturedPiece - 取った駒の名前
 * @property {boolean} develops - 開発の手かどうか
 * @property {string[]} attacks - 攻撃しているマスのリスト
 * @property {string[]} defends - 守っている駒のリスト
 * @property {Object[]} tactical - 戦術的モチーフのリスト
 * @property {boolean} checks - チェックかどうか
 * @property {boolean} doubleCheck - ダブルチェックかどうか
 * @property {Object[]} forks - フォークの情報
 * @property {number} centralControl - 中央支配の評価値
 * @property {Object} pieceActivity - 駒の活動性情報
 * @property {Object} pawnStructure - ポーン構造情報
 */

/**
 * @typedef {Object} Variation
 * @property {string} move - 変化の手（SAN形式） - 単一手の場合
 * @property {string} [moves] - 変化手順（SAN形式、スペース区切り） - 複数手の場合
 * @property {string} explanation - 日本語での説明
 * @property {number} evaluation - 評価値（初手後の評価）
 * @property {number} [finalEvaluation] - 最終局面での評価値
 * @property {boolean} isCritical - 重要な変化かどうか
 * @property {boolean} [isBestMove] - 最善手かどうか
 * @property {number} [depth] - 探索深度
 */

/**
 * @typedef {Object} StockfishData
 * @property {string} bestMove - エンジンの最善手
 * @property {boolean} wasBestMove - 指された手が最善手かどうか
 * @property {number} [evalChange] - 評価値の変化
 * @property {string} [playedMove] - 実際に指された手
 * @property {number} [depth] - 探索深度
 */

/**
 * @typedef {Object} MoveAnalysis
 * @property {string} summary - 手の要約
 * @property {string[]} details - 詳細な説明のリスト
 * @property {string[]} keyPoints - 重要なポイントのリスト
 * @property {string[]} moveType - 手のタイプのリスト
 * @property {Variation[]} [variations] - 変化手順のリスト（Level 3）
 */

/**
 * @typedef {Object} EvaluationFactors
 * @property {number} score - 評価スコア
 * @property {boolean} isCritical - 重要な局面かどうか
 * @property {string[]} factors - 評価要因のリスト
 */

/**
 * @typedef {Object} PieceInfo
 * @property {string} type - 駒のタイプ（'p', 'n', 'b', 'r', 'q', 'k'）
 * @property {string} color - 駒の色（'w' or 'b'）
 * @property {string} square - 駒の位置
 */

/**
 * @typedef {Object} TacticalPattern
 * @property {string} type - 戦術パターンのタイプ（'fork', 'pin', 'skewer'など）
 * @property {string} attacker - 攻撃する駒
 * @property {PieceInfo[]} targets - ターゲットの駒情報
 * @property {string} [description] - パターンの説明
 */

// 定数定義もエクスポート
export const MOVE_TYPES = {
  CAPTURE: 'capture',
  CHECK: 'check',
  CHECKMATE: 'checkmate',
  DEVELOPMENT: 'development',
  KINGSIDE_CASTLE: 'kingside-castle',
  QUEENSIDE_CASTLE: 'queenside-castle',
  FORK: 'fork',
  PIN: 'pin',
  SKEWER: 'skewer',
  DISCOVERED_ATTACK: 'discovered-attack',
  REMOVAL: 'removal',
  DEFLECTION: 'deflection',
  TACTICAL: 'tactical',
  ATTACKING: 'attacking',
  DEFENSIVE: 'defensive',
  MAJOR_THREAT: 'major_threat',
  STRATEGIC_ATTACK: 'strategic_attack',
  STRATEGIC_POSITIONAL: 'strategic_positional',
  STRATEGIC_ENDGAME: 'strategic_endgame'
};

export const PIECE_TYPES = {
  PAWN: 'p',
  KNIGHT: 'n',
  BISHOP: 'b',
  ROOK: 'r',
  QUEEN: 'q',
  KING: 'k'
};

export const COLORS = {
  WHITE: 'w',
  BLACK: 'b'
};

// ヘルパー関数：moveが有効な形式かチェック
export function isValidMoveObject(move) {
  if (!move || typeof move !== 'object') return false;
  
  // 最低限fromとtoが必要
  if (!move.from || !move.to) {
    // ただしSAN形式の場合は例外
    return !!move.san;
  }
  
  // fromとtoは2文字の文字列
  const squarePattern = /^[a-h][1-8]$/;
  return squarePattern.test(move.from) && squarePattern.test(move.to);
}

// ヘルパー関数：文字列が有効なSAN形式かチェック
export function isValidSAN(moveStr) {
  if (typeof moveStr !== 'string') return false;
  
  // 簡易的なSANパターンチェック
  // キャスリング
  if (moveStr === 'O-O' || moveStr === 'O-O-O') return true;
  
  // 通常の手（例: e4, Nf3, Bxe5+, etc）
  const sanPattern = /^[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8][+#]?$/;
  return sanPattern.test(moveStr);
}

// ヘルパー関数：文字列が有効なUCI形式かチェック
export function isValidUCI(moveStr) {
  if (typeof moveStr !== 'string') return false;
  
  // UCI形式（例: e2e4, e7e8q）
  const uciPattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
  return uciPattern.test(moveStr);
}