// Chess Error Handler - エラーハンドリングユーティリティ

/**
 * チェスアプリケーション用のカスタムエラークラス
 */
export class ChessAnalysisError extends Error {
  constructor(message, code = 'ANALYSIS_ERROR', details = null) {
    super(message);
    this.name = 'ChessAnalysisError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * エラーコードの定義
 */
export const ERROR_CODES = {
  // 入力検証エラー
  INVALID_FEN: 'INVALID_FEN',
  INVALID_MOVE: 'INVALID_MOVE',
  INVALID_MOVE_FORMAT: 'INVALID_MOVE_FORMAT',
  
  // チェスロジックエラー
  ILLEGAL_MOVE: 'ILLEGAL_MOVE',
  POSITION_NOT_FOUND: 'POSITION_NOT_FOUND',
  GAME_OVER: 'GAME_OVER',
  
  // 解析エラー
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  VARIATION_GENERATION_FAILED: 'VARIATION_GENERATION_FAILED',
  CONTEXT_EXTRACTION_FAILED: 'CONTEXT_EXTRACTION_FAILED',
  
  // システムエラー
  CHESS_ENGINE_ERROR: 'CHESS_ENGINE_ERROR',
  MEMORY_ERROR: 'MEMORY_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR'
};

/**
 * エラーメッセージの日本語化
 */
const ERROR_MESSAGES = {
  [ERROR_CODES.INVALID_FEN]: '無効なFEN形式です',
  [ERROR_CODES.INVALID_MOVE]: '無効な手です',
  [ERROR_CODES.INVALID_MOVE_FORMAT]: '手の形式が正しくありません',
  [ERROR_CODES.ILLEGAL_MOVE]: '不正な手です（ルール違反）',
  [ERROR_CODES.POSITION_NOT_FOUND]: '指定された局面が見つかりません',
  [ERROR_CODES.GAME_OVER]: 'ゲームは既に終了しています',
  [ERROR_CODES.ANALYSIS_FAILED]: '解析に失敗しました',
  [ERROR_CODES.VARIATION_GENERATION_FAILED]: '変化手順の生成に失敗しました',
  [ERROR_CODES.CONTEXT_EXTRACTION_FAILED]: 'コンテキストの抽出に失敗しました',
  [ERROR_CODES.CHESS_ENGINE_ERROR]: 'チェスエンジンでエラーが発生しました',
  [ERROR_CODES.MEMORY_ERROR]: 'メモリ不足エラーが発生しました',
  [ERROR_CODES.TIMEOUT_ERROR]: 'タイムアウトエラーが発生しました'
};

/**
 * エラーハンドリングユーティリティクラス
 */
export class ChessErrorHandler {
  /**
   * エラーをラップして詳細情報を追加
   * @param {Error} error - 元のエラー
   * @param {string} code - エラーコード
   * @param {Object} context - エラーコンテキスト
   * @returns {ChessAnalysisError} ラップされたエラー
   */
  static wrapError(error, code = ERROR_CODES.ANALYSIS_FAILED, context = {}) {
    const message = ERROR_MESSAGES[code] || error.message;
    const details = {
      originalError: error.message,
      stack: error.stack,
      context: context
    };
    
    return new ChessAnalysisError(message, code, details);
  }

  /**
   * FENの妥当性をチェック
   * @param {string} fen - チェックするFEN
   * @returns {{valid: boolean, error?: ChessAnalysisError}} 検証結果
   */
  static validateFEN(fen) {
    if (!fen || typeof fen !== 'string') {
      return {
        valid: false,
        error: new ChessAnalysisError(
          ERROR_MESSAGES[ERROR_CODES.INVALID_FEN],
          ERROR_CODES.INVALID_FEN,
          { fen }
        )
      };
    }

    // 基本的なFEN形式チェック
    const parts = fen.split(' ');
    if (parts.length !== 6) {
      return {
        valid: false,
        error: new ChessAnalysisError(
          'FENは6つのパートで構成される必要があります',
          ERROR_CODES.INVALID_FEN,
          { fen, parts: parts.length }
        )
      };
    }

    // より詳細なチェックはChess.jsに任せる
    return { valid: true };
  }

  /**
   * 安全に関数を実行
   * @param {Function} fn - 実行する関数
   * @param {string} errorCode - エラー時のコード
   * @param {Object} context - エラーコンテキスト
   * @returns {Promise<{success: boolean, result?: any, error?: ChessAnalysisError}>}
   */
  static async safeExecute(fn, errorCode = ERROR_CODES.ANALYSIS_FAILED, context = {}) {
    try {
      const result = await fn();
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: this.wrapError(error, errorCode, context)
      };
    }
  }

  /**
   * 同期的に安全に関数を実行
   * @param {Function} fn - 実行する関数
   * @param {string} errorCode - エラー時のコード
   * @param {Object} context - エラーコンテキスト
   * @returns {{success: boolean, result?: any, error?: ChessAnalysisError}}
   */
  static safeExecuteSync(fn, errorCode = ERROR_CODES.ANALYSIS_FAILED, context = {}) {
    try {
      const result = fn();
      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        error: this.wrapError(error, errorCode, context)
      };
    }
  }

