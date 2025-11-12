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
  
  const router = useRouter();
  const chessGame = useRef(null);
  const boardWrapperRef = useRef(null);
  const latestAnalysisRef = useRef({ evaluation: null, bestMove: null, depth: null });

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

  // ボードサイズの動的調整
  useEffect(() => {
    const calculateBoardSize = () => {
      if (boardWrapperRef.current) {
        const containerWidth = boardWrapperRef.current.offsetWidth;
        // パディングを考慮してほぼ全幅を使用
        setDynamicBoardWidth(Math.min(containerWidth - 8, 800));
      }
    };
    calculateBoardSize();
    window.addEventListener("resize", calculateBoardSize);
    return () => window.removeEventListener("resize", calculateBoardSize);
  }, []);

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
  }, [currentIndex, history]);

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
      <div className="relative z-10 flex min-h-screen flex-col items-center p-4">
        {/* ヘッダー */}
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 drop-shadow-sm">
          棋譜解析
        </h1>
        <p className="text-slate-600 mt-2">PGN形式の棋譜を読み込んで解析します</p>
        <button
          onClick={() => router.push("/")}
          className="mt-3 group relative bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-2 px-6 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
        >
          ホームに戻る
        </button>
      </header>

        {/* PGN入力エリア */}
        <div className="w-full max-w-7xl mb-6">
        <div className="bg-white/90 rounded-xl shadow-lg p-6 border border-slate-200">
          <h3 className="text-xl font-semibold mb-3 flex items-center text-slate-800">
            <span className="mr-2">📝</span> PGN入力
          </h3>
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder="ここにPGN形式の棋譜を貼り付けてください..."
            rows="8"
            className="w-full p-3 bg-slate-100 text-slate-900 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none font-mono text-sm"
            disabled={isLoadingPgn}
          />
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={loadPgn}
              className="group relative bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoadingPgn || isAnalyzingAll}
            >
              <span className="relative z-10">
                {isLoadingPgn ? "読み込み中..." : 
                 isAnalyzingAll ? `解析中... ${analysisProgress}%` : 
                 "PGNを読み込む"}
              </span>
              <div className="absolute inset-0 rounded-lg bg-white/0 group-hover:bg-white/10 transition-all duration-300"></div>
            </button>
            {errorMessage && (
              <p className="text-red-500 text-sm">{errorMessage}</p>
            )}
            {engineReady && !isAnalyzingAll && (
              <span className="text-emerald-600 text-sm flex items-center">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
                エンジン準備完了
              </span>
            )}
            {isAnalyzingAll && (
              <div className="text-blue-600 text-sm">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  <span>全手解析中... {analysisProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${analysisProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左側・中央：チェス盤（より大きく） */}
        <div className="lg:col-span-2">
          <div className="bg-white/90 rounded-xl shadow-lg p-2 border border-slate-200">
            <div ref={boardWrapperRef} className="w-full aspect-square">
              <Chessboard
                position={fen}
                arePiecesDraggable={false}
                boardWidth={dynamicBoardWidth}
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
            
            {/* 全手解析ボタン */}
            {history.length > 0 && !isAnalyzingAll && (!allMovesAnalysis || Object.keys(allMovesAnalysis).length === 0) && (
              <button
                onClick={() => analyzeAllMoves(history)}
                className="mt-3 w-full group relative bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
              >
                <span className="flex items-center justify-center gap-2">
                  <span>📊</span>
                  <span>全ての手を詳細解析</span>
                </span>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/0 to-white/0 group-hover:from-white/10 group-hover:to-white/10 transition-all duration-300"></div>
              </button>
            )}
          </div>
        </div>

        {/* 右側：解析パネル */}
        <div className="lg:col-span-1">
          <div className="bg-white/90 rounded-xl shadow-lg p-4 border border-slate-200">
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
            {currentIndex >= -1 && allMovesAnalysis[currentIndex] && (
              <div className="mb-4">
                <div className="h-8 bg-slate-200 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-gray-100 to-white transition-all duration-500"
                    style={{ width: `${(() => {
                      const eval_ = allMovesAnalysis[currentIndex].evaluation;
                      // Adjust evaluation for bar display based on turn
                      const isBlackTurn = currentIndex % 2 === 0;
                      let adjustedEval = eval_;
                      
                      if (typeof eval_ === 'number') {
                        adjustedEval = isBlackTurn ? -eval_ : eval_;
                      } else if (typeof eval_ === 'string' && eval_.startsWith('M')) {
                        const mateIn = parseInt(eval_.substring(1), 10);
                        if (Number.isNaN(mateIn)) {
                          adjustedEval = 0;
                        } else if (mateIn === 0) {
                          adjustedEval = isBlackTurn ? 100 : -100;
                        } else {
                          const perspectiveMate = isBlackTurn ? -mateIn : mateIn;
                          adjustedEval = perspectiveMate > 0 ? 100 : -100;
                        }
                      }
                      
                      return getEvalBarWidthForValue(adjustedEval);
                    })()}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
                    <span className={(() => {
                      const eval_ = allMovesAnalysis[currentIndex].evaluation;
                      const isBlackTurn = currentIndex % 2 === 0;
                      let adjustedEval = eval_;
                      
                      if (typeof eval_ === 'number') {
                        adjustedEval = isBlackTurn ? -eval_ : eval_;
                      } else if (typeof eval_ === 'string' && eval_.startsWith('M')) {
                        const mateIn = parseInt(eval_.substring(1), 10);
                        if (Number.isNaN(mateIn)) {
                          adjustedEval = 0;
                        } else if (mateIn === 0) {
                          adjustedEval = isBlackTurn ? 100 : -100;
                        } else {
                          const perspectiveMate = isBlackTurn ? -mateIn : mateIn;
                          adjustedEval = perspectiveMate > 0 ? 100 : -100;
                        }
                      }
                      
                      return getEvalBarWidthForValue(adjustedEval) > 50 ? "text-slate-800" : "text-white";
                    })()}>
                      {(() => {
                        const eval_ = allMovesAnalysis[currentIndex].evaluation;
                        // Display evaluation from current player's perspective
                        // After White's move (currentIndex even), it's Black's turn, so negate
                        // After Black's move (currentIndex odd), it's White's turn, so keep as is
                        const isBlackTurn = currentIndex % 2 === 0;
                        
                        if (typeof eval_ === 'number') {
                          const displayEval = isBlackTurn ? -eval_ : eval_;
                          return displayEval.toFixed(2);
                        } else if (typeof eval_ === 'string' && eval_.startsWith('M')) {
                          // For mate evaluations, also adjust perspective
                          const mateIn = parseInt(eval_.substring(1));
                          return isBlackTurn ? `M${-mateIn}` : eval_;
                        }
                        return eval_ || '0.00';
                      })()}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>黒優勢</span>
                  <span>白優勢</span>
                </div>
              </div>
            )}

            {/* メトリクス情報 */}
            {allMovesAnalysis && Object.keys(allMovesAnalysis).length > 0 && (
              <div className="space-y-3">

              {/* 手の評価 */}
              {currentIndex >= 0 && (
                <div className="bg-gradient-to-br from-slate-50 to-white rounded-lg p-4 border border-slate-200">
                  <div className="text-sm text-slate-600 font-medium mb-3">現在の手の評価</div>
                  <div className="space-y-3">
                    {/* 手の品質 */}
                    {(() => {
                      const quality = getMoveQuality(currentIndex);
                      return quality ? (
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold flex items-center gap-2">
                            <span className={quality.color}>{history[currentIndex].san}</span>
                            {quality.symbol && (
                              <span className={`text-lg font-bold ${quality.color}`}>
                                {quality.symbol}
                              </span>
                            )}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${
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
                      ) : (
                        <div className="text-xs text-slate-500">
                          <span className="inline-block px-2 py-1 bg-slate-100 rounded">
                            前の局面を解析してから、この局面を解析してください
                          </span>
                        </div>
                      );
                    })()}
                    
                    {/* 最善手との比較 */}
                    {currentIndex > 0 && allMovesAnalysis[currentIndex - 1]?.bestMove && (
                      <div className="bg-slate-100 rounded-lg p-2 mb-2">
                        <div className="text-xs text-slate-500 mb-1">前の局面での最善手</div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono text-emerald-600">
                            {moveAnalyzer.current.convertMoveToJapanese(allMovesAnalysis[currentIndex - 1].bestMove)}
                          </span>
                          {moveEvaluations[currentIndex]?.wasBestMove && (
                            <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded">
                              最善手を指しました
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* 評価値の変化 */}
                    {moveEvaluations[currentIndex] && moveEvaluations[currentIndex].previousEvaluation !== null && (
                      <div className="bg-slate-100 rounded-lg p-2">
                        <div className="text-xs text-slate-500 mb-1">評価値の変化</div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono text-slate-700">
                            {formatEvaluation(moveEvaluations[currentIndex].previousEvaluation)}
                          </span>
                          <span className="text-slate-500">→</span>
                          <span className="text-sm font-mono font-semibold text-slate-900">
                            {formatEvaluation(moveEvaluations[currentIndex].evaluation)}
                          </span>
                          <span className={`text-sm font-semibold ${
                            (evaluationToNumber(moveEvaluations[currentIndex].evaluation) - evaluationToNumber(moveEvaluations[currentIndex].previousEvaluation)) * 
                            (currentIndex % 2 === 0 ? 1 : -1) >= 0
                              ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            ({(evaluationToNumber(moveEvaluations[currentIndex].evaluation) - evaluationToNumber(moveEvaluations[currentIndex].previousEvaluation) >= 0 ? '+' : '')}
                            {(evaluationToNumber(moveEvaluations[currentIndex].evaluation) - evaluationToNumber(moveEvaluations[currentIndex].previousEvaluation)).toFixed(2)})
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* 現在の評価 */}
                    <div className="text-xs text-slate-500">
                      {evaluation && typeof evaluation === 'number' && (
                        <span className={`inline-block px-2 py-1 rounded ${
                          evaluation > 0.5 ? 'bg-emerald-100 text-emerald-700' :
                          evaluation < -0.5 ? 'bg-red-100 text-red-700' :
                          'bg-slate-200 text-slate-700'
                        }`}>
                          {(() => {
                            // Display from current player's perspective
                            const isBlackTurn = chessGame.current?.turn() === 'b';
                            const adjustedEval = isBlackTurn ? -evaluation : evaluation;
                            return adjustedEval > 0 ? '手番優勢' : adjustedEval < 0 ? '相手優勢' : '互角';
                          })()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* 現在の局面の解析結果 */}
              {currentIndex >= -1 && allMovesAnalysis[currentIndex] && (
                <div className="bg-gradient-to-br from-slate-50 to-white rounded-lg p-4 border border-slate-200 mb-3">
                  <div className="text-sm text-slate-600 font-medium mb-2">現在の局面の評価</div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-slate-900">
                      {(() => {
                        const eval_ = allMovesAnalysis[currentIndex].evaluation;
                        // Display evaluation from current player's perspective
                        const isBlackTurn = currentIndex % 2 === 0;
                        
                        if (typeof eval_ === 'number') {
                          const displayEval = isBlackTurn ? -eval_ : eval_;
                          return displayEval.toFixed(2);
                        } else if (typeof eval_ === 'string' && eval_.startsWith('M')) {
                          const mateIn = parseInt(eval_.substring(1));
                          return isBlackTurn ? `M${-mateIn}` : eval_;
                        }
                        return eval_ || '0.00';
                      })()}
                    </span>
                    {allMovesAnalysis[currentIndex].bestMove && (
                      <span className="text-sm text-emerald-600">
                        最善手: {moveAnalyzer.current.convertMoveToJapanese(allMovesAnalysis[currentIndex].bestMove)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 自然言語による手の説明 */}
              {currentIndex >= 0 && moveExplanations[currentIndex] && (
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg p-4 border border-blue-200/60">
                  <div className="text-sm font-medium text-blue-700 mb-2 flex items-center gap-2">
                    <span>📝</span>
                    <span>手の解説</span>
                  </div>
                  
                  {/* 要約 */}
                  <div className="text-sm text-slate-700 mb-3 font-medium">
                    {moveExplanations[currentIndex].summary}
                  </div>
                  
                  {/* 詳細 */}
                  {moveExplanations[currentIndex].details.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {moveExplanations[currentIndex].details.map((detail, idx) => (
                        <div key={idx} className="text-xs text-slate-600 flex items-start gap-2 leading-relaxed">
                          <span className="text-blue-500 mt-0.5">•</span>
                          <span>{detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* キーポイント */}
                  {moveExplanations[currentIndex].keyPoints.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {moveExplanations[currentIndex].keyPoints.map((point, idx) => (
                        <span 
                          key={idx}
                          className={`text-xs px-2 py-1 rounded-full border ${
                            point === '最善手' ? 'bg-emerald-700 text-white border-emerald-900' :
                            point === '重大なミス' ? 'bg-red-100 text-red-700 border-red-200' :
                            point === 'ミス' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                            point === '決定的な手' ? 'bg-purple-100 text-purple-600 border-purple-200' :
                            'bg-blue-100 text-blue-700 border-blue-200'
                          }`}
                        >
                          {point}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

                {/* 解析統計 */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gradient-to-br from-white to-slate-100 rounded-lg p-3 border border-slate-200">
                    <div className="text-xs text-slate-500 mb-1">全手数</div>
                    <div className="font-bold text-lg text-blue-600">{history.length}</div>
                  </div>
                  <div className="bg-gradient-to-br from-white to-slate-100 rounded-lg p-3 border border-slate-200">
                    <div className="text-xs text-slate-500 mb-1">解析済み</div>
                    <div className="font-bold text-lg text-emerald-600">{Object.keys(allMovesAnalysis).length - 1}</div>
                  </div>
                  <div className="bg-gradient-to-br from-white to-slate-100 rounded-lg p-3 border border-slate-200">
                    <div className="text-xs text-slate-500 mb-1">平均深さ</div>
                    <div className="font-bold text-lg text-purple-500">
                      {Math.round(Object.values(allMovesAnalysis).reduce((sum, a) => sum + (a.depth || 0), 0) / Math.max(1, Object.keys(allMovesAnalysis).length))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 現在の局面情報 */}
          <div className="bg-white/90 rounded-xl shadow-lg p-4 border border-slate-200 mt-4">
            <h3 className="text-lg font-semibold mb-3 flex items-center text-slate-800">
              <span className="mr-2">📍</span> 現在の局面
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">手数:</span>
                <span className="font-mono text-slate-800">
                  {currentIndex === -1 ? "初期位置" : `${currentIndex + 1}手目`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">手番:</span>
                <span className="text-slate-800">{chessGame.current?.turn() === "w" ? "白番" : "黒番"}</span>
              </div>
              {currentIndex >= 0 && history[currentIndex] && (
                <div className="flex justify-between">
                  <span className="text-slate-600">最後の手:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {history[currentIndex].san}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 手のリストパネル */}
          <div className="bg-white/90 rounded-xl shadow-lg p-4 border border-slate-200 mt-4">
            <h3 className="text-lg font-semibold mb-3 flex items-center text-slate-800">
              <span className="mr-2">📋</span> 棋譜
            </h3>
            <div className="max-h-64 overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-slate-500 text-center py-4">棋譜が読み込まれていません</p>
              ) : (
                <div className="space-y-1">
                  {/* 初期位置 */}
                  <button
                    onClick={() => jumpToMove(-1)}
                    className={`w-full text-left px-2 py-1 rounded transition ${
                      currentIndex === -1
                        ? "bg-blue-600 text-white"
                        : "hover:bg-blue-50 text-slate-700"
                    }`}
                  >
                    初期位置
                  </button>
                  {/* 各手 */}
                  {history.map((move, index) => (
                    <button
                      key={index}
                      onClick={() => jumpToMove(index)}
                      className={`w-full text-left px-2 py-1 rounded transition font-mono text-sm ${
                        currentIndex === index
                          ? "bg-blue-600 text-white"
                          : "hover:bg-blue-50 text-slate-700"
                      }`}
                    >
                      <span className="flex items-center justify-between w-full">
                        <span>
                          {Math.floor(index / 2) + 1}.
                          {index % 2 === 0 ? " " : "... "}
                          {move.san}
                        </span>
                        {(() => {
                          const quality = getMoveQuality(index);
                          return quality && quality.symbol ? (
                            <span className={`font-bold ${quality.color}`}>
                              {quality.symbol}
                            </span>
                          ) : null;
                        })()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
