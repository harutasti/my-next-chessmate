// src/pages/AnalysisPage.jsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useRouter } from "next/navigation";
import useStockfish from "@/app/hooks/useStockfish";
import ChessMoveAnalyzer from "@/app/utils/chessMoveAnalyzer";
import EvaluationGraph from "@/app/components/EvaluationGraph";
import { StockfishWorkerPool } from "@/app/utils/stockfishWorkerPool";

function getSideToMoveFromFen(fen) {
  if (!fen) return 'w';
  const parts = fen.split(' ');
  return parts.length > 1 ? parts[1] : 'w';
}

// 駒の点数
const PIECE_VALUES = {
  'p': 1,  // ポーン
  'n': 3,  // ナイト
  'b': 3,  // ビショップ
  'r': 5,  // ルーク
  'q': 9,  // クイーン
  'k': 0   // キング
};

// Wikipedia SVG駒画像のベースURL
const PIECE_IMAGE_BASE = 'https://upload.wikimedia.org/wikipedia/commons';

// 駒画像のURL（react-chessboardと同じWikipedia SVG）
const PIECE_IMAGES = {
  'w': {
    'p': `${PIECE_IMAGE_BASE}/4/45/Chess_plt45.svg`,
    'n': `${PIECE_IMAGE_BASE}/7/70/Chess_nlt45.svg`,
    'b': `${PIECE_IMAGE_BASE}/b/b1/Chess_blt45.svg`,
    'r': `${PIECE_IMAGE_BASE}/7/72/Chess_rlt45.svg`,
    'q': `${PIECE_IMAGE_BASE}/1/15/Chess_qlt45.svg`,
    'k': `${PIECE_IMAGE_BASE}/4/42/Chess_klt45.svg`
  },
  'b': {
    'p': `${PIECE_IMAGE_BASE}/c/c7/Chess_pdt45.svg`,
    'n': `${PIECE_IMAGE_BASE}/e/ef/Chess_ndt45.svg`,
    'b': `${PIECE_IMAGE_BASE}/9/98/Chess_bdt45.svg`,
    'r': `${PIECE_IMAGE_BASE}/f/ff/Chess_rdt45.svg`,
    'q': `${PIECE_IMAGE_BASE}/4/47/Chess_qdt45.svg`,
    'k': `${PIECE_IMAGE_BASE}/f/f0/Chess_kdt45.svg`
  }
};

// FENから取得した駒を計算
function getCapturedPieces(currentFen) {
  const initialPieces = {
    'p': 8, 'n': 2, 'b': 2, 'r': 2, 'q': 1, 'k': 1
  };

  // 現在の盤面の駒を数える
  const currentPieces = { 'w': {}, 'b': {} };
  const fenBoard = currentFen.split(' ')[0];

  for (const char of fenBoard) {
    if (char === '/' || /\d/.test(char)) continue;

    const color = char === char.toUpperCase() ? 'w' : 'b';
    const piece = char.toLowerCase();

    if (!currentPieces[color][piece]) {
      currentPieces[color][piece] = 0;
    }
    currentPieces[color][piece]++;
  }

  // 取得された駒を計算
  const captured = { 'w': {}, 'b': {} };

  for (const piece of Object.keys(initialPieces)) {
    const whiteCount = currentPieces['w'][piece] || 0;
    const blackCount = currentPieces['b'][piece] || 0;

    // 白の駒が減った分 = 黒が取得
    if (whiteCount < initialPieces[piece]) {
      captured['b'][piece] = initialPieces[piece] - whiteCount;
    }

    // 黒の駒が減った分 = 白が取得
    if (blackCount < initialPieces[piece]) {
      captured['w'][piece] = initialPieces[piece] - blackCount;
    }
  }

  // 点数を計算
  let whitePoints = 0;
  let blackPoints = 0;

  for (const piece of Object.keys(captured['w'])) {
    whitePoints += captured['w'][piece] * PIECE_VALUES[piece];
  }

  for (const piece of Object.keys(captured['b'])) {
    blackPoints += captured['b'][piece] * PIECE_VALUES[piece];
  }

  return {
    white: captured['w'],
    black: captured['b'],
    whitePoints,
    blackPoints,
    advantage: whitePoints - blackPoints
  };
}

function normalizeEvaluationForWhitePerspective(evaluation, fen) {
  if (evaluation === null || evaluation === undefined) return evaluation;
  const sideToMove = getSideToMoveFromFen(fen);
  if (typeof evaluation === 'number') {
    return sideToMove === 'b' ? -evaluation : evaluation;
  }
  if (typeof evaluation === 'string' && evaluation.startsWith('M')) {
    const mateValue = parseInt(evaluation.substring(1), 10);
    if (Number.isNaN(mateValue)) return evaluation;
    if (mateValue === 0) {
      const winnerSign = sideToMove === 'b' ? '+' : '-';
      return `M${winnerSign}0`;
    }
    const normalizedMate = sideToMove === 'b' ? -mateValue : mateValue;
    return `M${normalizedMate}`;
  }
  return evaluation;
}