  /**
   * エラーをログに記録
   * @param {ChessAnalysisError|Error} error - ログに記録するエラー
   * @param {string} level - ログレベル ('error', 'warn', 'info')
   */
  static logError(error, level = 'error') {
    const logData = {
      timestamp: new Date().toISOString(),
      level: level,
      name: error.name || 'Error',
      message: error.message,
      code: error.code || 'UNKNOWN',
      details: error.details || null
    };

    switch (level) {
      case 'error':
        console.error('[ChessAnalysis Error]', logData);
        break;
      case 'warn':
        console.warn('[ChessAnalysis Warning]', logData);
        break;
      case 'info':
        console.info('[ChessAnalysis Info]', logData);
        break;
      default:
        console.log('[ChessAnalysis]', logData);
    }
  }

  /**
   * ユーザーフレンドリーなエラーメッセージを取得
   * @param {ChessAnalysisError|Error} error - エラー
   * @returns {string} ユーザー向けメッセージ
   */
  static getUserFriendlyMessage(error) {
    if (error instanceof ChessAnalysisError) {
      return error.message;
    }
    
    // 一般的なエラーメッセージのマッピング
    const messageMap = {
      'Invalid move': '無効な手です',
      'Not your turn': '手番が違います',
      'King is in check': 'キングがチェックされています',
      'Move would leave king in check': 'この手はキングをチェックに晒します',
      'Game over': 'ゲームは終了しています'
    };

    for (const [key, value] of Object.entries(messageMap)) {
      if (error.message.includes(key)) {
        return value;
      }
    }

    return '予期しないエラーが発生しました';
  }

  /**
   * リトライ可能なエラーかどうかを判定
   * @param {ChessAnalysisError|Error} error - エラー
   * @returns {boolean} リトライ可能かどうか
   */
  static isRetryable(error) {
    if (error instanceof ChessAnalysisError) {
      const nonRetryableCodes = [
        ERROR_CODES.INVALID_FEN,
        ERROR_CODES.INVALID_MOVE,
        ERROR_CODES.ILLEGAL_MOVE,
        ERROR_CODES.GAME_OVER
      ];
      
      return !nonRetryableCodes.includes(error.code);
    }
    
    return false;
  }

  /**
   * エラーから回復可能なデフォルト値を返す
   * @param {ChessAnalysisError|Error} error - エラー
   * @param {any} defaultValue - デフォルト値
   * @returns {any} 回復用の値
   */
  static recoverWithDefault(error, defaultValue) {
    this.logError(error, 'warn');
    
    if (error instanceof ChessAnalysisError) {
      console.warn(`Recovering from ${error.code} with default value`);
    }
    
    return defaultValue;
  }
}

export default ChessErrorHandler;