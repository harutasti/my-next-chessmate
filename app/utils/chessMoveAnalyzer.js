// Chess Move Analyzer - Rule-based natural language explanation system
import { Chess } from 'chess.js';
import { 
  MOVE_TYPES, 
  PIECE_TYPES, 
  COLORS,
  isValidMoveObject,
  isValidSAN,
  isValidUCI
} from './chessTypes.js';
import ChessErrorHandler, { 
  ChessAnalysisError, 
  ERROR_CODES 
} from './chessErrorHandler.js';

/**
 * @typedef {import('./chessTypes.js').MoveObject} MoveObject
 * @typedef {import('./chessTypes.js').MoveContext} MoveContext
 * @typedef {import('./chessTypes.js').Variation} Variation
 * @typedef {import('./chessTypes.js').StockfishData} StockfishData
 * @typedef {import('./chessTypes.js').MoveAnalysis} MoveAnalysis
 * @typedef {import('./chessTypes.js').EvaluationFactors} EvaluationFactors
 */

// 駒の日本語名
const PIECE_NAMES = {
  'p': 'ポーン',
  'n': 'ナイト',
  'b': 'ビショップ',
  'r': 'ルーク',
  'q': 'クイーン',
  'k': 'キング'
};

// マスの重要度
const SQUARE_IMPORTANCE = {
  center: ['e4', 'e5', 'd4', 'd5'],
  extendedCenter: ['c3', 'c4', 'c5', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f4', 'f5', 'f6'],
  kingside: ['f1', 'g1', 'h1', 'f2', 'g2', 'h2', 'f7', 'g7', 'h7', 'f8', 'g8', 'h8'],
  queenside: ['a1', 'b1', 'c1', 'a2', 'b2', 'c2', 'a7', 'b7', 'c7', 'a8', 'b8', 'c8']
};

// 戦術パターン
const TACTICAL_PATTERNS = {
  fork: 'フォーク',
  pin: 'ピン',
  skewer: '串刺し',
  discoveredAttack: '開き攻撃',
  removal: '除去',
  deflection: '偏向',
  doubleAttack: 'ダブルアタック',
  backRankMate: 'バックランクメイト'
};

class ChessMoveAnalyzer {
  constructor() {
    this.chess = new Chess();
  }

  /**
   * メインの解析関数
   * @param {string} fen - 現在の局面のFEN
   * @param {MoveObject|string} move - 解析する手
   * @param {string|null} previousFen - 前の局面のFEN
   * @param {Object|null} evaluation - 評価情報
   * @param {StockfishData|null} stockfishData - Stockfishの分析データ
   * @param {Array<MoveObject|string>} [alternativeMoves] - 比較する代替手（Level 3）
   * @returns {MoveAnalysis} 解析結果
   */
  analyzeMoveNaturalLanguage(fen, move, previousFen = null, evaluation = null, stockfishData = null, alternativeMoves = null) {
    try {
      // FENの検証
      const fenValidation = ChessErrorHandler.validateFEN(fen);
      if (!fenValidation.valid) {
        throw fenValidation.error;
      }
      
      // FENをロード
      const loadResult = ChessErrorHandler.safeExecuteSync(
        () => this.chess.load(fen),
        ERROR_CODES.INVALID_FEN,
        { fen }
      );
      
      if (!loadResult.success) {
        throw loadResult.error;
      }
      
      // 手の解析
      const parseResult = ChessErrorHandler.safeExecuteSync(
        () => typeof move === 'string' ? this.parseMove(move) : move,
        ERROR_CODES.INVALID_MOVE_FORMAT,
        { move }
      );
      
      if (!parseResult.success) {
        throw parseResult.error;
      }
      
      const moveObj = parseResult.result;
      
      // コンテキストの取得
      const contextResult = ChessErrorHandler.safeExecuteSync(
        () => this.getMoveContext(moveObj, this.chess, previousFen),
        ERROR_CODES.CONTEXT_EXTRACTION_FAILED,
        { move: moveObj, fen }
      );
      
      if (!contextResult.success) {
        ChessErrorHandler.logError(contextResult.error, 'warn');
        // コンテキスト取得失敗時はデフォルト値で続行
        const moveContext = { type: [], captures: false };
        const explanation = this.generateExplanation(moveObj, moveContext, evaluation, stockfishData, null, null);
        
        return {
          summary: explanation.summary,
          details: [...explanation.details, 'コンテキスト情報の取得に一部失敗しました'],
          keyPoints: explanation.keyPoints,
          moveType: moveContext.type,
          variations: [],
          warning: 'Partial analysis due to context extraction failure'
        };
      }
      
      const moveContext = contextResult.result;
      
      // Level 3: 変化手順を生成（最大3手先まで）
      const variationsResult = ChessErrorHandler.safeExecuteSync(
        () => this.generateVariations(fen, moveObj, stockfishData, 3),
        ERROR_CODES.VARIATION_GENERATION_FAILED,
        { move: moveObj, fen }
      );
      
      const variations = variationsResult.success ? variationsResult.result : [];
      if (!variationsResult.success) {
        ChessErrorHandler.logError(variationsResult.error, 'warn');
      }
      
      // Level 3: 代替手との比較
      let moveComparison = null;
      if (alternativeMoves && alternativeMoves.length > 0) {
        const comparisonResult = ChessErrorHandler.safeExecuteSync(
          () => this.compareAlternativeMoves(fen, moveObj, alternativeMoves, moveContext),
          ERROR_CODES.ANALYSIS_FAILED,
          { move: moveObj, alternatives: alternativeMoves }
        );
        
        if (comparisonResult.success) {
          moveComparison = comparisonResult.result;
        } else {
          ChessErrorHandler.logError(comparisonResult.error, 'warn');
        }
      }
      
      // 説明の生成
      const explanationResult = ChessErrorHandler.safeExecuteSync(
        () => this.generateExplanation(moveObj, moveContext, evaluation, stockfishData, variations, moveComparison),
        ERROR_CODES.ANALYSIS_FAILED,
        { move: moveObj }
      );
      
      if (!explanationResult.success) {
        throw explanationResult.error;
      }
      
      const explanation = explanationResult.result;
      
      return {
        summary: explanation.summary,
        details: explanation.details,
        keyPoints: explanation.keyPoints,
        moveType: moveContext.type,
        variations: variations // Level 3で追加
      };
      
    } catch (error) {
      ChessErrorHandler.logError(error);
      
      // エラー時でも最小限の情報を返す
      const userMessage = ChessErrorHandler.getUserFriendlyMessage(error);
      return {
        summary: '解析エラー',
        details: [userMessage],
        keyPoints: ['エラー'],
        moveType: [],
        variations: [],
        error: true,
        errorMessage: userMessage
      };
    }
  }

  /**
   * 手を解析してオブジェクトに変換
   * @param {string|MoveObject} moveStr - 解析する手
   * @returns {MoveObject} 手のオブジェクト
   */
  parseMove(moveStr) {
    // moveStr がすでにオブジェクトの場合はそのまま返す
    if (typeof moveStr === 'object' && moveStr !== null) {
      // 有効なMoveObjectかチェック
      if (isValidMoveObject(moveStr)) {
        return moveStr;
      }
      console.warn('Invalid move object:', moveStr);
      return moveStr; // 互換性のため、警告を出しつつ返す
    }
    
    // UCI形式の場合（"e2e4" 形式）
    if (isValidUCI(moveStr)) {
      const from = moveStr.substring(0, 2);
      const to = moveStr.substring(2, 4);
      
      // 現在のポジションから合法手を取得
      const legalMoves = this.chess.moves({ verbose: true });
      const moveObj = legalMoves.find(m => m.from === from && m.to === to);
      
      return moveObj || { from, to };
    }
    
    // SAN形式の場合 - 注意: これは現在のポジションを変更してしまうので使わない
    return { san: moveStr };
  }

  // 局面を解析
  analyzePosition(fen) {
    this.chess.load(fen);
    
    return {
      material: this.calculateMaterial(),
      kingPosition: this.getKingPositions(),
      pawnStructure: this.analyzePawnStructure(),
      pieceActivity: this.analyzePieceActivity(),
      threats: this.identifyThreats(),
      stage: this.getGameStage(),
      isCheck: this.chess.isCheck(),
      isCheckmate: this.chess.isCheckmate(),
      isDraw: this.chess.isDraw()
    };
  }

  /**
   * 手のコンテキストを取得
   * @param {MoveObject} move - 手のオブジェクト
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string|null} previousFen - 前の局面のFEN
   * @returns {MoveContext} 手のコンテキスト
   */
  getMoveContext(move, chessInstance, previousFen) {
    const context = {
      type: [],
      captures: false,
      capturedPiece: null,
      develops: false,
      attacks: [],
      defends: [],
      improves: [],
      creates: [],
      tactical: [],
      checks: false,
      discoveredCheck: false,
      doubleCheck: false,
      pins: [],
      forks: [],
      skewers: [],
      // ポジショナル要素
      centralControl: 0,
      pieceActivity: {},
      pawnStructure: {},
      kingPosition: {},
      openFiles: [],
      outposts: [],
      weakSquares: [],
      // 戦略的プラン
      strategicPlans: [],
      // 長期的影響
      longTermConsequences: []
    };

    // キャプチャーかどうか
    if (move.captured) {
      context.captures = true;
      context.capturedPiece = PIECE_NAMES[move.captured];
      context.type.push(MOVE_TYPES.CAPTURE);
    }

    // チェックかどうか
    if (move.san && move.san.includes('+')) {
      context.checks = true;
      context.type.push(MOVE_TYPES.CHECK);
      
      // ダブルチェックやディスカバードチェックの検出
      const checkingPieces = this.getCheckingPieces(chessInstance);
      if (checkingPieces.length > 1) {
        context.doubleCheck = true;
        context.type.push(MOVE_TYPES.CHECK);
      }
    }

    // 基本的な戦術パターンの検出
    this.detectBasicTactics(move, chessInstance, context, previousFen);
    
    // ポジショナル要素の分析
    this.analyzePositionalFactors(move, chessInstance, previousFen, context);
    
    // Level 3: 戦略的プランの分析
    const strategicPlans = this.analyzeStrategicPlans(move, chessInstance, previousFen, context);
    if (strategicPlans.length > 0) {
      context.strategicPlans = strategicPlans;
      strategicPlans.forEach(plan => {
        if (plan.type === 'attack') {
          context.type.push(MOVE_TYPES.STRATEGIC_ATTACK);
        } else if (plan.type === 'positional') {
          context.type.push(MOVE_TYPES.STRATEGIC_POSITIONAL);
        } else if (plan.type === 'endgame') {
          context.type.push(MOVE_TYPES.STRATEGIC_ENDGAME);
        }
      });
    }
    
    // Level 3: 長期的影響の分析
    const longTermConsequences = this.analyzeLongTermConsequences(move, chessInstance, context);
    if (longTermConsequences.length > 0) {
      context.longTermConsequences = longTermConsequences;
    }

    // 開発の手かどうか
    if (this.isDevelopingMove(move, chessInstance)) {
      context.develops = true;
      context.type.push(MOVE_TYPES.DEVELOPMENT);
    }

    // 攻撃的な手かどうか
    const attacks = this.getAttackedSquares(move, chessInstance);
    if (attacks.length > 0) {
      context.attacks = attacks;
      context.type.push(MOVE_TYPES.ATTACKING);
    }

    // 守備的な手かどうか
    const defends = this.getDefendedPieces(move, chessInstance);
    if (defends.length > 0) {
      context.defends = defends;
      context.type.push(MOVE_TYPES.DEFENSIVE);
    }

    // 戦術的モチーフ
    const tactical = this.identifyTacticalMotifs(move, chessInstance);
    if (tactical.length > 0) {
      context.tactical = tactical;
      context.type.push(MOVE_TYPES.TACTICAL);
    }

    // キャスリング
    if (move.flags) {
      if (typeof move.flags === 'string' && move.flags.includes('k')) {
        context.type.push(MOVE_TYPES.KINGSIDE_CASTLE);
      } else if (typeof move.flags === 'string' && move.flags.includes('q')) {
        context.type.push(MOVE_TYPES.QUEENSIDE_CASTLE);
      }
    }
    // SAN記法からキャスリングを検出
    if (move.san === 'O-O') {
      context.type.push(MOVE_TYPES.KINGSIDE_CASTLE);
    } else if (move.san === 'O-O-O') {
      context.type.push(MOVE_TYPES.QUEENSIDE_CASTLE);
    }

    return context;
  }

  /**
   * 自然言語説明を生成
   * @param {MoveObject} move - 手のオブジェクト
   * @param {MoveContext} context - 手のコンテキスト
   * @param {Object|null} evaluation - 評価情報
   * @param {StockfishData|null} stockfishData - Stockfishデータ
   * @param {Variation[]|null} variations - 変化手順
   * @param {Object|null} moveComparison - 代替手との比較（Level 3）
   * @returns {{summary: string, details: string[], keyPoints: string[]}} 説明
   */
  generateExplanation(move, context, evaluation, stockfishData, variations = null, moveComparison = null) {
    let summary = '';
    const details = [];
    const keyPoints = [];

    // 基本的な手の説明
    const pieceName = move.piece ? PIECE_NAMES[move.piece] : (move.san ? this.getPieceFromSan(move.san) : '駒');
    const from = move.from || '';
    const to = move.to || '';

    // キャスリングの場合
    if (context.type.includes(MOVE_TYPES.KINGSIDE_CASTLE)) {
      summary = 'キングサイドキャスリングで王の安全を確保します。';
      details.push('王を安全な位置に移動し、ルークを中央付近に配置します。');
      keyPoints.push('王の安全確保', 'ルークの活性化');
    } else if (context.type.includes(MOVE_TYPES.QUEENSIDE_CASTLE)) {
      summary = 'クイーンサイドキャスリングで王を安全にし、ルークを活用します。';
      details.push('王を安全地帯に避難させ、a-fileのルークを中央に向けます。');
      keyPoints.push('王の安全確保', 'クイーンサイドの展開');
    } 
    // キャプチャーの場合
    else if (context.captures) {
      const capturedPiece = PIECE_NAMES[move.captured] || '駒';
      summary = `${to}の${capturedPiece}を${pieceName}で取ります。`;
      
      // マテリアルの変化を説明
      const materialGain = this.getPieceValue(move.captured) - (move.promotion ? 0 : 0);
      if (materialGain > 0) {
        details.push(`${materialGain}ポイント相当のマテリアルを獲得します。`);
        keyPoints.push('マテリアル獲得');
      }
    }
    // 開発の手
    else if (context.develops) {
      summary = `${pieceName}を${to}に展開します。`;
      
      if (SQUARE_IMPORTANCE.center.includes(to)) {
        details.push('中央の重要なマスをコントロールします。');
        keyPoints.push('中央支配');
      } else if (SQUARE_IMPORTANCE.extendedCenter.includes(to)) {
        details.push('中央付近の良いマスに駒を配置します。');
        keyPoints.push('駒の活性化');
      }
    }
    // その他の手
    else {
      summary = `${pieceName}を${from}から${to}へ移動します。`;
    }

    // 攻撃的な要素
    if (context.attacks.length > 0) {
      const attackedPieces = context.attacks.map(sq => {
        const piece = this.chess.get(sq);
        return piece ? PIECE_NAMES[piece.type] : null;
      }).filter(p => p);
      
      if (attackedPieces.length > 0) {
        details.push(`相手の${attackedPieces.join('と')}に圧力をかけます。`);
        keyPoints.push('攻撃的な手');
      }
    }

    // 守備的な要素
    if (context.defends.length > 0) {
      details.push(`自分の${context.defends.join('と')}を守ります。`);
      keyPoints.push('守備強化');
    }

    // 戦術的モチーフ
    if (context.tactical.length > 0) {
      context.tactical.forEach(pattern => {
        if (TACTICAL_PATTERNS[pattern.type]) {
          details.push(`${TACTICAL_PATTERNS[pattern.type]}の戦術モチーフを含んでいます。`);
          keyPoints.push(TACTICAL_PATTERNS[pattern.type]);
        }
      });
    }

    // 基本的な戦術パターンの説明
    // フォークの説明
    if (context.forks && context.forks.length > 0) {
      context.forks.forEach(fork => {
        const targets = fork.targets.map(t => `${t.square}の${t.piece}`).join('と');
        details.push(`${fork.attacker}が${targets}を同時に攻撃するフォークです。`);
        keyPoints.push('フォーク');
        
        // 特にキングが含まれている場合
        if (fork.targets.some(t => t.piece === 'キング')) {
          details.push('キングへのチェックと同時に他の駒も攻撃する強力な手です。');
        }
      });
    }
    
    // チェックの説明
    if (context.checks) {
      if (context.doubleCheck) {
        details.push('ダブルチェック！相手のキングは動くしか選択肢がありません。');
        keyPoints.push('ダブルチェック');
      } else {
        details.push('チェックで相手に圧力をかけます。');
      }
    }
    
    // Level 3: 串刺しの説明
    if (context.skewers && context.skewers.length > 0) {
      context.skewers.forEach(skewer => {
        const frontPiece = `${skewer.frontPiece.square}の${skewer.frontPiece.type}`;
        const backPiece = `${skewer.backPiece.square}の${skewer.backPiece.type}`;
        
        if (skewer.frontPiece.type === 'キング') {
          details.push(`${skewer.attacker}が${frontPiece}を攻撃し、キングが逃げると${backPiece}を取れる串刺しです！`);
          keyPoints.push('キングへの串刺し');
        } else {
          details.push(`${skewer.attacker}が${frontPiece}と${backPiece}を串刺しにしています。`);
          keyPoints.push('串刺し');
        }
        
        // 特に強力な串刺し
        if (skewer.frontPiece.value + skewer.backPiece.value >= 10) {
          details.push('非常に強力な串刺しで、相手に大きな損失を強いることができます。');
        }
      });
    }
    
    // Level 3: 開き攻撃の説明
    if (context.tactical && context.tactical.length > 0) {
      const discoveredAttacks = context.tactical.filter(t => t.type === MOVE_TYPES.DISCOVERED_ATTACK);
      discoveredAttacks.forEach(attack => {
        const targets = attack.targets.map(t => `${t.square}の${t.piece}`).join('と');
        
        if (attack.isCheck) {
          details.push(`${attack.movedPiece}が動くことで、${attack.attackerSquare}の${attack.attacker}が相手のキングにチェックをかける開きチェックです！`);
          keyPoints.push('開きチェック');
          
          // ダブルアタックの場合
          if (attack.targets.length > 1) {
            details.push('さらに他の駒も同時に攻撃する非常に強力な手です。');
          }
        } else {
          details.push(`${attack.movedPiece}が動くことで、${attack.attacker}が${targets}を攻撃する開き攻撃です。`);
          keyPoints.push('開き攻撃');
        }
        
        // 高価値の標的
        const highValueTargets = attack.targets.filter(t => t.value >= 5);
        if (highValueTargets.length > 0) {
          details.push('価値の高い駒を狙う強力な戦術的手段です。');
        }
      });
      
      // Level 3: 除去戦術の説明
      const removalTactics = context.tactical.filter(t => t.type === 'removal');
      removalTactics.forEach(tactic => {
        details.push(tactic.explanation);
        keyPoints.push('除去戦術');
        
        // 特に強力な除去
        if (tactic.undefendedTarget && tactic.undefendedTarget.value >= 5) {
          details.push('守り駒を除去することで、価値の高い駒を狙える強力な戦術です。');
        }
      });
      
      // Level 3: 偏向戦術の説明
      const deflectionTactics = context.tactical.filter(t => t.type === 'deflection');
      deflectionTactics.forEach(tactic => {
        details.push(tactic.explanation);
        keyPoints.push('偏向戦術');
      });
    }
    
    // 駒取りの説明
    if (context.captures && context.capturedPiece) {
      const pieceValue = this.getPieceValue(move.captured);
      const movedPieceValue = this.getPieceValue(move.piece);
      
      if (pieceValue > movedPieceValue) {
        details.push(`${context.capturedPiece}を取る良い交換です。`);
        keyPoints.push('有利な交換');
      } else if (pieceValue === movedPieceValue) {
        details.push(`${context.capturedPiece}との等価交換です。`);
      } else {
        // 低い価値の駒を取る場合でも、戦術的な理由があるかもしれない
        if (context.type.includes('fork') || context.type.includes('check')) {
          details.push(`${context.capturedPiece}を取りながら、さらなる脅威を作ります。`);
        }
      }
    }
    
    // 脅威の説明
    if (context.threatens && context.threatens.length > 0) {
      const majorThreats = context.threatens.filter(t => t.value >= 5);
      if (majorThreats.length > 0) {
        const threatenedPieces = majorThreats.map(t => `${t.square}の${t.piece}`).join('と');
        details.push(`${threatenedPieces}に対する深刻な脅威を作ります。`);
        keyPoints.push('重要な脅威');
      }
    }
    
    // ポジショナル要素の説明
    // 中央支配
    if (context.centralControl >= 3) {
      details.push('中央の支配を強化する優れた手です。');
      keyPoints.push('中央支配');
    } else if (context.centralControl >= 2) {
      details.push('中央での影響力を高めます。');
    }
    
    // 駒の活動性
    if (context.pieceActivity) {
      if (context.pieceActivity.openFile) {
        details.push(`${PIECE_NAMES[move.piece]}を開放ファイルに配置し、活動性を最大化します。`);
        keyPoints.push('開放ファイル');
      } else if (context.pieceActivity.semiOpenFile) {
        details.push(`${PIECE_NAMES[move.piece]}をセミオープンファイルに配置し、圧力を強めます。`);
        keyPoints.push('セミオープンファイル');
      }
      
      if (context.pieceActivity.goodBishop) {
        details.push('ビショップの対角線を開き、良いビショップとして機能させます。');
        keyPoints.push('良いビショップ');
      } else if (context.pieceActivity.badBishop) {
        details.push('このビショップは自分のポーンに制限されており、活動性が低いです。');
      }
      
      if (context.pieceActivity.mobility > 10) {
        details.push(`${PIECE_NAMES[move.piece]}の機動性が高く、多くの選択肢があります。`);
      }
    }
    
    // アウトポスト
    if (context.outposts && context.outposts.length > 0) {
      context.outposts.forEach(outpost => {
        details.push(`${outpost.square}に強力なアウトポスト（前進拠点）を確立します。`);
        keyPoints.push('アウトポスト');
      });
    }
    
    // ポーン構造
    if (context.pawnStructure) {
      // 相手のポーン構造の弱点を突く
      const oppColor = move.color === 'w' ? 'b' : 'w';
      const oppIsolated = context.pawnStructure.isolated.filter(p => p.color === oppColor);
      const oppDoubled = context.pawnStructure.doubled.filter(p => p.color === oppColor);
      
      if (oppIsolated.length > 0) {
        details.push(`相手の${oppIsolated[0].file}ファイルの孤立ポーンに圧力をかけます。`);
        keyPoints.push('孤立ポーンへの圧力');
      }
      
      if (oppDoubled.length > 0) {
        details.push(`相手の${oppDoubled[0].file}ファイルのダブルポーンを標的にします。`);
      }
    }
    
    // 弱いマス
    if (context.weakSquares && context.weakSquares.length > 0) {
      const criticalWeakness = context.weakSquares.find(w => w.weakness >= 2);
      if (criticalWeakness) {
        details.push(`${criticalWeakness.square}の弱点を攻撃する可能性を作ります。`);
        keyPoints.push('弱点への圧力');
      }
    }
    

    // Stockfishの評価に基づく詳細な説明
    if (stockfishData) {
      // 評価値の変化に基づく説明
      if (stockfishData.evalChange !== undefined) {
        const absChange = Math.abs(stockfishData.evalChange);
        const isWhiteMove = move.color === 'w';
        const isGoodForPlayer = (stockfishData.evalChange > 0 && isWhiteMove) || 
                               (stockfishData.evalChange < 0 && !isWhiteMove);
        
        if (isGoodForPlayer) {
          if (absChange > 2) {
            if (!details.some(d => d.includes('決定的'))) {
              details.push('この手は決定的な優位を築きます。');
            }
            keyPoints.push('決定的な手');
          } else if (absChange > 1) {
            if (!details.some(d => d.includes('明確に'))) {
              details.push('局面を明確に改善します。');
            }
          }
        } else {
          if (absChange > 2) {
            // 具体的なミスの理由を説明
            if (context.threatens && context.threatens.length === 0 && !context.captures) {
              details.push('相手の脅威を見落としている可能性があります。');
            }
            keyPoints.push('重大なミス');
          } else if (absChange > 1) {
            if (!stockfishData.wasBestMove) {
              details.push('より良い選択肢がありました。');
            }
            keyPoints.push('ミス');
          }
        }
      }
      
      // 最善手との比較
      if (stockfishData.bestMove && stockfishData.playedMove) {
        const playedMoveStr = move.from + move.to + (move.promotion || '');
        if (stockfishData.wasBestMove || stockfishData.bestMove === playedMoveStr || stockfishData.bestMove.startsWith(playedMoveStr)) {
          details.push('これはエンジンが推奨する最善手です。');
          keyPoints.push('最善手');
        } else {
          details.push(`エンジンは${this.convertMoveToJapanese(stockfishData.bestMove)}を推奨していました。`);
          
          // なぜ指された手が最善手でないかの説明
          if (stockfishData.evalChange && stockfishData.evalChange < -0.5) {
            const reason = this.explainWhyNotBest(move, stockfishData.bestMove, context, stockfishData);
            if (reason) details.push(reason);
          }
        }
      }
      
    }
    
    // 従来の評価も併用
    if (evaluation) {
      if (evaluation.quality === 'good' && !stockfishData) {
        details.push('この手は局面を改善する良い手です。');
      } else if (evaluation.quality === 'mistake' && !stockfishData) {
        details.push('より良い手があったかもしれません。');
      } else if (evaluation.quality === 'blunder' && !stockfishData) {
        details.push('この手は重大な誤りで、相手に有利を与えてしまいます。');
      }
    }

    // チェックの場合
    if (this.chess.isCheck()) {
      details.push('相手の王にチェックをかけます！');
      keyPoints.push('チェック');
    }

    // Level 3: 戦略的プランの説明
    if (context.strategicPlans && context.strategicPlans.length > 0) {
      context.strategicPlans.forEach(plan => {
        details.push(plan.description);
        
        if (plan.type === 'attack') {
          keyPoints.push('攻撃プラン');
          if (plan.strength >= 4) {
            details.push('複数の駒が連携して強力な攻撃態勢を築いています。');
          }
        } else if (plan.type === 'positional') {
          keyPoints.push('ポジション改善');
          if (plan.value >= 3) {
            details.push('長期的な優位性を確立する重要な手です。');
          }
        } else if (plan.type === 'endgame') {
          keyPoints.push('エンドゲーム移行');
          if (plan.desirability >= 3) {
            details.push('有利な条件でのエンドゲームへの移行が期待できます。');
          }
        }
      });
    }

    // Level 3: 変化手順の説明を追加
    if (variations && variations.length > 0) {
      variations.forEach(variation => {
        if (variation.explanation) {
          details.push(variation.explanation);
          if (variation.isCritical) {
            keyPoints.push('重要な変化');
          }
        }
      });
    }
    
    // Level 3: 代替手との比較の説明
    if (moveComparison) {
      if (moveComparison.betterAlternatives.length > 0) {
        details.push(moveComparison.comparisonSummary);
        keyPoints.push('代替手分析');
        
        // より良い代替手がある場合
        moveComparison.betterAlternatives.forEach(alt => {
          details.push(alt.explanation);
        });
      } else if (moveComparison.similarAlternatives.length > 0) {
        // 同程度の代替手がある場合
        details.push(moveComparison.comparisonSummary);
      }
      
      // なぜ指された手を選んだかの説明
      if (moveComparison.whyChosen) {
        details.push(moveComparison.whyChosen);
      }
    }
    
    // Level 3: 長期的影響の説明
    if (context.longTermConsequences && context.longTermConsequences.length > 0) {
      context.longTermConsequences.forEach(consequence => {
        if (consequence.severity >= 2) {
          details.push(consequence.description);
          keyPoints.push('長期的影響');
        } else if (consequence.severity >= 1) {
          details.push(consequence.description);
        }
      });
    }

    return {
      summary,
      details,
      keyPoints
    };
  }

  // ヘルパー関数群

  isDevelopingMove(move, chessInstance) {
    // 序盤での駒の開発かチェック
    // 手数が少ない序盤で、軽駒（ナイト、ビショップ）を展開している場合
    const moveCount = chessInstance.moveNumber();
    if (moveCount > 15) return false; // 序盤を過ぎている
    
    // ナイトかビショップの展開
    if (move.piece === 'n' || move.piece === 'b') {
      const fromRank = '12345678'.indexOf(move.from[1]);
      const toRank = '12345678'.indexOf(move.to[1]);
      
      // 初期位置から動いている場合
      if (move.color === 'w') {
        if (fromRank === 0 && toRank > 0) return true;
      } else {
        if (fromRank === 7 && toRank < 7) return true;
      }
    }
    
    // 中央ポーンの展開
    if (move.piece === 'p' && moveCount <= 5) {
      if (['d', 'e'].includes(move.from[0]) && ['d', 'e'].includes(move.to[0])) {
        return true;
      }
    }
    
    return false;
  }

  getAttackedSquares(move, chessInstance) {
    const attacks = [];
    
    try {
      // 移動先から攻撃できるマスを簡易的に計算
      const to = move.to;
      if (!to) return attacks;
      
      // 駒のタイプに基づいて攻撃パターンを定義
      const piece = move.piece;
      if (piece === 'p') {
        // ポーンの斜め攻撃
        const direction = move.color === 'w' ? 1 : -1;
        const file = to.charCodeAt(0) - 97;
        const rank = parseInt(to[1]);
        
        if (file > 0) attacks.push(String.fromCharCode(96 + file) + (rank + direction));
        if (file < 7) attacks.push(String.fromCharCode(98 + file) + (rank + direction));
      }
      // 他の駒の攻撃パターンは後で追加可能
      
    } catch (e) {
      console.warn('Error in getAttackedSquares:', e);
    }
    
    return attacks;
  }

  getDefendedPieces(move, chessInstance) {
    // 簡易的な実装
    return [];
  }

  identifyTacticalMotifs(move, chessInstance) {
    const patterns = [];
    
    // フォークの検出（簡易版）
    const attacks = this.getAttackedSquares(move, chessInstance);
    if (attacks.length >= 2) {
      patterns.push({ type: 'fork', targets: attacks });
    }
    
    return patterns;
  }

  calculateMaterial() {
    let white = 0, black = 0;
    const board = this.chess.board();
    
    const pieceValues = {
      'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0
    };
    
    board.forEach(row => {
      row.forEach(square => {
        if (square) {
          const value = pieceValues[square.type];
          if (square.color === 'w') white += value;
          else black += value;
        }
      });
    });
    
    return { white, black, difference: white - black };
  }

  getKingPositions() {
    const positions = { white: null, black: null };
    const board = this.chess.board();
    
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const square = board[i][j];
        if (square && square.type === 'k') {
          const file = String.fromCharCode(97 + j);
          const rank = 8 - i;
          const position = file + rank;
          
          if (square.color === 'w') positions.white = position;
          else positions.black = position;
        }
      }
    }
    
    return positions;
  }

  analyzePawnStructure() {
    // 簡易実装
    return {
      isolatedPawns: [],
      doubledPawns: [],
      passedPawns: []
    };
  }

  analyzePieceActivity() {
    // 簡易実装
    return {
      activePieces: [],
      inactivePieces: []
    };
  }

  identifyThreats() {
    // 簡易実装
    return [];
  }

  getGameStage() {
    const moveCount = this.chess.moveNumber();
    const material = this.calculateMaterial();
    const totalMaterial = material.white + material.black;
    
    if (moveCount < 10) return 'opening';
    if (totalMaterial < 30) return 'endgame';
    return 'middlegame';
  }

  getPieceValue(piece) {
    const values = {
      'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0
    };
    return values[piece] || 0;
  }

  getPieceFromSan(san) {
    if (!san) return '駒';
    
    // キャスリング
    if (san === 'O-O' || san === 'O-O-O') return 'キング';
    
    // 最初の文字から駒を判定
    const firstChar = san[0];
    switch(firstChar) {
      case 'N': return 'ナイト';
      case 'B': return 'ビショップ';
      case 'R': return 'ルーク';
      case 'Q': return 'クイーン';
      case 'K': return 'キング';
      default: return 'ポーン'; // 小文字で始まる場合はポーン
    }
  }
  
  // 指し手を日本語表記に変換
  convertMoveToJapanese(moveStr) {
    if (!moveStr || moveStr.length < 4) return moveStr;
    
    const from = moveStr.substring(0, 2);
    const to = moveStr.substring(2, 4);
    
    const files = { 'a': 'a', 'b': 'b', 'c': 'c', 'd': 'd', 'e': 'e', 'f': 'f', 'g': 'g', 'h': 'h' };
    const fromFile = files[from[0]] || from[0];
    const toFile = files[to[0]] || to[0];
    
    return `${fromFile}${from[1]}-${toFile}${to[1]}`;
  }
  
  // なぜ最善手でないかを説明
  explainWhyNotBest(playedMove, bestMove, context, stockfishData) {
    const explanations = [];
    
    // 最善手の分析
    if (bestMove && bestMove.length >= 4) {
      const bestFrom = bestMove.substring(0, 2);
      const bestTo = bestMove.substring(2, 4);
      
      // 駒取りを見逃している場合
      if (context.threatens && context.threatens.length > 0) {
        const undefendedPieces = context.threatens.filter(t => t.value >= 3);
        if (undefendedPieces.length > 0 && !context.captures) {
          explanations.push(`相手の${undefendedPieces[0].piece}を取るチャンスを逃しています。`);
        }
      }
      
      // チェックを見逃している場合
      if (!context.checks && bestMove.includes('+')) {
        explanations.push('チェックをかけるチャンスを見逃しています。');
      }
      
      // フォークの機会を逃している場合
      if (!context.type.includes('fork') && context.attacks.length < 2) {
        explanations.push('複数の駒を同時に攻撃する戦術的な手がありました。');
      }
      
      // 防御が必要な場合
      if (stockfishData && stockfishData.evalChange < -1.5) {
        if (!context.type.includes('defensive') && !context.captures) {
          explanations.push('相手の脅威に対する防御が必要でした。');
        }
      }
      
      // ポジショナルな理由
      // 中央支配を逃している場合
      if (context.centralControl < 1 && bestTo && ['d4', 'd5', 'e4', 'e5'].includes(bestTo)) {
        explanations.push('中央を支配する機会を逃しています。');
      }
      
      // 駒の活動性が低い場合
      if (context.pieceActivity && context.pieceActivity.mobility < 5) {
        if (playedMove.piece === 'n' || playedMove.piece === 'b') {
          explanations.push('この駒の配置では活動性が制限されます。');
        }
      }
      
      // より良いアウトポストがある場合
      if (playedMove.piece === 'n' && !context.outposts.length) {
        explanations.push('より強力な前進拠点を確保できる位置がありました。');
      }
    }
    
    // 具体的な説明がない場合のデフォルト
    if (explanations.length === 0) {
      if (stockfishData && stockfishData.evalChange < -2) {
        explanations.push('この手は戦術的または戦略的な欠陥があります。');
      } else {
        explanations.push('より効果的な手がありました。');
      }
    }
    
    return explanations.join(' ');
  }

  // チェックをかけている駒を取得
  getCheckingPieces(chessInstance) {
    const king = chessInstance.isCheck() ? this.findKing(chessInstance.turn() === 'w' ? 'b' : 'w') : null;
    if (!king) return [];
    
    const checkingPieces = [];
    // 簡略化のため、基本的な実装のみ
    return checkingPieces;
  }

  // 基本的な戦術パターンの検出
  detectBasicTactics(move, chessInstance, context, previousFen = null) {
    const movedPiece = move.piece;
    const to = move.to;
    
    // フォークの検出（ナイトフォークなど）
    if (movedPiece === 'n' || movedPiece === 'N') {
      const attackedSquares = this.getKnightAttacks(to);
      const attackedPieces = [];
      
      attackedSquares.forEach(square => {
        const piece = this.chess.get(square);
        if (piece && piece.color !== move.color) {
          attackedPieces.push({
            type: piece.type,
            square: square,
            value: this.getPieceValue(piece.type)
          });
        }
      });
      
      // 2つ以上の駒を同時に攻撃している場合はフォーク
      if (attackedPieces.length >= 2) {
        const valuablePieces = attackedPieces.filter(p => p.value >= 3);
        if (valuablePieces.length >= 2 || 
            (valuablePieces.length === 1 && attackedPieces.some(p => p.type === 'k'))) {
          context.forks.push({
            attacker: PIECE_NAMES[movedPiece],
            targets: attackedPieces.map(p => ({
              piece: PIECE_NAMES[p.type],
              square: p.square
            }))
          });
          context.type.push('fork');
        }
      }
    }
    
    // 駒取りの脅威
    if (context.attacks.length > 0) {
      const threatenedPieces = [];
      context.attacks.forEach(square => {
        const piece = this.chess.get(square);
        if (piece && piece.color !== move.color) {
          threatenedPieces.push({
            piece: PIECE_NAMES[piece.type],
            square: square,
            value: this.getPieceValue(piece.type)
          });
        }
      });
      
      if (threatenedPieces.length > 0) {
        context.threatens = threatenedPieces;
        // 価値の高い駒を脅かしている場合
        if (threatenedPieces.some(t => t.value >= 5)) {
          context.type.push('major_threat');
        }
      }
    }
    
    // Level 3: 串刺しの検出
    const skewerResult = this.detectSkewer(move, chessInstance, context);
    if (skewerResult) {
      context.skewers.push(skewerResult);
      context.type.push(MOVE_TYPES.SKEWER);
      context.tactical.push({ type: MOVE_TYPES.SKEWER, ...skewerResult });
    }
    
    // Level 3: 開き攻撃の検出
    const discoveredAttackResult = this.detectDiscoveredAttack(move, chessInstance, previousFen);
    if (discoveredAttackResult) {
      context.type.push(MOVE_TYPES.DISCOVERED_ATTACK);
      context.tactical.push({ type: MOVE_TYPES.DISCOVERED_ATTACK, ...discoveredAttackResult });
      
      // 開きチェックの場合は特別扱い
      if (discoveredAttackResult.isCheck) {
        context.discoveredCheck = true;
      }
    }
    
    // Level 3: 除去/偏向戦術の検出
    const removalResult = this.detectRemovalTactics(move, chessInstance, previousFen);
    if (removalResult) {
      if (removalResult.type === 'removal') {
        context.type.push(MOVE_TYPES.REMOVAL);
      } else if (removalResult.type === 'deflection') {
        context.type.push(MOVE_TYPES.DEFLECTION);
      }
      context.tactical.push({ type: removalResult.type, ...removalResult });
    }
  }

  /**
   * 串刺し（Skewer）を検出
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {MoveContext} context - コンテキスト
   * @returns {Object|null} 串刺し情報
   */
  detectSkewer(move, chessInstance, context) {
    try {
      const piece = move.piece;
      const to = move.to;
      
      // 串刺しができるのはビショップ、ルーク、クイーンのみ
      if (!piece || !['b', 'r', 'q'].includes(piece.toLowerCase())) {
        return null;
      }
      
      // 移動先から各方向をチェック
      const directions = this.getLineDirections(piece);
      
      for (const direction of directions) {
        const skewer = this.checkSkewerInDirection(
          chessInstance,
          to,
          direction,
          move.color
        );
        
        if (skewer) {
          return {
            attacker: PIECE_NAMES[piece],
            attackerSquare: to,
            frontPiece: skewer.frontPiece,
            backPiece: skewer.backPiece,
            direction: direction.name
          };
        }
      }
      
      return null;
      
    } catch (error) {
      ChessErrorHandler.logError(
        new ChessAnalysisError(
          'Error detecting skewer',
          ERROR_CODES.ANALYSIS_FAILED,
          { error: error.message, move }
        ),
        'warn'
      );
      return null;
    }
  }

  /**
   * 特定の方向で串刺しをチェック
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} fromSquare - 開始マス
   * @param {Object} direction - 方向情報
   * @param {string} attackerColor - 攻撃側の色
   * @returns {Object|null} 串刺し情報
   */
  checkSkewerInDirection(chessInstance, fromSquare, direction, attackerColor) {
    const pieces = [];
    let currentSquare = fromSquare;
    
    // 方向に沿って駒を探す
    while (true) {
      currentSquare = this.getNextSquareInDirection(currentSquare, direction);
      if (!currentSquare) break;
      
      const piece = chessInstance.get(currentSquare);
      if (piece) {
        if (piece.color !== attackerColor) {
          pieces.push({
            piece: piece,
            square: currentSquare,
            value: this.getPieceValue(piece.type),
            pieceName: PIECE_NAMES[piece.type]
          });
        } else {
          // 味方の駒に当たったら終了
          break;
        }
      }
      
      // 2つの敵駒を見つけたら終了
      if (pieces.length >= 2) break;
    }
    
    // 串刺しの条件：
    // 1. 正確に2つの敵駒がライン上にある
    // 2. 前の駒の価値が後ろの駒より高い（または両方が重要な駒）
    if (pieces.length === 2) {
      const [front, back] = pieces;
      
      // 典型的な串刺し：キング/クイーンが前にいる
      if (front.piece.type === 'k' || 
          (front.piece.type === 'q' && back.value >= 3) ||
          (front.value > back.value && front.value >= 5)) {
        return {
          frontPiece: {
            type: front.pieceName,
            square: front.square,
            value: front.value
          },
          backPiece: {
            type: back.pieceName,
            square: back.square,
            value: back.value
          }
        };
      }
    }
    
    return null;
  }

  /**
   * 駒のタイプに応じた直線方向を取得
   * @param {string} piece - 駒のタイプ
   * @returns {Array} 方向の配列
   */
  getLineDirections(piece) {
    const diagonals = [
      { name: 'northeast', file: 1, rank: 1 },
      { name: 'southeast', file: 1, rank: -1 },
      { name: 'southwest', file: -1, rank: -1 },
      { name: 'northwest', file: -1, rank: 1 }
    ];
    
    const straights = [
      { name: 'north', file: 0, rank: 1 },
      { name: 'east', file: 1, rank: 0 },
      { name: 'south', file: 0, rank: -1 },
      { name: 'west', file: -1, rank: 0 }
    ];
    
    switch (piece.toLowerCase()) {
      case 'b':
        return diagonals;
      case 'r':
        return straights;
      case 'q':
        return [...diagonals, ...straights];
      default:
        return [];
    }
  }

  /**
   * 次のマスを方向に沿って取得
   * @param {string} square - 現在のマス
   * @param {Object} direction - 方向
   * @returns {string|null} 次のマス
   */
  getNextSquareInDirection(square, direction) {
    const files = 'abcdefgh';
    const ranks = '12345678';
    
    const fileIndex = files.indexOf(square[0]);
    const rankIndex = ranks.indexOf(square[1]);
    
    const newFileIndex = fileIndex + direction.file;
    const newRankIndex = rankIndex + direction.rank;
    
    if (newFileIndex >= 0 && newFileIndex < 8 && 
        newRankIndex >= 0 && newRankIndex < 8) {
      return files[newFileIndex] + ranks[newRankIndex];
    }
    
    return null;
  }

  /**
   * 開き攻撃（Discovered Attack）を検出
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - 移動後のチェスインスタンス
   * @param {string|null} previousFen - 移動前のFEN
   * @returns {Object|null} 開き攻撃情報
   */
  detectDiscoveredAttack(move, chessInstance, previousFen) {
    try {
      if (!previousFen) return null;
      
      // 移動前の局面を作成
      const previousChess = new Chess(previousFen);
      const from = move.from;
      const to = move.to;
      
      // 移動した駒の元の位置から、背後の駒を探す
      const discoveredAttacks = [];
      
      // すべての味方の長距離駒（ビショップ、ルーク、クイーン）をチェック
      const board = previousChess.board();
      for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
          const piece = board[rank][file];
          if (!piece || piece.color !== move.color) continue;
          
          // 長距離駒のみチェック
          if (!['b', 'r', 'q'].includes(piece.type)) continue;
          
          const pieceSquare = 'abcdefgh'[file] + '12345678'[rank];
          
          // この駒から移動した駒の元の位置への方向を確認
          const direction = this.getDirectionBetweenSquares(pieceSquare, from);
          if (!direction) continue;
          
          // 移動前：この駒からfromまでの間に障害物がないか確認
          if (!this.isPathClear(previousChess, pieceSquare, from, direction)) continue;
          
          // fromの向こう側に敵駒があるか確認
          const targets = this.getTargetsInDirection(previousChess, from, direction, move.color);
          
          if (targets.length > 0) {
            // 移動後：この駒から標的への道が開いているか確認
            const stillBlocked = this.isAnyTargetStillBlocked(
              chessInstance, 
              pieceSquare, 
              targets, 
              direction,
              to
            );
            
            if (!stillBlocked) {
              discoveredAttacks.push({
                attacker: PIECE_NAMES[piece.type],
                attackerSquare: pieceSquare,
                movedPiece: PIECE_NAMES[move.piece],
                targets: targets.map(t => ({
                  piece: PIECE_NAMES[t.type],
                  square: t.square,
                  value: this.getPieceValue(t.type)
                }))
              });
            }
          }
        }
      }
      
      if (discoveredAttacks.length === 0) return null;
      
      // 最も価値の高い攻撃を選択
      const bestAttack = discoveredAttacks.reduce((best, current) => {
        const currentValue = Math.max(...current.targets.map(t => t.value));
        const bestValue = Math.max(...best.targets.map(t => t.value));
        return currentValue > bestValue ? current : best;
      });
      
      // キングへの攻撃があるかチェック
      const isCheck = bestAttack.targets.some(t => t.piece === 'キング');
      
      return {
        ...bestAttack,
        isCheck
      };
      
    } catch (error) {
      ChessErrorHandler.logError(
        new ChessAnalysisError(
          'Error detecting discovered attack',
          ERROR_CODES.ANALYSIS_FAILED,
          { error: error.message, move }
        ),
        'warn'
      );
      return null;
    }
  }

  /**
   * 2つのマス間の方向を取得
   * @param {string} from - 開始マス
   * @param {string} to - 終了マス
   * @returns {Object|null} 方向情報
   */
  getDirectionBetweenSquares(from, to) {
    const files = 'abcdefgh';
    const ranks = '12345678';
    
    const fromFile = files.indexOf(from[0]);
    const fromRank = ranks.indexOf(from[1]);
    const toFile = files.indexOf(to[0]);
    const toRank = ranks.indexOf(to[1]);
    
    const fileDiff = toFile - fromFile;
    const rankDiff = toRank - fromRank;
    
    // 同じマス
    if (fileDiff === 0 && rankDiff === 0) return null;
    
    // 直線上にない
    if (fileDiff !== 0 && rankDiff !== 0 && 
        Math.abs(fileDiff) !== Math.abs(rankDiff)) return null;
    
    // 方向を正規化
    const fileDir = fileDiff === 0 ? 0 : fileDiff / Math.abs(fileDiff);
    const rankDir = rankDiff === 0 ? 0 : rankDiff / Math.abs(rankDiff);
    
    return { file: fileDir, rank: rankDir };
  }

  /**
   * パスがクリアかチェック
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} from - 開始マス
   * @param {string} to - 終了マス（含まない）
   * @param {Object} direction - 方向
   * @returns {boolean} パスがクリアか
   */
  isPathClear(chessInstance, from, to, direction) {
    let current = from;
    
    while (true) {
      current = this.getNextSquareInDirection(current, direction);
      if (!current || current === to) break;
      
      if (chessInstance.get(current)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 特定方向の標的を取得
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} from - 開始マス
   * @param {Object} direction - 方向
   * @param {string} attackerColor - 攻撃側の色
   * @returns {Array} 標的のリスト
   */
  getTargetsInDirection(chessInstance, from, direction, attackerColor) {
    const targets = [];
    let current = from;
    
    while (true) {
      current = this.getNextSquareInDirection(current, direction);
      if (!current) break;
      
      const piece = chessInstance.get(current);
      if (piece) {
        if (piece.color !== attackerColor) {
          targets.push({
            type: piece.type,
            square: current,
            color: piece.color
          });
        }
        break; // 最初の駒で停止
      }
    }
    
    return targets;
  }

  /**
   * 移動後も標的がブロックされているかチェック
   * @param {Chess} chessInstance - 移動後のチェスインスタンス
   * @param {string} attackerSquare - 攻撃駒の位置
   * @param {Array} targets - 標的リスト
   * @param {Object} direction - 方向
   * @param {string} movedTo - 移動先
   * @returns {boolean} まだブロックされているか
   */
  isAnyTargetStillBlocked(chessInstance, attackerSquare, targets, direction, movedTo) {
    // 攻撃駒から最初の標的までの間に駒があるかチェック
    let current = attackerSquare;
    const targetSquare = targets[0].square;
    
    while (true) {
      current = this.getNextSquareInDirection(current, direction);
      if (!current || current === targetSquare) break;
      
      // 移動先の駒は無視（開き攻撃を作る駒自体が邪魔になることがある）
      if (current === movedTo) continue;
      
      if (chessInstance.get(current)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 除去/偏向戦術を検出
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - 移動後のチェスインスタンス
   * @param {string|null} previousFen - 移動前のFEN
   * @returns {Object|null} 除去/偏向情報
   */
  detectRemovalTactics(move, chessInstance, previousFen) {
    try {
      if (!previousFen || !move.captured) return null;
      
      // 移動前の局面を作成
      const previousChess = new Chess(previousFen);
      
      // 取られた駒が何を守っていたかを分析
      const capturedSquare = move.to;
      const capturedPiece = move.captured;
      
      // 取られた駒が守っていた重要な駒やマスを見つける
      const defendedTargets = this.findDefendedTargets(
        previousChess,
        capturedSquare,
        capturedPiece,
        move.color === 'w' ? 'b' : 'w'
      );
      
      if (defendedTargets.length === 0) return null;
      
      // 最も重要な標的を選択
      const primaryTarget = defendedTargets.reduce((best, current) => {
        return current.value > best.value ? current : best;
      });
      
      // 除去の結果、新たな脅威が生まれるかチェック
      const newThreats = this.checkNewThreatsAfterRemoval(
        chessInstance,
        primaryTarget,
        move.color
      );
      
      if (newThreats.length > 0) {
        // 除去戦術として分類
        return {
          type: 'removal',
          removedPiece: {
            type: PIECE_NAMES[capturedPiece],
            square: capturedSquare
          },
          undefendedTarget: primaryTarget,
          newThreats: newThreats,
          explanation: this.generateRemovalExplanation(
            PIECE_NAMES[capturedPiece],
            primaryTarget,
            newThreats
          )
        };
      }
      
      // 偏向戦術かチェック（駒が他の場所に誘導される）
      const deflectionTarget = this.checkDeflectionOpportunity(
        previousChess,
        chessInstance,
        move
      );
      
      if (deflectionTarget) {
        return {
          type: 'deflection',
          deflectedPiece: deflectionTarget.piece,
          originalDuty: deflectionTarget.duty,
          newTarget: deflectionTarget.newTarget,
          explanation: this.generateDeflectionExplanation(
            deflectionTarget.piece,
            deflectionTarget.duty,
            deflectionTarget.newTarget
          )
        };
      }
      
      return null;
      
    } catch (error) {
      ChessErrorHandler.logError(
        new ChessAnalysisError(
          'Error detecting removal/deflection tactics',
          ERROR_CODES.ANALYSIS_FAILED,
          { error: error.message, move }
        ),
        'warn'
      );
      return null;
    }
  }

  /**
   * 駒が守っていた標的を見つける
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} defenderSquare - 守り駒の位置
   * @param {string} defenderType - 守り駒のタイプ
   * @param {string} defenderColor - 守り駒の色
   * @returns {Array} 守られていた標的のリスト
   */
  findDefendedTargets(chessInstance, defenderSquare, defenderType, defenderColor) {
    const targets = [];
    
    // 守り駒が攻撃していたマスを取得
    const attackedSquares = this.getSquaresAttackedByPiece(
      chessInstance,
      defenderSquare,
      defenderType,
      defenderColor
    );
    
    // 各マスに味方の駒があるかチェック
    attackedSquares.forEach(square => {
      const piece = chessInstance.get(square);
      if (piece && piece.color === defenderColor) {
        // この駒が他の敵駒に攻撃されているかチェック
        const attackers = this.getAttackersOfSquare(
          chessInstance,
          square,
          defenderColor === 'w' ? 'b' : 'w'
        );
        
        if (attackers.length > 0) {
          targets.push({
            square: square,
            piece: piece,
            pieceName: PIECE_NAMES[piece.type],
            value: this.getPieceValue(piece.type),
            attackers: attackers
          });
        }
      }
    });
    
    return targets;
  }

  /**
   * 駒が攻撃しているマスを取得
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} square - 駒の位置
   * @param {string} pieceType - 駒のタイプ
   * @param {string} pieceColor - 駒の色
   * @returns {Array} 攻撃しているマスのリスト
   */
  getSquaresAttackedByPiece(chessInstance, square, pieceType, pieceColor) {
    const attacks = [];
    
    // 駒のタイプに応じて攻撃パターンを取得
    switch (pieceType.toLowerCase()) {
      case 'p':
        attacks.push(...this.getPawnAttacks(square, pieceColor));
        break;
      case 'n':
        attacks.push(...this.getKnightAttacks(square));
        break;
      case 'b':
        attacks.push(...this.getBishopAttacks(chessInstance, square));
        break;
      case 'r':
        attacks.push(...this.getRookAttacks(chessInstance, square));
        break;
      case 'q':
        attacks.push(...this.getQueenAttacks(chessInstance, square));
        break;
      case 'k':
        attacks.push(...this.getKingAttacks(square));
        break;
    }
    
    // 有効なマスのみ返す
    return attacks.filter(s => this.isValidSquare(s));
  }

  /**
   * 特定のマスを攻撃している駒を取得
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} targetSquare - 標的のマス
   * @param {string} attackerColor - 攻撃側の色
   * @returns {Array} 攻撃している駒のリスト
   */
  getAttackersOfSquare(chessInstance, targetSquare, attackerColor) {
    const attackers = [];
    const board = chessInstance.board();
    
    // 全ての敵駒をチェック
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.color === attackerColor) {
          const pieceSquare = 'abcdefgh'[file] + '12345678'[rank];
          const attacks = this.getSquaresAttackedByPiece(
            chessInstance,
            pieceSquare,
            piece.type,
            piece.color
          );
          
          if (attacks.includes(targetSquare)) {
            attackers.push({
              square: pieceSquare,
              type: piece.type,
              pieceName: PIECE_NAMES[piece.type]
            });
          }
        }
      }
    }
    
    return attackers;
  }

  /**
   * 除去後の新たな脅威をチェック
   * @param {Chess} chessInstance - 移動後のチェスインスタンス
   * @param {Object} undefendedTarget - 守られなくなった標的
   * @param {string} attackerColor - 攻撃側の色
   * @returns {Array} 新たな脅威のリスト
   */
  checkNewThreatsAfterRemoval(chessInstance, undefendedTarget, attackerColor) {
    const threats = [];
    
    // 標的に対する攻撃者を再確認
    const attackers = this.getAttackersOfSquare(
      chessInstance,
      undefendedTarget.square,
      attackerColor
    );
    
    attackers.forEach(attacker => {
      threats.push({
        attacker: attacker,
        target: undefendedTarget,
        threatType: undefendedTarget.value >= 5 ? 'major' : 'minor'
      });
    });
    
    return threats;
  }

  /**
   * 偏向の機会をチェック
   * @param {Chess} previousChess - 移動前のチェスインスタンス
   * @param {Chess} currentChess - 移動後のチェスインスタンス
   * @param {MoveObject} move - 手
   * @returns {Object|null} 偏向情報
   */
  checkDeflectionOpportunity(previousChess, currentChess, move) {
    // 簡略化された実装
    // 実際にはもっと複雑な分析が必要
    return null;
  }

  /**
   * 除去戦術の説明を生成
   * @param {string} removedPiece - 除去された駒
   * @param {Object} undefendedTarget - 守られなくなった標的
   * @param {Array} newThreats - 新たな脅威
   * @returns {string} 説明
   */
  generateRemovalExplanation(removedPiece, undefendedTarget, newThreats) {
    let explanation = `${removedPiece}を取ることで、`;
    
    if (undefendedTarget.pieceName === 'キング') {
      explanation += 'キングへの攻撃ラインが開きます！';
    } else {
      explanation += `${undefendedTarget.square}の${undefendedTarget.pieceName}の守りがなくなり、`;
      
      if (newThreats.length > 0) {
        explanation += '次の手で取ることができます。';
      } else {
        explanation += '弱体化させます。';
      }
    }
    
    return explanation;
  }

  /**
   * 偏向戦術の説明を生成
   * @param {Object} deflectedPiece - 偏向された駒
   * @param {string} originalDuty - 元の役割
   * @param {string} newTarget - 新しい標的
   * @returns {string} 説明
   */
  generateDeflectionExplanation(deflectedPiece, originalDuty, newTarget) {
    return `${deflectedPiece.pieceName}を${originalDuty}から引き離し、${newTarget}を狙います。`;
  }

  /**
   * マスが有効かチェック
   * @param {string} square - マス
   * @returns {boolean} 有効か
   */
  isValidSquare(square) {
    if (!square || square.length !== 2) return false;
    const file = square[0];
    const rank = square[1];
    return 'abcdefgh'.includes(file) && '12345678'.includes(rank);
  }

  /**
   * ポーンの攻撃マスを取得
   * @param {string} square - ポーンの位置
   * @param {string} color - ポーンの色
   * @returns {Array} 攻撃マスのリスト
   */
  getPawnAttacks(square, color) {
    const attacks = [];
    const file = 'abcdefgh'.indexOf(square[0]);
    const rank = '12345678'.indexOf(square[1]);
    const direction = color === 'w' ? 1 : -1;
    
    // 斜め前の2マス
    if (file > 0) {
      attacks.push('abcdefgh'[file - 1] + '12345678'[rank + direction]);
    }
    if (file < 7) {
      attacks.push('abcdefgh'[file + 1] + '12345678'[rank + direction]);
    }
    
    return attacks;
  }

  /**
   * ビショップの攻撃マスを取得
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} square - ビショップの位置
   * @returns {Array} 攻撃マスのリスト
   */
  getBishopAttacks(chessInstance, square) {
    const attacks = [];
    const directions = [
      { file: 1, rank: 1 },
      { file: 1, rank: -1 },
      { file: -1, rank: -1 },
      { file: -1, rank: 1 }
    ];
    
    directions.forEach(dir => {
      let current = square;
      while (true) {
        current = this.getNextSquareInDirection(current, dir);
        if (!current) break;
        
        attacks.push(current);
        
        // 駒があったら停止
        if (chessInstance.get(current)) break;
      }
    });
    
    return attacks;
  }

  /**
   * ルークの攻撃マスを取得
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} square - ルークの位置
   * @returns {Array} 攻撃マスのリスト
   */
  getRookAttacks(chessInstance, square) {
    const attacks = [];
    const directions = [
      { file: 0, rank: 1 },
      { file: 1, rank: 0 },
      { file: 0, rank: -1 },
      { file: -1, rank: 0 }
    ];
    
    directions.forEach(dir => {
      let current = square;
      while (true) {
        current = this.getNextSquareInDirection(current, dir);
        if (!current) break;
        
        attacks.push(current);
        
        // 駒があったら停止
        if (chessInstance.get(current)) break;
      }
    });
    
    return attacks;
  }

  /**
   * クイーンの攻撃マスを取得
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} square - クイーンの位置
   * @returns {Array} 攻撃マスのリスト
   */
  getQueenAttacks(chessInstance, square) {
    return [
      ...this.getBishopAttacks(chessInstance, square),
      ...this.getRookAttacks(chessInstance, square)
    ];
  }

  /**
   * キングの攻撃マスを取得
   * @param {string} square - キングの位置
   * @returns {Array} 攻撃マスのリスト
   */
  getKingAttacks(square) {
    const attacks = [];
    const file = 'abcdefgh'.indexOf(square[0]);
    const rank = '12345678'.indexOf(square[1]);
    
    const kingMoves = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    
    kingMoves.forEach(([df, dr]) => {
      const newFile = file + df;
      const newRank = rank + dr;
      
      if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
        attacks.push('abcdefgh'[newFile] + '12345678'[newRank]);
      }
    });
    
    return attacks;
  }

  /**
   * 戦略的プランを分析
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string|null} previousFen - 前の局面のFEN
   * @param {MoveContext} context - コンテキスト
   * @returns {Array} 戦略的プランのリスト
   */
  analyzeStrategicPlans(move, chessInstance, previousFen, context) {
    const plans = [];
    
    try {
      // 攻撃プランの分析
      const attackPlan = this.analyzeAttackPlan(move, chessInstance, context);
      if (attackPlan) {
        plans.push(attackPlan);
      }
      
      // ポジション改善プランの分析
      const positionalPlan = this.analyzePositionalPlan(move, chessInstance, context);
      if (positionalPlan) {
        plans.push(positionalPlan);
      }
      
      // エンドゲーム移行プランの分析
      const endgamePlan = this.analyzeEndgamePlan(move, chessInstance, context);
      if (endgamePlan) {
        plans.push(endgamePlan);
      }
      
    } catch (error) {
      ChessErrorHandler.logError(
        new ChessAnalysisError(
          'Error analyzing strategic plans',
          ERROR_CODES.ANALYSIS_FAILED,
          { error: error.message, move }
        ),
        'warn'
      );
    }
    
    return plans;
  }

  /**
   * 攻撃プランを分析
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {MoveContext} context - コンテキスト
   * @returns {Object|null} 攻撃プラン
   */
  analyzeAttackPlan(move, chessInstance, context) {
    // 敵キングの位置を取得
    const enemyKingPosition = this.findKingPosition(chessInstance, move.color === 'w' ? 'b' : 'w');
    if (!enemyKingPosition) return null;
    
    // キングサイドかクイーンサイドか判定
    const targetSide = 'abcd'.includes(enemyKingPosition[0]) ? 'queenside' : 'kingside';
    
    // 攻撃に参加している駒を分析
    const attackingPieces = this.getAttackingPiecesNearKing(
      chessInstance,
      enemyKingPosition,
      move.color,
      targetSide
    );
    
    // 現在の手が攻撃に貢献しているか
    const moveContributesToAttack = this.checkMoveContributesToAttack(
      move,
      enemyKingPosition,
      targetSide,
      context
    );
    
    if (!moveContributesToAttack) return null;
    
    // 攻撃の強度を評価
    const attackStrength = this.evaluateAttackStrength(
      attackingPieces,
      enemyKingPosition,
      chessInstance
    );
    
    if (attackStrength < 2) return null; // 弱い攻撃は無視
    
    return {
      type: 'attack',
      targetSide: targetSide,
      description: this.generateAttackPlanDescription(
        targetSide,
        attackingPieces,
        attackStrength,
        move
      ),
      strength: attackStrength,
      pieces: attackingPieces
    };
  }

  /**
   * ポジション改善プランを分析
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {MoveContext} context - コンテキスト
   * @returns {Object|null} ポジション改善プラン
   */
  analyzePositionalPlan(move, chessInstance, context) {
    const improvements = [];
    
    // 駒の配置改善
    if (context.outposts.length > 0) {
      improvements.push({
        type: 'outpost',
        description: `${move.to}に強力なアウトポストを確立`,
        value: 3
      });
    }
    
    // 悪いピースの交換準備
    if (move.piece === 'b' && context.pieceActivity.badBishop) {
      const canExchange = this.checkPieceExchangePossibility(
        chessInstance,
        move.to,
        move.piece,
        move.color
      );
      
      if (canExchange) {
        improvements.push({
          type: 'piece_exchange',
          description: '悪いビショップの交換を準備',
          value: 2
        });
      }
    }
    
    // 重要なマスのコントロール
    if (context.centralControl >= 3) {
      improvements.push({
        type: 'central_control',
        description: '中央の支配を強化',
        value: context.centralControl
      });
    }
    
    // ファイルのコントロール
    if (context.openFiles.length > 0 && (move.piece === 'r' || move.piece === 'q')) {
      improvements.push({
        type: 'file_control',
        description: `${context.openFiles[0].file}ファイルを支配`,
        value: 2
      });
    }
    
    if (improvements.length === 0) return null;
    
    // 最も重要な改善を選択
    const mainImprovement = improvements.reduce((best, current) => 
      current.value > best.value ? current : best
    );
    
    return {
      type: 'positional',
      improvement: mainImprovement.type,
      description: this.generatePositionalPlanDescription(mainImprovement, move),
      value: mainImprovement.value,
      details: improvements
    };
  }

  /**
   * エンドゲーム移行プランを分析
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {MoveContext} context - コンテキスト
   * @returns {Object|null} エンドゲームプラン
   */
  analyzeEndgamePlan(move, chessInstance, context) {
    const material = this.calculateMaterial();
    const totalMaterial = material.white + material.black;
    
    // すでにエンドゲームの場合はnull
    if (totalMaterial < 30) return null;
    
    // クイーン交換の提案や準備
    if (move.piece === 'q' || (move.captured && move.captured === 'q')) {
      const queenTrade = this.analyzeQueenTradeDesirability(
        chessInstance,
        material,
        move.color
      );
      
      if (queenTrade.desirable) {
        return {
          type: 'endgame',
          plan: 'queen_trade',
          description: this.generateEndgamePlanDescription('queen_trade', queenTrade.reason),
          desirability: queenTrade.score,
          reason: queenTrade.reason
        };
      }
    }
    
    // ピース簡略化の評価
    if (context.captures && material.difference !== 0) {
      const simplification = this.evaluateSimplification(
        chessInstance,
        material,
        move.color
      );
      
      if (simplification.beneficial) {
        return {
          type: 'endgame',
          plan: 'simplification',
          description: this.generateEndgamePlanDescription('simplification', simplification.reason),
          desirability: simplification.score,
          reason: simplification.reason
        };
      }
    }
    
    return null;
  }

  /**
   * キングの位置を見つける
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} color - キングの色
   * @returns {string|null} キングの位置
   */
  findKingPosition(chessInstance, color) {
    const board = chessInstance.board();
    
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'k' && piece.color === color) {
          return 'abcdefgh'[file] + '12345678'[rank];
        }
      }
    }
    
    return null;
  }

  /**
   * キング周辺の攻撃駒を取得
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} kingPosition - キングの位置
   * @param {string} attackerColor - 攻撃側の色
   * @param {string} targetSide - 攻撃対象サイド
   * @returns {Array} 攻撃駒のリスト
   */
  getAttackingPiecesNearKing(chessInstance, kingPosition, attackerColor, targetSide) {
    const attackingPieces = [];
    const board = chessInstance.board();
    
    // キングサイドまたはクイーンサイドの範囲を定義
    const relevantFiles = targetSide === 'kingside' ? 'efgh' : 'abcd';
    
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        const square = 'abcdefgh'[file] + '12345678'[rank];
        
        if (piece && piece.color === attackerColor && 
            relevantFiles.includes(square[0])) {
          // この駒がキング周辺を攻撃できるか
          const attacks = this.getSquaresAttackedByPiece(
            chessInstance,
            square,
            piece.type,
            piece.color
          );
          
          const attacksNearKing = attacks.filter(att => 
            this.getSquareDistance(att, kingPosition) <= 2
          );
          
          if (attacksNearKing.length > 0) {
            attackingPieces.push({
              type: piece.type,
              square: square,
              attacksNearKing: attacksNearKing.length
            });
          }
        }
      }
    }
    
    return attackingPieces;
  }

  /**
   * 手が攻撃に貢献しているかチェック
   * @param {MoveObject} move - 手
   * @param {string} enemyKingPosition - 敵キングの位置
   * @param {string} targetSide - 攻撃対象サイド
   * @param {MoveContext} context - コンテキスト
   * @returns {boolean} 貢献しているか
   */
  checkMoveContributesToAttack(move, enemyKingPosition, targetSide, context) {
    // 攻撃側に駒を移動
    const relevantFiles = targetSide === 'kingside' ? 'efgh' : 'abcd';
    if (relevantFiles.includes(move.to[0])) {
      return true;
    }
    
    // キング周辺への攻撃を増やす
    if (context.attacks.some(att => 
      this.getSquareDistance(att, enemyKingPosition) <= 2
    )) {
      return true;
    }
    
    // 攻撃ラインを開く
    if (context.type.includes(MOVE_TYPES.DISCOVERED_ATTACK)) {
      return true;
    }
    
    return false;
  }

  /**
   * 攻撃の強度を評価
   * @param {Array} attackingPieces - 攻撃駒
   * @param {string} kingPosition - キングの位置
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {number} 攻撃強度
   */
  evaluateAttackStrength(attackingPieces, kingPosition, chessInstance) {
    let strength = 0;
    
    // 攻撃駒の数
    strength += attackingPieces.length;
    
    // 重い駒の参加
    attackingPieces.forEach(piece => {
      if (piece.type === 'q') strength += 2;
      else if (piece.type === 'r') strength += 1;
    });
    
    // キングの安全性の弱さ
    const kingWeaknesses = this.evaluateKingSafety(chessInstance, kingPosition);
    strength += kingWeaknesses;
    
    return strength;
  }

  /**
   * 2つのマス間の距離を計算
   * @param {string} square1 - マス1
   * @param {string} square2 - マス2
   * @returns {number} 距離
   */
  getSquareDistance(square1, square2) {
    const file1 = 'abcdefgh'.indexOf(square1[0]);
    const rank1 = '12345678'.indexOf(square1[1]);
    const file2 = 'abcdefgh'.indexOf(square2[0]);
    const rank2 = '12345678'.indexOf(square2[1]);
    
    return Math.max(Math.abs(file2 - file1), Math.abs(rank2 - rank1));
  }

  /**
   * キングの安全性を評価
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} kingPosition - キングの位置
   * @returns {number} 弱点スコア
   */
  evaluateKingSafety(chessInstance, kingPosition) {
    let weaknesses = 0;
    const kingColor = chessInstance.get(kingPosition).color;
    
    // 周囲のポーンシールドをチェック
    const shieldSquares = this.getKingShieldSquares(kingPosition, kingColor);
    shieldSquares.forEach(square => {
      const piece = chessInstance.get(square);
      if (!piece || piece.type !== 'p' || piece.color !== kingColor) {
        weaknesses++;
      }
    });
    
    return weaknesses;
  }

  /**
   * キングシールドのマスを取得
   * @param {string} kingPosition - キングの位置
   * @param {string} color - キングの色
   * @returns {Array} シールドマスのリスト
   */
  getKingShieldSquares(kingPosition, color) {
    const shields = [];
    const file = 'abcdefgh'.indexOf(kingPosition[0]);
    const rank = '12345678'.indexOf(kingPosition[1]);
    const direction = color === 'w' ? 1 : -1;
    
    // 前方3マス
    for (let df = -1; df <= 1; df++) {
      const newFile = file + df;
      const newRank = rank + direction;
      
      if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
        shields.push('abcdefgh'[newFile] + '12345678'[newRank]);
      }
    }
    
    return shields;
  }

  /**
   * 駒交換の可能性をチェック
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {string} square - 駒の位置
   * @param {string} pieceType - 駒のタイプ
   * @param {string} color - 駒の色
   * @returns {boolean} 交換可能か
   */
  checkPieceExchangePossibility(chessInstance, square, pieceType, color) {
    // 簡略化された実装
    const attackers = this.getAttackersOfSquare(chessInstance, square, color === 'w' ? 'b' : 'w');
    return attackers.some(att => att.type === pieceType);
  }

  /**
   * クイーン交換の望ましさを分析
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {Object} material - マテリアル
   * @param {string} color - 手番の色
   * @returns {Object} 望ましさ情報
   */
  analyzeQueenTradeDesirability(chessInstance, material, color) {
    const materialAdvantage = color === 'w' ? 
      material.white - material.black : 
      material.black - material.white;
    
    // マテリアルで勝っている場合、クイーン交換は望ましい
    if (materialAdvantage > 2) {
      return {
        desirable: true,
        score: materialAdvantage,
        reason: 'material_advantage'
      };
    }
    
    // 王の安全性が低い場合、クイーン交換は望ましい
    const kingPosition = this.findKingPosition(chessInstance, color);
    const kingSafety = this.evaluateKingSafety(chessInstance, kingPosition);
    if (kingSafety > 2) {
      return {
        desirable: true,
        score: kingSafety,
        reason: 'king_safety'
      };
    }
    
    return { desirable: false };
  }

  /**
   * 簡略化の評価
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {Object} material - マテリアル
   * @param {string} color - 手番の色
   * @returns {Object} 簡略化情報
   */
  evaluateSimplification(chessInstance, material, color) {
    const materialAdvantage = color === 'w' ? 
      material.white - material.black : 
      material.black - material.white;
    
    // マテリアルで勝っている場合、簡略化は有益
    if (materialAdvantage >= 2) {
      return {
        beneficial: true,
        score: materialAdvantage,
        reason: 'convert_advantage'
      };
    }
    
    return { beneficial: false };
  }

  /**
   * 攻撃プランの説明を生成
   * @param {string} targetSide - 攻撃対象サイド
   * @param {Array} attackingPieces - 攻撃駒
   * @param {number} strength - 攻撃強度
   * @param {MoveObject} move - 手
   * @returns {string} 説明
   */
  generateAttackPlanDescription(targetSide, attackingPieces, strength, move) {
    const sideJp = targetSide === 'kingside' ? 'キングサイド' : 'クイーンサイド';
    const pieceJp = PIECE_NAMES[move.piece];
    
    if (strength >= 4) {
      return `${pieceJp}を${move.to}に配置し、${sideJp}への強力な攻撃を準備します。`;
    } else {
      return `${sideJp}に駒を集中させて、攻撃の圧力を高めます。`;
    }
  }

  /**
   * ポジション改善プランの説明を生成
   * @param {Object} improvement - 改善内容
   * @param {MoveObject} move - 手
   * @returns {string} 説明
   */
  generatePositionalPlanDescription(improvement, move) {
    const pieceJp = PIECE_NAMES[move.piece];
    
    switch (improvement.type) {
      case 'outpost':
        return `${pieceJp}を${move.to}の理想的なアウトポストに配置し、長期的な優位を築きます。`;
      case 'piece_exchange':
        return `活動性の低い${pieceJp}を交換する準備をし、ポジションを改善します。`;
      case 'central_control':
        return `中央の支配を強化し、駒の機動性を最大化します。`;
      case 'file_control':
        return `重要なファイルを支配し、相手陣への侵入経路を確保します。`;
      default:
        return improvement.description;
    }
  }

  /**
   * エンドゲームプランの説明を生成
   * @param {string} planType - プランタイプ
   * @param {string} reason - 理由
   * @returns {string} 説明
   */
  generateEndgamePlanDescription(planType, reason) {
    switch (planType) {
      case 'queen_trade':
        if (reason === 'material_advantage') {
          return 'マテリアルアドバンテージを活かすため、クイーン交換を目指します。';
        } else if (reason === 'king_safety') {
          return 'キングの安全性を高めるため、クイーン交換を提案します。';
        }
        break;
      case 'simplification':
        if (reason === 'convert_advantage') {
          return '優位を確実にするため、駒を交換して局面を簡略化します。';
        }
        break;
    }
    
    return '有利なエンドゲームへの移行を目指します。';
  }

  /**
   * 代替手との比較
   * @param {string} fen - 現在の局面のFEN
   * @param {MoveObject} playedMove - 実際に指された手
   * @param {Array<MoveObject|string>} alternativeMoves - 代替手のリスト
   * @param {MoveContext} playedMoveContext - 指された手のコンテキスト
   * @returns {Object} 比較結果
   */
  compareAlternativeMoves(fen, playedMove, alternativeMoves, playedMoveContext) {
    const comparison = {
      playedMove: playedMove,
      alternatives: [],
      betterAlternatives: [],
      similarAlternatives: [],
      worseAlternatives: [],
      comparisonSummary: '',
      whyChosen: ''
    };
    
    try {
      // 各代替手を分析
      alternativeMoves.forEach(altMove => {
        const altMoveObj = typeof altMove === 'string' ? this.parseMove(altMove) : altMove;
        
        // 代替手のコンテキストを取得
        const altContext = this.getMoveContext(altMoveObj, this.chess, null);
        
        // 戦略的プランを分析
        const altStrategicPlans = this.analyzeStrategicPlans(altMoveObj, this.chess, null, altContext);
        
        // 代替手を評価
        const evaluation = this.evaluateMove(altMoveObj, altContext, altStrategicPlans);
        
        // 指された手との比較
        const comparisonResult = this.compareMoves(
          playedMove,
          playedMoveContext,
          altMoveObj,
          altContext,
          evaluation
        );
        
        comparison.alternatives.push({
          move: altMoveObj,
          evaluation: evaluation,
          comparison: comparisonResult,
          explanation: this.generateAlternativeExplanation(altMoveObj, comparisonResult)
        });
        
        // カテゴリ分け
        if (comparisonResult.rating > 0) {
          comparison.betterAlternatives.push({
            move: altMoveObj,
            explanation: this.generateAlternativeExplanation(altMoveObj, comparisonResult)
          });
        } else if (comparisonResult.rating === 0) {
          comparison.similarAlternatives.push({
            move: altMoveObj,
            explanation: this.generateAlternativeExplanation(altMoveObj, comparisonResult)
          });
        } else {
          comparison.worseAlternatives.push({
            move: altMoveObj,
            explanation: this.generateAlternativeExplanation(altMoveObj, comparisonResult)
          });
        }
      });
      
      // 比較の要約を生成
      comparison.comparisonSummary = this.generateComparisonSummary(
        comparison.betterAlternatives,
        comparison.similarAlternatives,
        comparison.worseAlternatives
      );
      
      // なぜ指された手を選んだかの説明
      comparison.whyChosen = this.explainMoveChoice(
        playedMove,
        playedMoveContext,
        comparison.alternatives
      );
      
    } catch (error) {
      ChessErrorHandler.logError(
        new ChessAnalysisError(
          'Error comparing alternative moves',
          ERROR_CODES.ANALYSIS_FAILED,
          { error: error.message, move: playedMove }
        ),
        'warn'
      );
    }
    
    return comparison;
  }

  /**
   * 手を評価
   * @param {MoveObject} move - 手
   * @param {MoveContext} context - コンテキスト
   * @param {Array} strategicPlans - 戦略的プラン
   * @returns {Object} 評価結果
   */
  evaluateMove(move, context, strategicPlans) {
    const evaluation = {
      tacticalValue: 0,
      positionalValue: 0,
      strategicValue: 0,
      totalValue: 0,
      strengths: [],
      weaknesses: []
    };
    
    // 戦術的価値
    if (context.captures) {
      evaluation.tacticalValue += this.getPieceValue(move.captured);
    }
    if (context.checks) {
      evaluation.tacticalValue += 1;
    }
    if (context.forks.length > 0) {
      evaluation.tacticalValue += 2;
    }
    if (context.skewers.length > 0) {
      evaluation.tacticalValue += 3;
    }
    if (context.type.includes(MOVE_TYPES.REMOVAL)) {
      evaluation.tacticalValue += 2;
    }
    
    // ポジショナル価値
    if (context.centralControl > 0) {
      evaluation.positionalValue += context.centralControl;
    }
    if (context.outposts.length > 0) {
      evaluation.positionalValue += 2;
    }
    if (context.pieceActivity.improved) {
      evaluation.positionalValue += 1;
    }
    if (context.openFiles.length > 0) {
      evaluation.positionalValue += 1;
    }
    
    // 戦略的価値
    strategicPlans.forEach(plan => {
      if (plan.type === 'attack') {
        evaluation.strategicValue += plan.strength;
      } else if (plan.type === 'positional') {
        evaluation.strategicValue += plan.value;
      } else if (plan.type === 'endgame') {
        evaluation.strategicValue += plan.desirability;
      }
    });
    
    // 合計価値
    evaluation.totalValue = 
      evaluation.tacticalValue + 
      evaluation.positionalValue + 
      evaluation.strategicValue;
    
    // 強みと弱みを特定
    if (evaluation.tacticalValue > 2) {
      evaluation.strengths.push('tactical');
    }
    if (evaluation.positionalValue > 2) {
      evaluation.strengths.push('positional');
    }
    if (evaluation.strategicValue > 2) {
      evaluation.strengths.push('strategic');
    }
    
    // 弱みの検出（簡略化）
    if (context.weakSquares.length > 0) {
      evaluation.weaknesses.push('creates_weaknesses');
    }
    
    return evaluation;
  }

  /**
   * 2つの手を比較
   * @param {MoveObject} playedMove - 指された手
   * @param {MoveContext} playedContext - 指された手のコンテキスト
   * @param {MoveObject} altMove - 代替手
   * @param {MoveContext} altContext - 代替手のコンテキスト
   * @param {Object} altEvaluation - 代替手の評価
   * @returns {Object} 比較結果
   */
  compareMoves(playedMove, playedContext, altMove, altContext, altEvaluation) {
    const comparison = {
      rating: 0, // 正: 代替手の方が良い、0: 同等、負: 指された手の方が良い
      reasons: [],
      advantages: [],
      disadvantages: []
    };
    
    // 戦術的要素の比較
    if (altContext.checks && !playedContext.checks) {
      comparison.advantages.push('チェックで主導権を握れる');
      comparison.rating += 1;
    }
    
    if (altContext.captures && !playedContext.captures) {
      const captureValue = this.getPieceValue(altMove.captured);
      if (captureValue >= 3) {
        comparison.advantages.push(`${PIECE_NAMES[altMove.captured]}を取れる`);
        comparison.rating += 1;
      }
    }
    
    // 中央支配の比較
    const centralDiff = (altContext.centralControl || 0) - (playedContext.centralControl || 0);
    if (centralDiff > 1) {
      comparison.advantages.push('より強く中央を支配できる');
      comparison.rating += 1;
    } else if (centralDiff < -1) {
      comparison.disadvantages.push('中央支配が弱い');
      comparison.rating -= 1;
    }
    
    // アウトポストの比較
    if (altContext.outposts.length > playedContext.outposts.length) {
      comparison.advantages.push('より良いアウトポストを確保できる');
      comparison.rating += 1;
    }
    
    // 開発の比較
    if (altContext.develops && !playedContext.develops) {
      comparison.advantages.push('駒の展開を進められる');
      comparison.rating += 0.5;
    }
    
    // 総合的な理由を生成
    if (comparison.rating > 0) {
      comparison.reasons.push('より積極的で効果的な手');
    } else if (comparison.rating < 0) {
      comparison.reasons.push('指された手の方が優れている');
    } else {
      comparison.reasons.push('同程度の価値がある');
    }
    
    return comparison;
  }

  /**
   * 代替手の説明を生成
   * @param {MoveObject} altMove - 代替手
   * @param {Object} comparison - 比較結果
   * @returns {string} 説明
   */
  generateAlternativeExplanation(altMove, comparison) {
    const moveStr = altMove.san || `${altMove.from}-${altMove.to}`;
    let explanation = `${moveStr}も`;
    
    if (comparison.rating > 0) {
      explanation += '良い手で、';
      if (comparison.advantages.length > 0) {
        explanation += comparison.advantages.join('、');
      }
      explanation += 'という利点があります。';
    } else if (comparison.rating === 0) {
      explanation += '同様に有効な手です。';
    } else {
      explanation += '考えられますが、';
      if (comparison.disadvantages.length > 0) {
        explanation += comparison.disadvantages.join('、');
      } else {
        explanation += '指された手の方が優れています。';
      }
    }
    
    return explanation;
  }

  /**
   * 比較の要約を生成
   * @param {Array} betterAlternatives - より良い代替手
   * @param {Array} similarAlternatives - 同等の代替手
   * @param {Array} worseAlternatives - より悪い代替手
   * @returns {string} 要約
   */
  generateComparisonSummary(betterAlternatives, similarAlternatives, worseAlternatives) {
    if (betterAlternatives.length > 0) {
      const altNames = betterAlternatives.map(alt => 
        alt.move.san || `${alt.move.from}-${alt.move.to}`
      ).join('や');
      return `${altNames}という、より強力な選択肢もありました。`;
    } else if (similarAlternatives.length > 0) {
      const altNames = similarAlternatives.map(alt => 
        alt.move.san || `${alt.move.from}-${alt.move.to}`
      ).join('や');
      return `${altNames}も同様に良い手です。`;
    } else if (worseAlternatives.length > 0) {
      return '他の候補手と比較して、これは良い選択です。';
    }
    
    return '';
  }

  /**
   * なぜその手を選んだかを説明
   * @param {MoveObject} playedMove - 指された手
   * @param {MoveContext} playedContext - コンテキスト
   * @param {Array} alternatives - 代替手の分析結果
   * @returns {string} 説明
   */
  explainMoveChoice(playedMove, playedContext, alternatives) {
    // より良い代替手がある場合
    const betterAlts = alternatives.filter(alt => alt.comparison.rating > 0);
    if (betterAlts.length > 0) {
      // それでも指された手を選んだ理由を探る
      if (playedContext.type.includes(MOVE_TYPES.STRATEGIC_ATTACK)) {
        return '攻撃的なプランを優先した選択かもしれません。';
      } else if (playedContext.type.includes(MOVE_TYPES.STRATEGIC_POSITIONAL)) {
        return '長期的なポジション改善を重視した判断でしょう。';
      } else if (playedContext.develops) {
        return '駒の展開を優先した実戦的な選択です。';
      } else {
        return 'プレイヤーの独自の判断による選択です。';
      }
    }
    
    // 同等の代替手がある場合
    const similarAlts = alternatives.filter(alt => alt.comparison.rating === 0);
    if (similarAlts.length > 0) {
      return 'いくつかの同等に良い手から、スタイルに合った手を選択しました。';
    }
    
    // 指された手が最善の場合
    return 'この局面では最も自然で効果的な手です。';
  }

  /**
   * 長期的影響を分析
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {MoveContext} context - コンテキスト
   * @returns {Array} 長期的影響のリスト
   */
  analyzeLongTermConsequences(move, chessInstance, context) {
    const consequences = [];
    
    try {
      // ポーン構造への影響
      const pawnStructureImpact = this.analyzePawnStructureImpact(move, chessInstance, context);
      if (pawnStructureImpact) {
        consequences.push(pawnStructureImpact);
      }
      
      // キング安全性への影響
      const kingSafetyImpact = this.analyzeKingSafetyImpact(move, chessInstance, context);
      if (kingSafetyImpact) {
        consequences.push(kingSafetyImpact);
      }
      
      // 駒の活動性への長期的影響
      const pieceActivityImpact = this.analyzePieceActivityImpact(move, chessInstance, context);
      if (pieceActivityImpact) {
        consequences.push(pieceActivityImpact);
      }
      
      // エンドゲームへの影響
      const endgameImpact = this.analyzeEndgameImpact(move, chessInstance, context);
      if (endgameImpact) {
        consequences.push(endgameImpact);
      }
      
      // 戦略的弱点の創出
      const strategicWeaknesses = this.analyzeStrategicWeaknesses(move, chessInstance, context);
      if (strategicWeaknesses) {
        consequences.push(strategicWeaknesses);
      }
      
    } catch (error) {
      ChessErrorHandler.logError(
        new ChessAnalysisError(
          'Error analyzing long-term consequences',
          ERROR_CODES.ANALYSIS_FAILED,
          { error: error.message, move }
        ),
        'warn'
      );
    }
    
    return consequences;
  }

  /**
   * ポーン構造への影響を分析
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {MoveContext} context - コンテキスト
   * @returns {Object|null} ポーン構造への影響
   */
  analyzePawnStructureImpact(move, chessInstance, context) {
    if (move.piece !== 'p') return null;
    
    const impact = {
      type: 'pawn_structure',
      severity: 0,
      description: '',
      consequences: []
    };
    
    // ポーンの前進による弱点の創出
    const file = move.to[0];
    const rank = parseInt(move.to[1]);
    const isWhite = move.color === 'w';
    
    // 孤立ポーンの可能性
    if (this.willCreateIsolatedPawn(move, chessInstance)) {
      impact.severity = 2;
      impact.consequences.push('isolated_pawn');
      impact.description = `この${file}ファイルのポーン前進は、将来的に孤立ポーンを作る可能性があります。`;
      return impact;
    }
    
    // ダブルポーンの作成
    if (context.pawnStructure && context.pawnStructure.doubled.some(d => d.file === file)) {
      impact.severity = 1;
      impact.consequences.push('doubled_pawns');
      impact.description = `${file}ファイルにダブルポーンができ、ポーン構造が弱くなる可能性があります。`;
      return impact;
    }
    
    // 後方ポーンの作成
    if (this.willCreateBackwardPawn(move, chessInstance)) {
      impact.severity = 2;
      impact.consequences.push('backward_pawn');
      impact.description = 'このポーン前進により、隣接ポーンが後方ポーンになる危険があります。';
      return impact;
    }
    
    // ポーンチェーンの形成（ポジティブ）
    if (this.willFormPawnChain(move, chessInstance)) {
      impact.severity = -1; // ポジティブな影響
      impact.consequences.push('pawn_chain');
      impact.description = '強固なポーンチェーンを形成し、中央の支配を強化します。';
      return impact;
    }
    
    return null;
  }

  /**
   * キング安全性への影響を分析
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {MoveContext} context - コンテキスト
   * @returns {Object|null} キング安全性への影響
   */
  analyzeKingSafetyImpact(move, chessInstance, context) {
    const impact = {
      type: 'king_safety',
      severity: 0,
      description: '',
      consequences: []
    };
    
    // キング前のポーンを動かした場合
    if (move.piece === 'p') {
      const kingPosition = this.findKingPosition(chessInstance, move.color);
      if (!kingPosition) return null;
      
      // キングサイドのポーン前進
      if ('fgh'.includes(move.from[0]) && this.isNearKing(move.from, kingPosition)) {
        impact.severity = 2;
        impact.consequences.push('weakened_kingside');
        impact.description = 'このポーン前進は、将来的にキングサイドを弱体化させる可能性があります。';
        return impact;
      }
      
      // f7/f2ポーンの前進（特に危険）
      if ((move.from === 'f2' && move.color === 'w') || 
          (move.from === 'f7' && move.color === 'b')) {
        impact.severity = 3;
        impact.consequences.push('f_pawn_weakness');
        impact.description = 'f-ファイルのポーン前進は、キングの安全性を著しく損なう危険があります。';
        return impact;
      }
    }
    
    // キャスリング権の喪失につながる手
    if (this.willLoseCastlingRights(move, chessInstance)) {
      impact.severity = 2;
      impact.consequences.push('lost_castling');
      impact.description = 'この手により、将来的にキャスリングの権利を失う可能性があります。';
      return impact;
    }
    
    return null;
  }

  /**
   * 駒の活動性への長期的影響を分析
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {MoveContext} context - コンテキスト
   * @returns {Object|null} 駒の活動性への影響
   */
  analyzePieceActivityImpact(move, chessInstance, context) {
    const impact = {
      type: 'piece_activity',
      severity: 0,
      description: '',
      consequences: []
    };
    
    // ビショップを閉じ込める可能性
    if (move.piece === 'p' && this.willTrapBishop(move, chessInstance)) {
      impact.severity = 2;
      impact.consequences.push('trapped_bishop');
      impact.description = 'このポーン前進により、ビショップの活動性が制限される可能性があります。';
      return impact;
    }
    
    // ルークの活動ラインを開く（ポジティブ）
    if (context.openFiles.length > 0 && move.piece === 'p') {
      const fileOpened = this.checkFileOpening(move, chessInstance);
      if (fileOpened) {
        impact.severity = -1;
        impact.consequences.push('file_opened');
        impact.description = `${fileOpened}ファイルが開き、ルークの活動性が向上します。`;
        return impact;
      }
    }
    
    // 駒の協調性への影響
    if (this.willImproveCoordination(move, chessInstance)) {
      impact.severity = -1;
      impact.consequences.push('improved_coordination');
      impact.description = '駒の連携が改善され、将来的な攻撃の可能性が高まります。';
      return impact;
    }
    
    return null;
  }

  /**
   * エンドゲームへの影響を分析
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {MoveContext} context - コンテキスト
   * @returns {Object|null} エンドゲームへの影響
   */
  analyzeEndgameImpact(move, chessInstance, context) {
    const impact = {
      type: 'endgame',
      severity: 0,
      description: '',
      consequences: []
    };
    
    // パスポーンの創出可能性
    if (move.piece === 'p' && this.canCreatePassedPawn(move, chessInstance)) {
      impact.severity = -2; // 強いポジティブ影響
      impact.consequences.push('passed_pawn_potential');
      impact.description = 'このポーン前進は、将来的にパスポーンを作る可能性を秘めています。';
      return impact;
    }
    
    // ポーンマジョリティの確立
    const majority = this.checkPawnMajority(move, chessInstance);
    if (majority) {
      impact.severity = -1;
      impact.consequences.push('pawn_majority');
      impact.description = `${majority}でポーンマジョリティを確立し、エンドゲームで有利になります。`;
      return impact;
    }
    
    // キングの活性化への準備
    if (context.type.includes(MOVE_TYPES.STRATEGIC_ENDGAME)) {
      impact.severity = -1;
      impact.consequences.push('king_activation');
      impact.description = 'エンドゲームでのキングの活性化に向けた準備となります。';
      return impact;
    }
    
    return null;
  }

  /**
   * 戦略的弱点の創出を分析
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {MoveContext} context - コンテキスト
   * @returns {Object|null} 戦略的弱点
   */
  analyzeStrategicWeaknesses(move, chessInstance, context) {
    const impact = {
      type: 'strategic_weakness',
      severity: 0,
      description: '',
      consequences: []
    };
    
    // 弱いマスの創出
    if (context.weakSquares && context.weakSquares.length > 0) {
      const criticalWeakness = context.weakSquares.find(w => w.weakness >= 2);
      if (criticalWeakness) {
        impact.severity = 2;
        impact.consequences.push('weak_squares');
        impact.description = `${criticalWeakness.square}に永続的な弱点を作る可能性があります。`;
        return impact;
      }
    }
    
    // カラーコンプレックスの弱体化
    if (this.willWeakenColorComplex(move, chessInstance)) {
      impact.severity = 2;
      impact.consequences.push('color_complex_weakness');
      const color = this.getSquareColor(move.to) === 'light' ? '白' : '黒';
      impact.description = `${color}マスコンプレックスが弱くなり、相手のビショップが強力になる可能性があります。`;
      return impact;
    }
    
    // アウトポストを与える
    if (this.willGiveOutpost(move, chessInstance)) {
      impact.severity = 2;
      impact.consequences.push('enemy_outpost');
      impact.description = '相手に理想的なアウトポストを提供してしまう危険があります。';
      return impact;
    }
    
    return null;
  }

  // 補助メソッド群

  /**
   * 孤立ポーンを作るかチェック
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {boolean} 孤立ポーンを作るか
   */
  willCreateIsolatedPawn(move, chessInstance) {
    if (move.piece !== 'p') return false;
    
    const file = 'abcdefgh'.indexOf(move.to[0]);
    const adjacentFiles = [];
    if (file > 0) adjacentFiles.push(file - 1);
    if (file < 7) adjacentFiles.push(file + 1);
    
    // 隣接ファイルに味方のポーンがあるかチェック
    const board = chessInstance.board();
    for (const adjFile of adjacentFiles) {
      for (let rank = 0; rank < 8; rank++) {
        const piece = board[rank][adjFile];
        if (piece && piece.type === 'p' && piece.color === move.color) {
          return false; // 隣接ポーンがある
        }
      }
    }
    
    return true;
  }

  /**
   * 後方ポーンを作るかチェック
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {boolean} 後方ポーンを作るか
   */
  willCreateBackwardPawn(move, chessInstance) {
    // 簡略化された実装
    return false;
  }

  /**
   * ポーンチェーンを形成するかチェック
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {boolean} ポーンチェーンを形成するか
   */
  willFormPawnChain(move, chessInstance) {
    if (move.piece !== 'p') return false;
    
    // 斜め後ろに味方のポーンがあるかチェック
    const file = 'abcdefgh'.indexOf(move.to[0]);
    const rank = '12345678'.indexOf(move.to[1]);
    const direction = move.color === 'w' ? -1 : 1;
    
    const board = chessInstance.board();
    const positions = [
      [file - 1, rank + direction],
      [file + 1, rank + direction]
    ];
    
    for (const [f, r] of positions) {
      if (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const piece = board[r][f];
        if (piece && piece.type === 'p' && piece.color === move.color) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * キングの近くかチェック
   * @param {string} square - マス
   * @param {string} kingPosition - キングの位置
   * @returns {boolean} キングの近くか
   */
  isNearKing(square, kingPosition) {
    return this.getSquareDistance(square, kingPosition) <= 2;
  }

  /**
   * キャスリング権を失うかチェック
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {boolean} キャスリング権を失うか
   */
  willLoseCastlingRights(move, chessInstance) {
    // キングまたはルークの移動
    if (move.piece === 'k' || 
        (move.piece === 'r' && (move.from === 'a1' || move.from === 'h1' || move.from === 'a8' || move.from === 'h8'))) {
      return true;
    }
    return false;
  }

  /**
   * ビショップを閉じ込めるかチェック
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {boolean} ビショップを閉じ込めるか
   */
  willTrapBishop(move, chessInstance) {
    if (move.piece !== 'p') return false;
    
    // 中央のポーン前進でビショップの対角線を塞ぐ場合
    if ('de'.includes(move.from[0]) && move.color === 'w' && move.to[1] === '3') {
      // c1またはf1のビショップをチェック
      const c1Bishop = chessInstance.get('c1');
      const f1Bishop = chessInstance.get('f1');
      
      if ((c1Bishop && c1Bishop.type === 'b' && move.from === 'd2') ||
          (f1Bishop && f1Bishop.type === 'b' && move.from === 'e2')) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * ファイルを開くかチェック
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {string|null} 開いたファイル
   */
  checkFileOpening(move, chessInstance) {
    if (move.piece !== 'p' || !move.captured) return null;
    
    const file = move.to[0];
    const fileStatus = this.getFileStatus(chessInstance, file, move.color);
    
    if (fileStatus === 'open' || fileStatus === 'semi-open') {
      return file;
    }
    
    return null;
  }

  /**
   * 駒の協調性が改善するかチェック
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {boolean} 協調性が改善するか
   */
  willImproveCoordination(move, chessInstance) {
    // 簡略化された実装
    return false;
  }

  /**
   * パスポーンを作れるかチェック
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {boolean} パスポーンを作れるか
   */
  canCreatePassedPawn(move, chessInstance) {
    if (move.piece !== 'p') return false;
    
    const file = 'abcdefgh'.indexOf(move.to[0]);
    const rank = '12345678'.indexOf(move.to[1]);
    const enemyColor = move.color === 'w' ? 'b' : 'w';
    const direction = move.color === 'w' ? 1 : -1;
    
    // 前方と隣接ファイルに敵ポーンがないかチェック
    const board = chessInstance.board();
    const checkFiles = [file - 1, file, file + 1].filter(f => f >= 0 && f < 8);
    
    for (const f of checkFiles) {
      let r = rank + direction;
      while (r >= 0 && r < 8) {
        const piece = board[r][f];
        if (piece && piece.type === 'p' && piece.color === enemyColor) {
          return false;
        }
        r += direction;
      }
    }
    
    return true;
  }

  /**
   * ポーンマジョリティをチェック
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {string|null} マジョリティの場所
   */
  checkPawnMajority(move, chessInstance) {
    if (move.piece !== 'p') return null;
    
    const file = move.to[0];
    if ('abc'.includes(file)) {
      return 'クイーンサイド';
    } else if ('fgh'.includes(file)) {
      return 'キングサイド';
    }
    
    return null;
  }

  /**
   * カラーコンプレックスを弱めるかチェック
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {boolean} カラーコンプレックスを弱めるか
   */
  willWeakenColorComplex(move, chessInstance) {
    if (move.piece !== 'p') return false;
    
    // 同じ色のマスに多くのポーンを配置している場合
    const moveSquareColor = this.getSquareColor(move.to);
    const ownPawns = this.getOwnPawns(chessInstance, move.color);
    const pawnsOnSameColor = ownPawns.filter(p => 
      this.getSquareColor(p.square) === moveSquareColor
    ).length;
    
    return pawnsOnSameColor >= 4;
  }

  /**
   * 相手にアウトポストを与えるかチェック
   * @param {MoveObject} move - 手
   * @param {Chess} chessInstance - チェスインスタンス
   * @returns {boolean} アウトポストを与えるか
   */
  willGiveOutpost(move, chessInstance) {
    if (move.piece !== 'p') return false;
    
    // ポーン前進により、隣接ファイルに弱いマスを作る場合
    const file = 'abcdefgh'.indexOf(move.to[0]);
    const rank = '12345678'.indexOf(move.to[1]);
    const enemyColor = move.color === 'w' ? 'b' : 'w';
    
    // 敵陣での弱いマスをチェック
    const weakSquares = [];
    if (file > 0) {
      const leftSquare = 'abcdefgh'[file - 1] + (move.color === 'w' ? '5' : '4');
      if (!this.canBeAttackedByPawn(leftSquare, move.color, chessInstance)) {
        weakSquares.push(leftSquare);
      }
    }
    if (file < 7) {
      const rightSquare = 'abcdefgh'[file + 1] + (move.color === 'w' ? '5' : '4');
      if (!this.canBeAttackedByPawn(rightSquare, move.color, chessInstance)) {
        weakSquares.push(rightSquare);
      }
    }
    
    return weakSquares.length > 0;
  }

  // ナイトの攻撃可能マスを取得
  getKnightAttacks(square) {
    const files = 'abcdefgh';
    const ranks = '12345678';
    const fileIndex = files.indexOf(square[0]);
    const rankIndex = ranks.indexOf(square[1]);
    
    const knightMoves = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    
    const attacks = [];
    knightMoves.forEach(([df, dr]) => {
      const newFile = fileIndex + df;
      const newRank = rankIndex + dr;
      
      if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
        attacks.push(files[newFile] + ranks[newRank]);
      }
    });
    
    return attacks;
  }

  // 駒の価値を取得
  getPieceValue(pieceType) {
    const values = {
      'p': 1,
      'n': 3,
      'b': 3,
      'r': 5,
      'q': 9,
      'k': 100
    };
    return values[pieceType.toLowerCase()] || 0;
  }

  // キングを見つける
  findKing(color) {
    const board = this.chess.board();
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        if (piece && piece.type === 'k' && piece.color === color) {
          return { rank: i, file: j };
        }
      }
    }
    return null;
  }

  // ポジショナル要素の分析
  analyzePositionalFactors(move, chessInstance, previousFen, context) {
    // 中央支配の評価
    context.centralControl = this.evaluateCentralControl(move, chessInstance);
    
    // 駒の活動性
    context.pieceActivity = this.evaluatePieceActivity(move, chessInstance);
    
    // ポーン構造の評価
    context.pawnStructure = this.evaluatePawnStructure(chessInstance);
    
    // 開放ファイルとセミオープンファイル
    context.openFiles = this.findOpenFiles(chessInstance, move.color);
    
    // アウトポスト（前進拠点）の検出
    context.outposts = this.findOutposts(move, chessInstance);
    
    // 弱いマスの検出
    context.weakSquares = this.findWeakSquares(chessInstance, move.color === 'w' ? 'b' : 'w');
  }

  // 中央支配の評価
  evaluateCentralControl(move, chessInstance) {
    const centralSquares = ['d4', 'd5', 'e4', 'e5'];
    const extendedCenter = ['c3', 'c4', 'c5', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f4', 'f5', 'f6'];
    
    let control = 0;
    
    // 移動先が中央の場合
    if (centralSquares.includes(move.to)) {
      control += 2;
      if (move.piece === 'p') control += 1; // ポーンによる中央支配は特に重要
    } else if (extendedCenter.includes(move.to)) {
      control += 1;
    }
    
    // 中央のマスを攻撃している場合
    const attacks = this.getAttackedSquares(move, chessInstance);
    attacks.forEach(square => {
      if (centralSquares.includes(square)) control += 1;
      else if (extendedCenter.includes(square)) control += 0.5;
    });
    
    return control;
  }

  // 駒の活動性の評価
  evaluatePieceActivity(move, chessInstance) {
    const activity = {
      improved: false,
      mobility: 0,
      coordination: 0
    };
    
    // 駒の可動範囲を計算
    const movesFromSquare = this.chess.moves({ square: move.to, verbose: true });
    activity.mobility = movesFromSquare.length;
    
    // ビショップの場合、良いビショップか悪いビショップかを判定
    if (move.piece === 'b') {
      const bishopColor = this.getSquareColor(move.to);
      const ownPawns = this.getOwnPawns(chessInstance, move.color);
      const pawnsOnSameColor = ownPawns.filter(pawn => 
        this.getSquareColor(pawn.square) === bishopColor
      ).length;
      
      if (pawnsOnSameColor < 3) {
        activity.improved = true;
        activity.goodBishop = true;
      } else {
        activity.badBishop = true;
      }
    }
    
    // ルークの場合、開放ファイルやセミオープンファイルにいるかチェック
    if (move.piece === 'r') {
      const file = move.to[0];
      const fileStatus = this.getFileStatus(chessInstance, file, move.color);
      if (fileStatus === 'open') {
        activity.improved = true;
        activity.openFile = true;
      } else if (fileStatus === 'semi-open') {
        activity.improved = true;
        activity.semiOpenFile = true;
      }
    }
    
    return activity;
  }

  // ポーン構造の評価
  evaluatePawnStructure(chessInstance) {
    const structure = {
      doubled: [],
      isolated: [],
      passed: [],
      chains: [],
      weaknesses: []
    };
    
    const board = this.chess.board();
    const files = 'abcdefgh';
    
    // 各ファイルのポーンを分析
    for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
      const file = files[fileIdx];
      const whitePawns = [];
      const blackPawns = [];
      
      for (let rank = 0; rank < 8; rank++) {
        const piece = board[rank][fileIdx];
        if (piece && piece.type === 'p') {
          if (piece.color === 'w') whitePawns.push(rank);
          else blackPawns.push(rank);
        }
      }
      
      // ダブルポーンの検出
      if (whitePawns.length > 1) {
        structure.doubled.push({ color: 'w', file: file });
      }
      if (blackPawns.length > 1) {
        structure.doubled.push({ color: 'b', file: file });
      }
      
      // 孤立ポーンの検出（隣接ファイルに味方ポーンがない）
      const hasAdjacentPawn = (color, fileIndex) => {
        const adjacentFiles = [];
        if (fileIndex > 0) adjacentFiles.push(fileIndex - 1);
        if (fileIndex < 7) adjacentFiles.push(fileIndex + 1);
        
        return adjacentFiles.some(adjFile => {
          for (let rank = 0; rank < 8; rank++) {
            const piece = board[rank][adjFile];
            if (piece && piece.type === 'p' && piece.color === color) return true;
          }
          return false;
        });
      };
      
      if (whitePawns.length > 0 && !hasAdjacentPawn('w', fileIdx)) {
        structure.isolated.push({ color: 'w', file: file });
      }
      if (blackPawns.length > 0 && !hasAdjacentPawn('b', fileIdx)) {
        structure.isolated.push({ color: 'b', file: file });
      }
    }
    
    return structure;
  }

  // 開放ファイルとセミオープンファイルを見つける
  findOpenFiles(chessInstance, color) {
    const files = 'abcdefgh';
    const openFiles = [];
    
    for (let file of files) {
      const status = this.getFileStatus(chessInstance, file, color);
      if (status === 'open' || status === 'semi-open') {
        openFiles.push({ file: file, status: status });
      }
    }
    
    return openFiles;
  }

  // ファイルの状態を取得
  getFileStatus(chessInstance, file, color) {
    const board = this.chess.board();
    const fileIndex = 'abcdefgh'.indexOf(file);
    let ownPawns = 0;
    let oppPawns = 0;
    
    for (let rank = 0; rank < 8; rank++) {
      const piece = board[rank][fileIndex];
      if (piece && piece.type === 'p') {
        if (piece.color === color) ownPawns++;
        else oppPawns++;
      }
    }
    
    if (ownPawns === 0 && oppPawns === 0) return 'open';
    if (ownPawns === 0 && oppPawns > 0) return 'semi-open';
    return 'closed';
  }

  // アウトポストを見つける
  findOutposts(move, chessInstance) {
    const outposts = [];
    
    // ナイトの場合、敵陣で守られていて、敵ポーンに攻撃されない位置
    if (move.piece === 'n') {
      const rank = '12345678'.indexOf(move.to[1]);
      const isInEnemyTerritory = (move.color === 'w' && rank >= 4) || 
                                 (move.color === 'b' && rank <= 3);
      
      if (isInEnemyTerritory) {
        // 敵ポーンに攻撃されない位置かチェック
        const canBeAttackedByPawn = this.canBeAttackedByPawn(move.to, move.color === 'w' ? 'b' : 'w', chessInstance);
        if (!canBeAttackedByPawn) {
          outposts.push({
            square: move.to,
            piece: 'ナイト',
            strength: 'strong'
          });
        }
      }
    }
    
    return outposts;
  }

  // ポーンに攻撃される可能性があるかチェック
  canBeAttackedByPawn(square, pawnColor, chessInstance) {
    const file = 'abcdefgh'.indexOf(square[0]);
    const rank = '12345678'.indexOf(square[1]);
    const direction = pawnColor === 'w' ? 1 : -1;
    
    // 斜め前のマスをチェック
    const attackingRank = rank - direction;
    if (attackingRank >= 0 && attackingRank < 8) {
      if (file > 0) {
        const leftPiece = this.chess.get('abcdefgh'[file - 1] + '12345678'[attackingRank]);
        if (leftPiece && leftPiece.type === 'p' && leftPiece.color === pawnColor) return true;
      }
      if (file < 7) {
        const rightPiece = this.chess.get('abcdefgh'[file + 1] + '12345678'[attackingRank]);
        if (rightPiece && rightPiece.type === 'p' && rightPiece.color === pawnColor) return true;
      }
    }
    
    return false;
  }

  // 弱いマスを見つける
  findWeakSquares(chessInstance, enemyColor) {
    const weakSquares = [];
    const importantSquares = ['f2', 'f7', 'g2', 'g7', 'h2', 'h7']; // キング周辺
    
    importantSquares.forEach(square => {
      const piece = this.chess.get(square);
      if (!piece || piece.color === enemyColor) {
        // このマスが十分に守られているかチェック
        const defenders = this.countDefenders(square, enemyColor === 'w' ? 'b' : 'w', chessInstance);
        const attackers = this.countAttackers(square, enemyColor, chessInstance);
        
        if (attackers > defenders) {
          weakSquares.push({
            square: square,
            weakness: attackers - defenders
          });
        }
      }
    });
    
    return weakSquares;
  }

  // マスの守り手を数える（簡略化）
  countDefenders(square, color, chessInstance) {
    // 簡略化のため、基本的な実装のみ
    return 0;
  }

  // マスの攻撃者を数える（簡略化）
  countAttackers(square, color, chessInstance) {
    // 簡略化のため、基本的な実装のみ
    return 0;
  }

  // マスの色を取得
  getSquareColor(square) {
    const file = 'abcdefgh'.indexOf(square[0]);
    const rank = '12345678'.indexOf(square[1]);
    return (file + rank) % 2 === 0 ? 'dark' : 'light';
  }

  // 自分のポーンを取得
  getOwnPawns(chessInstance, color) {
    const pawns = [];
    const board = this.chess.board();
    
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        if (piece && piece.type === 'p' && piece.color === color) {
          pawns.push({
            square: 'abcdefgh'[file] + '12345678'[rank],
            rank: rank,
            file: file
          });
        }
      }
    }
    
    return pawns;
  }

  /**
   * Level 3: 変化手順生成（複数手先まで）
   * @param {string} fen - 現在の局面のFEN
   * @param {MoveObject} playedMove - 指された手
   * @param {StockfishData|null} stockfishData - Stockfishデータ
   * @param {number} maxDepth - 最大探索深度（デフォルト3）
   * @returns {Variation[]} 変化手順のリスト
   */
  generateVariations(fen, playedMove, stockfishData = null, maxDepth = 3) {
    const variations = [];
    
    try {
      // FENの検証
      const fenValidation = ChessErrorHandler.validateFEN(fen);
      if (!fenValidation.valid) {
        ChessErrorHandler.logError(fenValidation.error, 'warn');
        return variations;
      }
      
      // 新しいChessインスタンスを作成（元の局面を保持）
      const chessResult = ChessErrorHandler.safeExecuteSync(
        () => new Chess(fen),
        ERROR_CODES.INVALID_FEN,
        { fen }
      );
      
      if (!chessResult.success) {
        ChessErrorHandler.logError(chessResult.error, 'warn');
        return variations;
      }
      
      const tempChess = chessResult.result;
      
      // 指された手の後の局面を作成
      const moveResult = this.makeSafeMove(tempChess, playedMove);
      if (!moveResult.success) {
        ChessErrorHandler.logError(
          new ChessAnalysisError(
            'Failed to make move in generateBasicVariations',
            ERROR_CODES.ILLEGAL_MOVE,
            { error: moveResult.error, move: playedMove }
          ),
          'warn'
        );
        return variations;
      }
      
      // 相手の可能な応手を取得
      const possibleResponses = tempChess.moves({ verbose: true });
      
      // 重要な応手を選別（最大3つ）
      const importantResponses = this.selectImportantResponses(tempChess, possibleResponses);
      
      // 各応手に対する変化を生成（深い探索）
      importantResponses.forEach(response => {
        const variation = this.analyzeDeepVariation(
          tempChess, 
          response, 
          playedMove, 
          maxDepth, 
          1, // 現在の深さ
          [playedMove] // 手順履歴
        );
        if (variation) {
          variations.push(variation);
        }
      });
      
      // Stockfishのデータがある場合、最善手との比較も追加
      if (stockfishData && stockfishData.bestMove && !stockfishData.wasBestMove) {
        const bestMoveVariation = this.analyzeBestMoveVariation(fen, stockfishData.bestMove, playedMove);
        if (bestMoveVariation) {
          variations.push(bestMoveVariation);
        }
      }
      
    } catch (error) {
      console.error('Error in generateVariations:', error);
    }
    
    return variations;
  }

  /**
   * 安全に手を実行する（エラーハンドリング付き）
   * @param {Chess} chessInstance - チェスインスタンス
   * @param {MoveObject|string} move - 実行する手
   * @returns {{success: boolean, move?: Object, error?: string}} 実行結果
   */
  makeSafeMove(chessInstance, move) {
    try {
      let moveStr;
      
      // moveオブジェクトを文字列に変換
      if (typeof move === 'string') {
        moveStr = move;
      } else if (move.san) {
        moveStr = move.san;
      } else if (move.from && move.to) {
        // fromとtoから合法手を探す
        const legalMoves = chessInstance.moves({ verbose: true });
        const matchingMove = legalMoves.find(m => 
          m.from === move.from && 
          m.to === move.to &&
          (!move.promotion || m.promotion === move.promotion)
        );
        
        if (matchingMove) {
          moveStr = matchingMove.san;
        } else {
          return { success: false, error: 'Move not found in legal moves' };
        }
      } else {
        return { success: false, error: 'Invalid move format' };
      }
      
      // 手を実行
      const result = chessInstance.move(moveStr);
      if (result) {
        return { success: true, move: result };
      } else {
        return { success: false, error: 'Chess.js rejected the move' };
      }
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 重要な応手を選別
  selectImportantResponses(chessInstance, possibleMoves) {
    const importantMoves = [];
    
    // 優先順位：
    // 1. チェック
    // 2. 駒取り（価値の高い順）
    // 3. 中央への手
    // 4. その他の手
    
    const checkMoves = [];
    const captures = [];
    const centralMoves = [];
    const otherMoves = [];
    
    possibleMoves.forEach(move => {
      if (move.san.includes('+')) {
        checkMoves.push(move);
      } else if (move.captured) {
        captures.push(move);
      } else if (SQUARE_IMPORTANCE.center.includes(move.to)) {
        centralMoves.push(move);
      } else {
        otherMoves.push(move);
      }
    });
    
    // 駒取りを価値順にソート
    captures.sort((a, b) => {
      const valueA = this.getPieceValue(a.captured);
      const valueB = this.getPieceValue(b.captured);
      return valueB - valueA;
    });
    
    // 重要な手を選択（最大3つ）
    importantMoves.push(...checkMoves.slice(0, 1));
    importantMoves.push(...captures.slice(0, 2));
    
    if (importantMoves.length < 3) {
      importantMoves.push(...centralMoves.slice(0, 3 - importantMoves.length));
    }
    
    if (importantMoves.length < 3) {
      importantMoves.push(...otherMoves.slice(0, 3 - importantMoves.length));
    }
    
    return importantMoves.slice(0, 3);
  }

  // 変化を分析（単一手用 - 後方互換性のため保持）
  analyzeVariation(chessInstance, responseMove, originalMove) {
    try {
      // 局面をコピー
      const tempChess = new Chess(chessInstance.fen());
      
      // 応手を実行
      const moveResult = this.makeSafeMove(tempChess, responseMove);
      if (!moveResult.success) {
        return null;
      }
      
      // 変化の評価
      const evaluation = this.evaluateVariation(tempChess, responseMove, originalMove);
      
      // 日本語の説明を生成
      const explanation = this.generateVariationExplanation(responseMove, evaluation);
      
      return {
        move: responseMove.san,
        explanation: explanation,
        evaluation: evaluation.score,
        isCritical: evaluation.isCritical
      };
      
    } catch (error) {
      console.error('Error in analyzeVariation:', error);
      return null;
    }
  }

  /**
   * 深い変化を分析（複数手）
   * @param {Chess} chessInstance - 現在のチェスインスタンス
   * @param {Object} currentMove - 現在の手
   * @param {MoveObject} originalMove - 元の手
   * @param {number} maxDepth - 最大深度
   * @param {number} currentDepth - 現在の深度
   * @param {Array} moveHistory - 手順履歴
   * @returns {Object|null} 変化情報
   */
  analyzeDeepVariation(chessInstance, currentMove, originalMove, maxDepth, currentDepth, moveHistory) {
    try {
      // 局面をコピー
      const tempChess = new Chess(chessInstance.fen());
      
      // 現在の手を実行
      const moveResult = this.makeSafeMove(tempChess, currentMove);
      if (!moveResult.success) {
        return null;
      }
      
      // 手順履歴に追加
      const newHistory = [...moveHistory, moveResult.move];
      
      // 変化の評価
      const evaluation = this.evaluateVariation(tempChess, currentMove, originalMove);
      
      // 終端条件：最大深度到達、チェックメイト、引き分け
      if (currentDepth >= maxDepth || tempChess.isCheckmate() || tempChess.isDraw()) {
        return this.createVariationResult(newHistory, evaluation, currentDepth);
      }
      
      // 次の深度の探索が必要かどうか判定
      if (!this.shouldContinueVariation(evaluation, currentDepth)) {
        return this.createVariationResult(newHistory, evaluation, currentDepth);
      }
      
      // 次の手番の重要な応手を取得
      const nextMoves = tempChess.moves({ verbose: true });
      const importantNextMoves = this.selectImportantResponses(tempChess, nextMoves);
      
      // 深度が浅い場合は、最も重要な1手だけを深く探索
      const movesToExplore = currentDepth >= 2 ? importantNextMoves.slice(0, 1) : importantNextMoves.slice(0, 2);
      
      let bestContinuation = null;
      let bestScore = -Infinity;
      
      // 各応手を探索
      for (const nextMove of movesToExplore) {
        const continuation = this.analyzeDeepVariation(
          tempChess,
          nextMove,
          originalMove,
          maxDepth,
          currentDepth + 1,
          newHistory
        );
        
        if (continuation && continuation.finalEvaluation > bestScore) {
          bestScore = continuation.finalEvaluation;
          bestContinuation = continuation;
        }
      }
      
      // 最善の継続手順を含めて結果を作成
      if (bestContinuation) {
        return {
          moves: bestContinuation.moves,
          explanation: this.generateDeepVariationExplanation(newHistory, bestContinuation.moves, evaluation),
          evaluation: evaluation.score,
          finalEvaluation: bestContinuation.finalEvaluation,
          depth: bestContinuation.depth,
          isCritical: evaluation.isCritical || bestContinuation.isCritical
        };
      } else {
        return this.createVariationResult(newHistory, evaluation, currentDepth);
      }
      
    } catch (error) {
      console.error('Error in analyzeDeepVariation:', error);
      return null;
    }
  }

  /**
   * 変化の探索を続けるべきか判定
   * @param {Object} evaluation - 現在の評価
   * @param {number} currentDepth - 現在の深度
   * @returns {boolean} 続けるべきか
   */
  shouldContinueVariation(evaluation, currentDepth) {
    // チェックメイトの場合は続けない
    if (evaluation.factors.includes('checkmate')) {
      return false;
    }
    
    // 重要な変化（チェック、駒取り）の場合は続ける
    if (evaluation.factors.includes('check') || 
        evaluation.factors.includes('capture') ||
        evaluation.isCritical) {
      return true;
    }
    
    // 深度が1の場合は、静かな手でも続ける
    if (currentDepth === 1) {
      return true;
    }
    
    // それ以外は続けない
    return false;
  }

  /**
   * 変化結果を作成
   * @param {Array} moveHistory - 手順履歴
   * @param {Object} evaluation - 評価
   * @param {number} depth - 深度
   * @returns {Object} 変化結果
   */
  createVariationResult(moveHistory, evaluation, depth) {
    // 手順を文字列化（最初の手は元の手なので除外）
    const movesStr = moveHistory.slice(1).map(m => m.san).join(' ');
    
    return {
      moves: movesStr,
      explanation: this.generateVariationSequenceExplanation(moveHistory.slice(1), evaluation),
      evaluation: evaluation.score,
      finalEvaluation: evaluation.score,
      depth: depth,
      isCritical: evaluation.isCritical
    };
  }

  /**
   * 変化手順の説明を生成
   * @param {Array} moves - 手順
   * @param {Object} finalEvaluation - 最終評価
   * @returns {string} 説明
   */
  generateVariationSequenceExplanation(moves, finalEvaluation) {
    if (moves.length === 0) return '';
    
    let explanation = '';
    
    // 単一手の場合
    if (moves.length === 1) {
      return this.generateVariationExplanation(moves[0], finalEvaluation);
    }
    
    // 複数手の場合
    const moveNotation = moves.map(m => m.san).join(' ');
    
    if (finalEvaluation.factors.includes('checkmate')) {
      explanation = `${moveNotation}でチェックメイトになります！`;
    } else if (finalEvaluation.isCritical) {
      explanation = `${moveNotation}という手順で、`;
      
      if (finalEvaluation.factors.includes('capture')) {
        explanation += '重要な駒を失う可能性があります。';
      } else if (finalEvaluation.factors.includes('check')) {
        explanation += '厳しい攻撃を受けます。';
      } else {
        explanation += '不利な局面になります。';
      }
    } else {
      explanation = `${moveNotation}と続く可能性があります。`;
    }
    
    return explanation;
  }

  /**
   * 深い変化の説明を生成
   * @param {Array} playedMoves - 指された手順
   * @param {string} continuationMoves - 継続手順
   * @param {Object} currentEvaluation - 現在の評価
   * @returns {string} 説明
   */
  generateDeepVariationExplanation(playedMoves, continuationMoves, currentEvaluation) {
    // 最初の手は元の手なので除外
    const relevantMoves = playedMoves.slice(1);
    
    if (relevantMoves.length === 0) return '';
    
    let explanation = '';
    const firstMove = relevantMoves[0].san;
    
    // 最初の応手の説明
    if (currentEvaluation.factors.includes('check')) {
      explanation = `${firstMove}でチェックされ、`;
    } else if (currentEvaluation.factors.includes('capture')) {
      explanation = `${firstMove}で駒を取られ、`;
    } else {
      explanation = `${firstMove}に対して、`;
    }
    
    // 継続手順がある場合
    if (continuationMoves && continuationMoves.length > 0) {
      explanation += `さらに${continuationMoves}と続く展開が予想されます。`;
    } else {
      explanation += '局面が続きます。';
    }
    
    return explanation;
  }

  // 変化を評価
  evaluateVariation(chessInstance, responseMove, originalMove) {
    const evaluation = {
      score: 0,
      isCritical: false,
      factors: []
    };
    
    // チェックメイトの場合
    if (chessInstance.isCheckmate()) {
      evaluation.score = -100;
      evaluation.isCritical = true;
      evaluation.factors.push('checkmate');
      return evaluation;
    }
    
    // チェックの場合
    if (chessInstance.isCheck()) {
      evaluation.score -= 2;
      evaluation.factors.push('check');
    }
    
    // 駒取りの場合
    if (responseMove.captured) {
      const capturedValue = this.getPieceValue(responseMove.captured);
      evaluation.score -= capturedValue;
      if (capturedValue >= 5) {
        evaluation.isCritical = true;
      }
      evaluation.factors.push('capture');
    }
    
    // 元の手で取った駒を取り返される場合
    if (originalMove.captured && responseMove.to === originalMove.to) {
      evaluation.factors.push('recapture');
      const originalCaptureValue = this.getPieceValue(originalMove.captured);
      const recaptureValue = this.getPieceValue(originalMove.piece);
      
      if (recaptureValue > originalCaptureValue) {
        evaluation.score -= (recaptureValue - originalCaptureValue);
        evaluation.factors.push('bad_trade');
      }
    }
    
    return evaluation;
  }

  // 変化の説明を生成
  generateVariationExplanation(responseMove, evaluation) {
    let explanation = '';
    
    if (evaluation.factors.includes('checkmate')) {
      explanation = `もし${responseMove.san}なら、チェックメイトになってしまいます！`;
    } else if (evaluation.factors.includes('check')) {
      if (evaluation.factors.includes('capture')) {
        const capturedPiece = PIECE_NAMES[responseMove.captured];
        explanation = `${responseMove.san}で${capturedPiece}を取られてチェックされる可能性があります。`;
      } else {
        explanation = `${responseMove.san}でチェックされる可能性があります。`;
      }
    } else if (evaluation.factors.includes('recapture')) {
      if (evaluation.factors.includes('bad_trade')) {
        explanation = `${responseMove.san}で取り返されると、不利な交換になります。`;
      } else {
        explanation = `${responseMove.san}で取り返される可能性があります。`;
      }
    } else if (evaluation.factors.includes('capture')) {
      const capturedPiece = PIECE_NAMES[responseMove.captured];
      explanation = `${responseMove.san}で${capturedPiece}を取られる可能性があります。`;
    } else {
      // 一般的な応手
      explanation = `相手は${responseMove.san}と応じるかもしれません。`;
    }
    
    return explanation;
  }

  // 最善手との比較変化を分析
  analyzeBestMoveVariation(fen, bestMove, playedMove) {
    try {
      const tempChess = new Chess(fen);
      
      // 最善手を実行
      const bestMoveResult = this.makeSafeMove(tempChess, bestMove);
      if (!bestMoveResult.success) {
        return null;
      }
      
      // 最善手の利点を説明
      const explanation = this.explainBestMoveAdvantage(tempChess, bestMoveResult.move, playedMove);
      
      return {
        move: bestMoveResult.move.san,
        explanation: `代わりに${bestMoveResult.move.san}が最善手でした。${explanation}`,
        isCritical: true,
        isBestMove: true
      };
      
    } catch (error) {
      console.error('Error in analyzeBestMoveVariation:', error);
      return null;
    }
  }

  // 最善手の利点を説明
  explainBestMoveAdvantage(chessInstance, bestMove, playedMove) {
    const advantages = [];
    
    // チェックの場合
    if (bestMove.san.includes('+')) {
      advantages.push('チェックで主導権を握れます');
    }
    
    // 駒取りの場合
    if (bestMove.captured) {
      const capturedPiece = PIECE_NAMES[bestMove.captured];
      advantages.push(`${capturedPiece}を取れます`);
    }
    
    // 中央支配
    if (SQUARE_IMPORTANCE.center.includes(bestMove.to)) {
      advantages.push('中央を支配できます');
    }
    
    // デフォルト
    if (advantages.length === 0) {
      advantages.push('より良いポジションを築けます');
    }
    
    return advantages.join('、そして');
  }
}

export default ChessMoveAnalyzer;