// 事前定義PGN
const prefilledPgn = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2025.04.27"]
[Round "?"]
[White "Mr_gt12"]
[Black "Rakasio"]
[Result "1-0"]
[TimeControl "600"]
[WhiteElo "724"]
[BlackElo "688"]
[Termination "Mr_gt12 won by checkmate"]
[ECO "C50"]
[EndTime "7:30:08 GMT+0000"]
[Link "https://www.chess.com/game/live/137833809614?move=0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 d6 4. O-O f5 5. exf5 Bxf5 6. d3 e4 7. Bg5 Qd7 8. Re1 Nf6 9. Nc3 O-O-O 10. Bxf6 gxf6 11. dxe4 Bg6 12. Nd5 f5 13. exf5 Bxf5 14. Nh4 Bh3 15. Nf4 d5 16. Bxd5 Bxg2 17. Be6 Rg8 18. Bxd7+ Rxd7 19. Nhxg2 Rxd1 20. Raxd1 Nb4 21. Re8# 1-0`;

export default function AnalysisPage() {
  // State管理
  const [pgn, setPgn] = useState(prefilledPgn);
  const [fen, setFen] = useState("start");
  const [history, setHistory] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoadingPgn, setIsLoadingPgn] = useState(false);
  const [gameInfo, setGameInfo] = useState({});
  const [lastMove, setLastMove] = useState(null);
  const [dynamicBoardWidth, setDynamicBoardWidth] = useState(300);
  const [moveEvaluations, setMoveEvaluations] = useState({});
  const [previousEvaluation, setPreviousEvaluation] = useState(null);
  const [moveExplanations, setMoveExplanations] = useState({});
  const [previousBestMove, setPreviousBestMove] = useState(null);
  const [allMovesAnalysis, setAllMovesAnalysis] = useState({});
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const moveAnalyzer = useRef(new ChessMoveAnalyzer());
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isInVariationMode, setIsInVariationMode] = useState(false);
  const [savedHistoryPosition, setSavedHistoryPosition] = useState(null);
  const [boardOrientation, setBoardOrientation] = useState('white');

  const router = useRouter();
  const chessGame = useRef(null);
  const boardWrapperRef = useRef(null);
  const latestAnalysisRef = useRef({ evaluation: null, bestMove: null, depth: null });
  const moveListRef = useRef(null);

  // Stockfishフックを使用
  const {
    isReady: engineReady,
    isAnalyzing,
    bestMove,
    evaluation,
    depth,
    nodes,
    nps,
    analyzePosition,
    stopAnalysis,
  } = useStockfish({
    difficulty: 15,  // Reduced from 20 for faster initial analysis
    thinkingTime: 1000,  // Reduced from 3000ms to 1000ms
  });

  // 解析結果が更新されたら、refにも保存
  useEffect(() => {
    latestAnalysisRef.current = { evaluation, bestMove, depth };
  }, [evaluation, bestMove, depth]);

  // 初期化とStockfishのプレウォーミング
  useEffect(() => {
    chessGame.current = new Chess();
    setFen(chessGame.current.fen());
    
    // Stockfishエンジンをプレウォーミング（初回解析を高速化）
    if (analyzePosition) {
      analyzePosition(chessGame.current.fen(), 15);
      setTimeout(() => stopAnalysis(), 100); // すぐに停止
    }
  }, [analyzePosition, stopAnalysis]);

  // 背景のマウスポインタ追従エフェクト
  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // ボードサイズの動的調整（高さベース・チェス盤中心）
  useEffect(() => {
    const calculateBoardSize = () => {
      // ビューポートサイズを取得
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // 高さ方向: パディング + 取得駒表示 + ナビボタン + 凡例
      const reservedHeight = 32 + 40 + 40 + 56 + 40 + 16; // 224px
      const availableHeight = viewportHeight - reservedHeight;

      // サイドバー幅を画面幅に応じて計算
      let sidebarWidth = 240; // デフォルト (w-60)
      if (viewportWidth >= 1280) sidebarWidth = 320; // xl: w-80
      else if (viewportWidth >= 1024) sidebarWidth = 288; // lg: w-72
      else if (viewportWidth >= 768) sidebarWidth = 256; // md: w-64

      // 幅方向: 左サイドバー + 右パネル + パディング + gap
      const reservedWidth = sidebarWidth * 2 + 32 + 32;
      const availableWidth = viewportWidth - reservedWidth;

      // 高さと幅の小さい方を採用（上限なし）
      const boardSize = Math.min(availableHeight, availableWidth);
      setDynamicBoardWidth(Math.max(boardSize, 300));
    };
    calculateBoardSize();
    window.addEventListener("resize", calculateBoardSize);
    return () => window.removeEventListener("resize", calculateBoardSize);
  }, []);

  // 現在の手に自動スクロール
  useEffect(() => {
    if (moveListRef.current && currentIndex >= -1) {
      const targetId = currentIndex === -1 ? 'move-initial' : `move-${currentIndex}`;
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentIndex]);

  // PGN解析関数
  const parsePgnHeaders = (pgnText) => {
    const headers = {};
    const headerRegex = /\[(\w+)\s+"(.+?)"\]/g;
    let match;
    while ((match = headerRegex.exec(pgnText)) !== null) {
      headers[match[1]] = match[2];
    }
    return headers;
  };

  // PGN読み込み
  const loadPgn = async () => {
    if (isLoadingPgn) return;
    setIsLoadingPgn(true);

    try {
      chessGame.current.reset();
      chessGame.current.loadPgn(pgn, { sloppy: true });

      const newHistory = chessGame.current.history({ verbose: true });
      setHistory(newHistory);
      setCurrentIndex(newHistory.length > 0 ? newHistory.length - 1 : -1);
      setFen(chessGame.current.fen());
      setGameInfo(parsePgnHeaders(pgn));
      setErrorMessage("");

      // 解析データをリセット（再読み込み可能にする）
      setAllMovesAnalysis({});
      setMoveExplanations({});
      setMoveEvaluations({});
      setPreviousEvaluation(null);
      setPreviousBestMove(null);

      // 最後の手をハイライト
      if (newHistory.length > 0) {
        const lastMoveData = newHistory[newHistory.length - 1];
        setLastMove({
          from: lastMoveData.from,
          to: lastMoveData.to
        });
      }

      // 現在の局面のみを解析（高速化のため）
      if (newHistory.length > 0) {
        analyzePosition(chessGame.current.fen(), 15);
      }
    } catch (error) {
      setErrorMessage(error.message || "PGNの読み込みに失敗しました。");
      chessGame.current.reset();
      setFen(chessGame.current.fen());
      setHistory([]);
      setCurrentIndex(-1);
      setGameInfo({});
      setLastMove(null);
    } finally {
      setIsLoadingPgn(false);
    }
  };

  // 手の移動
  const navigateMoves = useCallback((direction) => {
    if (!chessGame.current || history.length === 0 && direction !== "first") return;
    
    let newIndex = currentIndex;
    if (direction === "first") newIndex = -1;
    else if (direction === "last") newIndex = history.length - 1;
    else if (direction === "prev") newIndex = Math.max(-1, currentIndex - 1);
    else if (direction === "next") newIndex = Math.min(history.length - 1, currentIndex + 1);

    chessGame.current.reset();
    for (let i = 0; i <= newIndex; i++) {
      if (history[i]) chessGame.current.move(history[i]);
    }
    
    setFen(chessGame.current.fen());
    setCurrentIndex(newIndex);
    
    // ハイライトを更新
    if (newIndex >= 0 && history[newIndex]) {
      setLastMove({
        from: history[newIndex].from,
        to: history[newIndex].to
      });
    } else {
      setLastMove(null);
    }

    // 評価値をリセット
    setPreviousEvaluation(null);

    // バリエーションモードを解除
    if (isInVariationMode) {
      setIsInVariationMode(false);
      setSavedHistoryPosition(null);
    }
  }, [currentIndex, history, isInVariationMode]);

  // 特定の手へジャンプ
  const jumpToMove = (index) => {
    if (index < -1 || index >= history.length) return;

    chessGame.current.reset();
    for (let i = 0; i <= index; i++) {
      if (history[i]) chessGame.current.move(history[i]);
    }

    setFen(chessGame.current.fen());
    setCurrentIndex(index);

    if (index >= 0 && history[index]) {
      setLastMove({
        from: history[index].from,
        to: history[index].to
      });
    } else {
      setLastMove(null);
    }

    // バリエーションモードを解除
    if (isInVariationMode) {
      setIsInVariationMode(false);
      setSavedHistoryPosition(null);
    }
  };

  // 駒を手動で動かすハンドラー
  const handlePieceDrop = (sourceSquare, targetSquare) => {
    try {
      // バリエーションモードに入る前に現在位置を保存
      if (!isInVariationMode) {
        setIsInVariationMode(true);
        setSavedHistoryPosition(currentIndex);
      }

      const move = chessGame.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q', // 常にクイーンに昇格
      });

      if (move === null) return false;

      setFen(chessGame.current.fen());
      setLastMove({
        from: sourceSquare,
        to: targetSquare
      });

      // 新しい局面を解析
      if (analyzePosition) {
        analyzePosition(chessGame.current.fen(), 15);
      }

      return true;
    } catch (error) {
      return false;
    }
  };

  // 記録された棋譜位置に戻る
  const returnToHistory = () => {
    if (savedHistoryPosition !== null) {
      jumpToMove(savedHistoryPosition);
    }
    setIsInVariationMode(false);
    setSavedHistoryPosition(null);
  };

  // 全ての手を解析
  const analyzeAllMoves = async (moves) => {
    if (!engineReady) {
      setErrorMessage("Stockfishエンジンが準備できていません。");
      return;
    }
    
    setIsAnalyzingAll(true);
    setAnalysisProgress(0);
    const tempChess = new Chess();
    let pool = null;
    
    try {
      pool = new StockfishWorkerPool({
        size: 4,
        thinkingTime: 1000,
        depth: 15,
        skillLevel: 20,
        timeoutMs: 6000,
      });

      const fenJobs = [];
      tempChess.reset();
      const initialFen = tempChess.fen();
      fenJobs.push({ index: -1, fen: initialFen });

      for (let i = 0; i < moves.length; i++) {
        tempChess.move(moves[i]);
        fenJobs.push({ index: i, fen: tempChess.fen() });
      }

      await pool.init();

      const totalJobs = fenJobs.length;
      const results = await pool.analyzeBatch(fenJobs, {
        onProgress: (completed) => {
          setAnalysisProgress(Math.round((completed / totalJobs) * 100));
        },
      });

      const newAnalysisData = {};

      results.forEach((res) => {
        if (!res) return;
        const { job, evaluation, bestMove, depth } = res;
        const normalizedEval =
          normalizeEvaluationForWhitePerspective(evaluation ?? 0, job.fen) ?? 0;
        newAnalysisData[job.index] = {
          fen: job.fen,
          evaluation: normalizedEval,
          bestMove: bestMove || null,
          depth: depth || 15,
        };
      });

      if (!newAnalysisData[-1]) {
        const initialResult = results.find((res) => res?.job.index === -1);
        const fallbackEval =
          normalizeEvaluationForWhitePerspective(initialResult?.evaluation ?? 0, initialFen) ?? 0;
        newAnalysisData[-1] = {
          fen: initialFen,
          evaluation: fallbackEval,
          bestMove: initialResult?.bestMove || null,
          depth: initialResult?.depth || 15,
        };
      }

      for (let i = 0; i < moves.length; i++) {
        if (!newAnalysisData[i]) {
          const fenEntry = fenJobs.find((job) => job.index === i);
          const prevEval = i > 0 ? newAnalysisData[i - 1]?.evaluation : newAnalysisData[-1]?.evaluation;
          newAnalysisData[i] = {
            fen: fenEntry?.fen || "",
            evaluation: prevEval ?? 0,
            bestMove: null,
            depth: 0,
            previousEval: prevEval ?? 0,
          };
        } else {
          const prevEval = i > 0 ? newAnalysisData[i - 1]?.evaluation : newAnalysisData[-1]?.evaluation;
          newAnalysisData[i].previousEval = prevEval ?? 0;
        }
      }

      setAllMovesAnalysis(newAnalysisData);
      generateAllExplanations(moves, newAnalysisData);
      setAnalysisProgress(100);


    } catch (error) {
      console.error("Analysis error:", error);
      setErrorMessage("解析中にエラーが発生しました。");
    } finally {
      if (pool) {
        pool.terminate();
        pool = null;
      }
      setIsAnalyzingAll(false);
      setAnalysisProgress(0);
      stopAnalysis(); // 解析を停止
    }
  };
  
  // 全ての手の説明を生成
  const generateAllExplanations = (moves, analysisData) => {
    const explanations = {};
    
    moves.forEach((move, index) => {
      const currentAnalysis = analysisData[index];
      const previousAnalysis = index > 0 ? analysisData[index - 1] : analysisData[-1];
      
      if (currentAnalysis && previousAnalysis) {
        // 実際にプレイされた手と最善手を比較
        const playedMove = move.from + move.to + (move.promotion || '');
        const wasBestMove = previousAnalysis.bestMove && 
                           (previousAnalysis.bestMove === playedMove || 
                            previousAnalysis.bestMove.startsWith(playedMove));
        
        const currentEvalNum = evaluationToNumber(currentAnalysis.evaluation);
        const previousEvalNum = evaluationToNumber(previousAnalysis.evaluation);
        const evalChange = currentEvalNum - previousEvalNum;
        
        // 手の品質を判定（最善手の場合は特別扱い）
        const moveQuality = wasBestMove ? 
          { quality: 'best', symbol: '!', color: 'text-green-400' } :
          getMoveQualityFromEval(evalChange, index % 2 === 0);
        
        const stockfishData = {
          evalChange: evalChange,
          bestMove: previousAnalysis.bestMove,
          playedMove: playedMove,
          depth: currentAnalysis.depth,
          currentEval: currentAnalysis.evaluation,
          previousEval: previousAnalysis.evaluation,
          wasBestMove: wasBestMove
        };
        
        const explanation = moveAnalyzer.current.analyzeMoveNaturalLanguage(
          currentAnalysis.fen,
          move,
          previousAnalysis.fen,
          moveQuality,
          stockfishData
        );
        
        explanations[index] = explanation;
      }
    });
    
    setMoveExplanations(explanations);
    setMoveEvaluations(Object.keys(analysisData).reduce((acc, key) => {
      if (key !== '-1' && key >= 0) {
        const move = moves[parseInt(key)];
        const prevAnalysis = key > 0 ? analysisData[key - 1] : analysisData[-1];
        const playedMove = move ? move.from + move.to + (move.promotion || '') : '';
        const wasBestMove = prevAnalysis?.bestMove && 
                           (prevAnalysis.bestMove === playedMove || 
                            prevAnalysis.bestMove.startsWith(playedMove));
        
        acc[key] = {
          evaluation: analysisData[key].evaluation,
          previousEvaluation: analysisData[key].previousEval,
          wasBestMove: wasBestMove
        };
      }
      return acc;
    }, {}));
  };
  
  // 評価値を数値に変換するヘルパー関数
  const evaluationToNumber = (evalValue) => {
    if (typeof evalValue === 'number') return evalValue;
    if (typeof evalValue === 'string') {
      // メイト表記の処理
      if (evalValue.startsWith('M')) {
        const mateBody = evalValue.substring(1);
        const mateIn = parseInt(mateBody, 10);
        if (mateIn === 0) {
          if (mateBody.startsWith('+')) return 100;
          if (mateBody.startsWith('-')) return -100;
          return 0;
        }
        // メイトの場合は大きな値として扱う (符号付き)
        return mateIn > 0 ? 100 - Math.abs(mateIn) : -100 + Math.abs(mateIn);
      }
    }
    return 0; // デフォルト値
  };

  // 評価値から手の品質を判定
  const getMoveQualityFromEval = (evalChange, isWhiteMove) => {
    const adjustedDiff = isWhiteMove ? evalChange : -evalChange;
    
    if (adjustedDiff >= -0.2) return { quality: 'good', symbol: '', color: 'text-slate-500' };
    if (adjustedDiff >= -0.5) return { quality: 'ok', symbol: '', color: 'text-slate-500' };
    if (adjustedDiff >= -1.0) return { quality: 'inaccuracy', symbol: '?!', color: 'text-amber-500' };
    if (adjustedDiff >= -3.0) return { quality: 'mistake', symbol: '?', color: 'text-orange-500' };
    return { quality: 'blunder', symbol: '??', color: 'text-red-500' };
  };
  
  // 現在表示している局面の解析データを取得して、説明を更新
  useEffect(() => {
    if (currentIndex >= -1 && allMovesAnalysis[currentIndex]) {
      // 現在の局面の解析データがあれば、UI更新のみ
      // (説明は既に generateAllExplanations で生成済み)
    }
  }, [currentIndex, allMovesAnalysis]);
  
  // 手の品質を判定
  const getMoveQuality = (moveIndex) => {
    const moveEval = moveEvaluations[moveIndex];
    if (!moveEval || moveEval.previousEvaluation === null) return null;
    
    // 最善手を指した場合は特別扱い
    if (moveEval.wasBestMove) {
      return { quality: 'best', symbol: '!', color: 'text-green-400' };
    }
    
    const currentEvalNum = evaluationToNumber(moveEval.evaluation);
    const previousEvalNum = evaluationToNumber(moveEval.previousEvaluation);
    const evalDiff = currentEvalNum - previousEvalNum;
    const isWhiteMove = moveIndex % 2 === 0;
    
    // 評価値は常に白視点で保存されている（正の値=白有利、負の値=黒有利）
    // 白の手番の場合: evalDiff > 0 なら白に有利になった（良い手）
    // 黒の手番の場合: evalDiff < 0 なら黒に有利になった（良い手）
    const adjustedDiff = isWhiteMove ? evalDiff : -evalDiff;
    
    // 閾値を調整（より適切な判定のため）
    if (adjustedDiff >= -0.2) return { quality: 'good', symbol: '', color: 'text-slate-500' };
    if (adjustedDiff >= -0.5) return { quality: 'ok', symbol: '', color: 'text-slate-500' };
    if (adjustedDiff >= -1.0) return { quality: 'inaccuracy', symbol: '?!', color: 'text-amber-500' };
    if (adjustedDiff >= -3.0) return { quality: 'mistake', symbol: '?', color: 'text-orange-500' };
    return { quality: 'blunder', symbol: '??', color: 'text-red-500' };
  };

  // 評価値の表示形式を整える
  const formatEvaluation = (eval_) => {
    if (eval_ === null || eval_ === undefined) return "0.00";
    if (typeof eval_ === "string") {
      if (eval_ === "M+0" || eval_ === "M-0") return "M0";
      if (eval_.startsWith('M+')) return `M${eval_.substring(2)}`;
      return eval_;
    }
    if (typeof eval_ === "number") return eval_.toFixed(2);
    return "0.00";
  };

  // 評価バーの幅を計算
  const getEvalBarWidth = () => {
    if (!evaluation) return 50;
    if (typeof evaluation === "string") {
      // メイト表記の場合
      return evaluation.startsWith("M") ? 100 : 0;
    }
    // 評価値を-10から+10の範囲に制限してパーセンテージに変換
    const clampedEval = Math.max(-10, Math.min(10, evaluation));
    return 50 + (clampedEval * 5);
  };
  
  // 特定の評価値に対するバーの幅を計算
  const getEvalBarWidthForValue = (evalValue) => {
    if (!evalValue && evalValue !== 0) return 50;
    const numericEval = evaluationToNumber(evalValue);
    // 評価値を-10から+10の範囲に制限してパーセンテージに変換
    const clampedEval = Math.max(-10, Math.min(10, numericEval));
    return 50 + (clampedEval * 5);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-white via-slate-100 to-slate-200 text-slate-900">
      <div className="absolute inset-0 opacity-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(15,23,42,0.06) 35px, rgba(15,23,42,0.06) 70px)`,
          }}
        />
      </div>
      <div
        className="absolute inset-0 opacity-50 blur-3xl"
        style={{
          background: `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(59, 130, 246, 0.25), transparent 55%)`,
        }}
      />
      <div className="relative z-10 flex h-screen overflow-hidden">
        {/* 左サイドバー */}
        <div className="w-60 md:w-64 lg:w-72 xl:w-80 bg-white/95 border-r border-slate-200 p-4 overflow-y-auto flex-shrink-0">
          {/* タイトル */}
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900">
              棋譜解析
            </h1>
            <p className="text-slate-600 text-sm mt-1">PGN形式の棋譜を解析</p>
          </div>

          {/* ホームに戻るボタン */}
          <button
            onClick={() => router.push("/")}
            className="w-full mb-3 group relative bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
          >
            ← ホームに戻る
          </button>

          {/* 反転ボタン */}
          <button
            onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
            className="w-full mb-6 group relative bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
          >
            🔄 盤面を反転
          </button>

          {/* PGN入力エリア */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2 text-slate-800">
              📝 PGN入力
            </h3>
            <textarea
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              placeholder="PGN形式の棋譜を貼り付け..."
              rows="6"
              className="w-full p-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none font-mono text-xs"
              disabled={isLoadingPgn}
            />
          </div>

          {/* 解析ボタン */}
          <div className="mb-4 flex flex-col gap-2">
            <button
              onClick={loadPgn}
              className="w-full group relative bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoadingPgn || isAnalyzingAll}
            >
              {isLoadingPgn ? "読み込み中..." : "PGNを読み込む"}
            </button>

            <button
              onClick={() => analyzeAllMoves(history)}
              className="w-full group relative bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
              disabled={!engineReady || history.length === 0 || isAnalyzingAll || (allMovesAnalysis && Object.keys(allMovesAnalysis).length > 0)}
              title={history.length === 0 ? "PGNを読み込むと解析可能" : (allMovesAnalysis && Object.keys(allMovesAnalysis).length > 0) ? "既に解析済みです" : ""}
            >
              <span className="flex items-center justify-center gap-1 text-sm">
                <span>📊</span>
                {isAnalyzingAll ? `解析中 ${analysisProgress}%` : "全手を詳細解析"}
              </span>
            </button>
          </div>

          {/* ステータス表示 */}
          <div className="mb-4">
            {errorMessage && (
              <p className="text-red-500 text-xs mb-2">{errorMessage}</p>
            )}
            {engineReady && !isAnalyzingAll && (
              <div className="text-emerald-600 text-xs flex items-center">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
                エンジン準備完了
              </div>
            )}
            {isAnalyzingAll && (
              <div className="text-blue-600 text-xs">
                <div className="flex items-center gap-2 mb-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                  <span>全手解析中... {analysisProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${analysisProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* メインコンテンツ */}
        <div className="flex-1 p-4 h-full overflow-hidden flex items-center justify-center">
          <div className="h-full flex gap-4 items-center">
        {/* 中央：チェス盤 */}
        <div className="flex-shrink-0">
          <div className="bg-white/90 rounded-xl shadow-lg p-2 border border-slate-200">
            {/* 上側の取得駒（白視点なら黒、黒視点なら白） */}
            {fen && fen !== "start" && (() => {
              const capturedInfo = getCapturedPieces(fen);
              const isWhiteOrientation = boardOrientation === 'white';
              const topCaptured = isWhiteOrientation ? capturedInfo.black : capturedInfo.white;
              const topAdvantage = isWhiteOrientation ? -capturedInfo.advantage : capturedInfo.advantage;
              const topPieceColor = isWhiteOrientation ? 'w' : 'b';

              return (
                <div className="mb-2 bg-slate-50 rounded-lg p-2 border border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{isWhiteOrientation ? '黒' : '白'}:</span>
                    <div className="flex items-center gap-1">
                      {Object.keys(topCaptured).length > 0 ? (
                        <>
                          {Object.entries(topCaptured).map(([piece, count]) =>
                            Array.from({ length: count }).map((_, i) => (
                              <img
                                key={`${piece}-${i}`}
                                src={PIECE_IMAGES[topPieceColor][piece]}
                                alt={piece}
                                className="w-6 h-6"
                              />
                            ))
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">―</span>
                      )}
                    </div>
                    <span className={`text-sm font-semibold ${topAdvantage > 0 ? 'text-slate-800' : topAdvantage < 0 ? 'text-slate-400' : 'text-slate-500'}`}>
                      {topAdvantage > 0 ? '+' : ''}{topAdvantage}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div ref={boardWrapperRef} className="w-full flex justify-center">
              <Chessboard
                position={fen}
                arePiecesDraggable={true}
                onPieceDrop={handlePieceDrop}
                boardWidth={dynamicBoardWidth}
                boardOrientation={boardOrientation}
                customDarkSquareStyle={{ backgroundColor: "#1e3a5f" }}
                customLightSquareStyle={{ backgroundColor: "#e8eef5" }}
                customSquareStyles={(() => {
                  const styles = {};
                  
                  // Get the best move from the previous position
                  const previousBestMove = currentIndex > 0 
                    ? allMovesAnalysis[currentIndex - 1]?.bestMove 
                    : allMovesAnalysis[-1]?.bestMove;
                  
                  // Check if the played move matches the best move
                  const wasPlayedMoveBest = lastMove && previousBestMove && 
                    lastMove.from === previousBestMove.substring(0, 2) && 
                    lastMove.to === previousBestMove.substring(2, 4);
                  
                  // Highlight the played move
                  if (lastMove) {
                    if (wasPlayedMoveBest) {
                      // Light blue for moves that were the best move
                      styles[lastMove.from] = { backgroundColor: "rgba(100, 200, 255, 0.5)" };
                      styles[lastMove.to] = { backgroundColor: "rgba(100, 200, 255, 0.5)" };
                    } else {
                      // Yellow for regular moves
                      styles[lastMove.from] = { backgroundColor: "rgba(255, 255, 0, 0.4)" };
                      styles[lastMove.to] = { backgroundColor: "rgba(255, 255, 0, 0.4)" };
                    }
                  }
                  
                  // Show what the best move was (if different from played move)
                  if (previousBestMove && !wasPlayedMoveBest && currentIndex > 0) {
                    // Purple fill for the best move that should have been played
                    styles[previousBestMove.substring(0, 2)] = { 
                      backgroundColor: "rgba(139, 92, 246, 0.45)"
                    };
                    styles[previousBestMove.substring(2, 4)] = { 
                      backgroundColor: "rgba(139, 92, 246, 0.45)"
                    };
                  }
                  
                  // Highlight the best move suggestion for current position (green)
                  const currentBestMove = allMovesAnalysis[currentIndex]?.bestMove || bestMove;
                  if (currentBestMove) {
                    styles[currentBestMove.substring(0, 2)] = { 
                      backgroundColor: "rgba(0, 255, 0, 0.3)",
                      border: "2px solid #00ff00"
                    };
                    styles[currentBestMove.substring(2, 4)] = { 
                      backgroundColor: "rgba(0, 255, 0, 0.3)",
                      border: "2px solid #00ff00"
                    };
                  }
                  
                  return styles;
                })()}
              />
            </div>

            {/* 下側の取得駒（白視点なら白、黒視点なら黒） */}
            {fen && fen !== "start" && (() => {
              const capturedInfo = getCapturedPieces(fen);
              const isWhiteOrientation = boardOrientation === 'white';
              const bottomCaptured = isWhiteOrientation ? capturedInfo.white : capturedInfo.black;
              const bottomAdvantage = isWhiteOrientation ? capturedInfo.advantage : -capturedInfo.advantage;
              const bottomPieceColor = isWhiteOrientation ? 'b' : 'w';

              return (
                <div className="mt-2 bg-slate-50 rounded-lg p-2 border border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{isWhiteOrientation ? '白' : '黒'}:</span>
                    <div className="flex items-center gap-1">
                      {Object.keys(bottomCaptured).length > 0 ? (
                        <>
                          {Object.entries(bottomCaptured).map(([piece, count]) =>
                            Array.from({ length: count }).map((_, i) => (
                              <img
                                key={`${piece}-${i}`}
                                src={PIECE_IMAGES[bottomPieceColor][piece]}
                                alt={piece}
                                className="w-6 h-6"
                              />
                            ))
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">―</span>
                      )}
                    </div>
                    <span className={`text-sm font-semibold ${bottomAdvantage > 0 ? 'text-blue-600' : bottomAdvantage < 0 ? 'text-slate-400' : 'text-slate-500'}`}>
                      {bottomAdvantage > 0 ? '+' : ''}{bottomAdvantage}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* ナビゲーションボタン */}
            <div className="grid grid-cols-4 gap-2 mt-2">
              <button
                onClick={() => navigateMoves("first")}
                className="group relative bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                disabled={isLoadingPgn || (currentIndex === -1 && history.length === 0)}
              >
                <span className="flex items-center justify-center gap-1">
                  <span className="text-lg">⏮️</span>
                  <span className="text-xs hidden sm:inline">最初</span>
                </span>
                <div className="absolute inset-0 rounded-xl bg-blue-100/0 group-hover:bg-blue-100/40 transition-all duration-200"></div>
              </button>
              <button
                onClick={() => navigateMoves("prev")}
                className="group relative bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                disabled={isLoadingPgn || currentIndex < 0}
              >
                <span className="flex items-center justify-center gap-1">
                  <span className="text-lg">◀️</span>
                  <span className="text-xs hidden sm:inline">戻る</span>
                </span>
                <div className="absolute inset-0 rounded-xl bg-blue-100/0 group-hover:bg-blue-100/40 transition-all duration-200"></div>
              </button>
              <button
                onClick={() => navigateMoves("next")}
                className="group relative bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                disabled={isLoadingPgn || currentIndex >= history.length - 1}
              >
                <span className="flex items-center justify-center gap-1">
                  <span className="text-xs hidden sm:inline">進む</span>
                  <span className="text-lg">▶️</span>
                </span>
                <div className="absolute inset-0 rounded-xl bg-blue-100/0 group-hover:bg-blue-100/40 transition-all duration-200"></div>
              </button>
              <button
                onClick={() => navigateMoves("last")}
                className="group relative bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 font-semibold py-3 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                disabled={isLoadingPgn || history.length === 0 || currentIndex === history.length - 1}
              >
                <span className="flex items-center justify-center gap-1">
                  <span className="text-xs hidden sm:inline">最後</span>
                  <span className="text-lg">⏭️</span>
                </span>
                <div className="absolute inset-0 rounded-xl bg-blue-100/0 group-hover:bg-blue-100/40 transition-all duration-200"></div>
              </button>
            </div>
            
            {/* 色の凡例 */}
            <div className="mt-3 flex flex-wrap gap-3 justify-center text-xs">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgba(100, 200, 255, 0.5)" }}></div>
                <span className="text-slate-600">最善手でした</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgba(255, 255, 0, 0.4)" }}></div>
                <span className="text-slate-600">指した手</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgba(124, 58, 237, 0.7)" }}></div>
                <span className="text-slate-600">最善手だった</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgba(0, 255, 0, 0.3)", border: "2px solid #00ff00" }}></div>
                <span className="text-slate-600">現在の推奨手</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右側：解析パネル */}
        <div className="w-60 md:w-64 lg:w-72 xl:w-80 flex-shrink-0 h-full overflow-y-auto">
          {/* バリエーションモード警告 */}
          {isInVariationMode && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex flex-col gap-2">
                <span className="text-amber-600 text-sm">⚠️ 棋譜から外れています</span>
                <button
                  onClick={returnToHistory}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-1.5 px-3 rounded transition-all w-full"
                >
                  棋譜に戻る
                </button>
              </div>
            </div>
          )}

          <div className="bg-red-50 rounded-xl shadow-lg p-4 border border-red-200">
            <h3 className="text-lg font-semibold mb-3 flex items-center justify-between text-slate-800">
              <span className="flex items-center">
                <span className="mr-2">🔍</span> エンジン解析
              </span>
              {/* 解析状態の表示 */}
              {allMovesAnalysis && Object.keys(allMovesAnalysis).length > 0 && (
                <div className="text-xs text-emerald-600 flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span>全ての手を解析済み</span>
                </div>
              )}
            </h3>

            <EvaluationGraph
              analysisData={allMovesAnalysis}
              history={history}
              currentIndex={currentIndex}
              onSelectMove={jumpToMove}
              evaluationToNumber={evaluationToNumber}
              formatEvaluation={formatEvaluation}
            />

            {/* 現在の局面の評価バー */}
            {(currentIndex >= -1 && allMovesAnalysis[currentIndex]) || (isInVariationMode && evaluation !== null) ? (
              <div className="mb-4 mt-6">
                <div className="h-8 bg-slate-800 rounded-lg overflow-hidden relative border border-slate-300">
                  <div
                    className="h-full bg-white transition-all duration-500"
                    style={{ width: `${(() => {
                      // バリエーションモード中は現在の評価値を使用、それ以外は解析データを使用
                      const eval_ = isInVariationMode ? evaluation : allMovesAnalysis[currentIndex].evaluation;
                      // 評価値は常に白視点で保存されているので、そのまま使用
                      return getEvalBarWidthForValue(eval_);
                    })()}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
                    <span className="bg-green-500 text-white px-2 py-0.5 rounded">
                      {isInVariationMode ? formatEvaluation(evaluation) : formatEvaluation(allMovesAnalysis[currentIndex].evaluation)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>黒優勢</span>
                  <span>白優勢</span>
                </div>
              </div>
            ) : null}

            {/* メトリクス情報 */}
            {allMovesAnalysis && Object.keys(allMovesAnalysis).length > 0 && (
              <div className="space-y-3">

              {/* 手の評価 */}
              {currentIndex >= 0 && (
                <div className="bg-gradient-to-br from-slate-50 to-white rounded-lg p-3 border border-slate-200">
                  {(() => {
                    const quality = getMoveQuality(currentIndex);
                    const moveEval = moveEvaluations[currentIndex];
                    return quality && moveEval && moveEval.previousEvaluation !== null ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${quality.color}`}>{history[currentIndex].san}</span>
                          {quality.symbol && (
                            <span className={`font-bold ${quality.color}`}>{quality.symbol}</span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            quality.quality === 'best' ? 'bg-emerald-100 text-emerald-700' :
                            quality.quality === 'good' ? 'bg-emerald-50 text-emerald-700' :
                            quality.quality === 'ok' ? 'bg-slate-200 text-slate-600' :
                            quality.quality === 'inaccuracy' ? 'bg-amber-100 text-amber-700' :
                            quality.quality === 'mistake' ? 'bg-orange-100 text-orange-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {quality.quality === 'best' ? '最善手' :
                             quality.quality === 'good' ? '良い手' :
                             quality.quality === 'ok' ? '普通' :
                             quality.quality === 'inaccuracy' ? '不正確' :
                             quality.quality === 'mistake' ? 'ミス' :
                             'ブランダー'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-sm font-mono">
                          <span className="text-slate-500">{formatEvaluation(moveEval.previousEvaluation)}</span>
                          <span className="text-slate-400">→</span>
                          <span className="text-slate-800">{formatEvaluation(moveEval.evaluation)}</span>
                          <span className={`${
                            (evaluationToNumber(moveEval.evaluation) - evaluationToNumber(moveEval.previousEvaluation)) *
                            (currentIndex % 2 === 0 ? 1 : -1) >= 0
                              ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            ({(evaluationToNumber(moveEval.evaluation) - evaluationToNumber(moveEval.previousEvaluation) >= 0 ? '+' : '')}
                            {(evaluationToNumber(moveEval.evaluation) - evaluationToNumber(moveEval.previousEvaluation)).toFixed(2)})
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 text-center">
                        解析データがありません
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
          </div>

          {/* 手のリストパネル */}
          <div className="bg-white/90 rounded-xl shadow-lg p-4 border border-slate-200 mt-4">
            <h3 className="text-lg font-semibold mb-3 flex items-center text-slate-800">
              <span className="mr-2">📋</span> 棋譜
            </h3>
            <div ref={moveListRef} className="max-h-64 overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-slate-500 text-center py-4">棋譜が読み込まれていません</p>
              ) : (
                <div>
                  {/* 初期位置 */}
                  <button
                    id="move-initial"
                    onClick={() => jumpToMove(-1)}
                    className={`w-full text-left px-3 py-2 rounded-lg mb-2 transition font-medium ${
                      currentIndex === -1
                        ? "bg-blue-600 text-white ring-2 ring-blue-400"
                        : "hover:bg-slate-100 text-slate-600"
                    }`}
                  >
                    初期位置
                  </button>
                  {/* 2列表示の棋譜 */}
                  <div className="space-y-1">
                    {Array.from({ length: Math.ceil(history.length / 2) }).map((_, rowIndex) => {
                      const whiteIndex = rowIndex * 2;
                      const blackIndex = rowIndex * 2 + 1;
                      const whiteMove = history[whiteIndex];
                      const blackMove = history[blackIndex];
                      const whiteQuality = getMoveQuality(whiteIndex);
                      const blackQuality = blackMove ? getMoveQuality(blackIndex) : null;

                      return (
                        <div key={rowIndex} className="flex items-stretch gap-1">
                          {/* 手番号 */}
                          <div className="w-8 flex-shrink-0 flex items-center justify-center text-sm font-semibold text-slate-400">
                            {rowIndex + 1}.
                          </div>
                          {/* 白の手 */}
                          <button
                            id={`move-${whiteIndex}`}
                            onClick={() => jumpToMove(whiteIndex)}
                            className={`flex-1 text-left px-3 py-2 rounded-lg transition font-mono text-base ${
                              currentIndex === whiteIndex
                                ? "bg-blue-600 text-white ring-2 ring-blue-400 font-bold"
                                : "bg-slate-50 hover:bg-slate-100 text-slate-800"
                            }`}
                          >
                            <span className="flex items-center justify-between">
                              <span>{whiteMove.san}</span>
                              {whiteQuality && whiteQuality.symbol && (
                                <span className={`font-bold ${currentIndex === whiteIndex ? 'text-white' : whiteQuality.color}`}>
                                  {whiteQuality.symbol}
                                </span>
                              )}
                            </span>
                          </button>
                          {/* 黒の手 */}
                          {blackMove ? (
                            <button
                              id={`move-${blackIndex}`}
                              onClick={() => jumpToMove(blackIndex)}
                              className={`flex-1 text-left px-3 py-2 rounded-lg transition font-mono text-base ${
                                currentIndex === blackIndex
                                  ? "bg-blue-600 text-white ring-2 ring-blue-400 font-bold"
                                  : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                              }`}
                            >
                              <span className="flex items-center justify-between">
                                <span>{blackMove.san}</span>
                                {blackQuality && blackQuality.symbol && (
                                  <span className={`font-bold ${currentIndex === blackIndex ? 'text-white' : blackQuality.color}`}>
                                    {blackQuality.symbol}
                                  </span>
                                )}
                              </span>
                            </button>
                          ) : (
                            <div className="flex-1"></div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
