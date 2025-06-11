// Chess Move Analyzer - Rule-based natural language explanation system
import { Chess } from 'chess.js';

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
  doubleAttack: 'ダブルアタック',
  backRankMate: 'バックランクメイト'
};

class ChessMoveAnalyzer {
  constructor() {
    this.chess = new Chess();
  }

  // メインの解析関数
  analyzeMoveNaturalLanguage(fen, move, previousFen = null, evaluation = null, stockfishData = null) {
    this.chess.load(fen);
    
    const moveObj = typeof move === 'string' ? this.parseMove(move) : move;
    const moveContext = this.getMoveContext(moveObj, this.chess, previousFen);
    const explanation = this.generateExplanation(moveObj, moveContext, evaluation, stockfishData);
    
    return {
      summary: explanation.summary,
      details: explanation.details,
      keyPoints: explanation.keyPoints,
      moveType: moveContext.type
    };
  }

  // 手を解析してオブジェクトに変換
  parseMove(moveStr) {
    // moveStr がすでにオブジェクトの場合はそのまま返す
    if (typeof moveStr === 'object' && moveStr !== null) {
      return moveStr;
    }
    
    // moveStr が "e2e4" 形式の場合
    if (typeof moveStr === 'string' && moveStr.length === 4) {
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

  // 手のコンテキストを取得
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
      weakSquares: []
    };

    // キャプチャーかどうか
    if (move.captured) {
      context.captures = true;
      context.capturedPiece = PIECE_NAMES[move.captured];
      context.type.push('capture');
    }

    // チェックかどうか
    if (move.san.includes('+')) {
      context.checks = true;
      context.type.push('check');
      
      // ダブルチェックやディスカバードチェックの検出
      const checkingPieces = this.getCheckingPieces(chessInstance);
      if (checkingPieces.length > 1) {
        context.doubleCheck = true;
        context.type.push('double_check');
      }
    }

    // 基本的な戦術パターンの検出
    this.detectBasicTactics(move, chessInstance, context);
    
    // ポジショナル要素の分析
    this.analyzePositionalFactors(move, chessInstance, previousFen, context);

    // 開発の手かどうか
    if (this.isDevelopingMove(move, chessInstance)) {
      context.develops = true;
      context.type.push('development');
    }

    // 攻撃的な手かどうか
    const attacks = this.getAttackedSquares(move, chessInstance);
    if (attacks.length > 0) {
      context.attacks = attacks;
      context.type.push('attacking');
    }

    // 守備的な手かどうか
    const defends = this.getDefendedPieces(move, chessInstance);
    if (defends.length > 0) {
      context.defends = defends;
      context.type.push('defensive');
    }

    // 戦術的モチーフ
    const tactical = this.identifyTacticalMotifs(move, chessInstance);
    if (tactical.length > 0) {
      context.tactical = tactical;
      context.type.push('tactical');
    }

    // キャスリング
    if (move.flags) {
      if (typeof move.flags === 'string' && move.flags.includes('k')) {
        context.type.push('kingside-castle');
      } else if (typeof move.flags === 'string' && move.flags.includes('q')) {
        context.type.push('queenside-castle');
      }
    }
    // SAN記法からキャスリングを検出
    if (move.san === 'O-O') {
      context.type.push('kingside-castle');
    } else if (move.san === 'O-O-O') {
      context.type.push('queenside-castle');
    }

    return context;
  }

  // 自然言語説明を生成
  generateExplanation(move, context, evaluation, stockfishData) {
    let summary = '';
    const details = [];
    const keyPoints = [];

    // 基本的な手の説明
    const pieceName = move.piece ? PIECE_NAMES[move.piece] : (move.san ? this.getPieceFromSan(move.san) : '駒');
    const from = move.from || '';
    const to = move.to || '';

    // キャスリングの場合
    if (context.type.includes('kingside-castle')) {
      summary = 'キングサイドキャスリングで王の安全を確保します。';
      details.push('王を安全な位置に移動し、ルークを中央付近に配置します。');
      keyPoints.push('王の安全確保', 'ルークの活性化');
    } else if (context.type.includes('queenside-castle')) {
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
  detectBasicTactics(move, chessInstance, context) {
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
}

export default ChessMoveAnalyzer;
