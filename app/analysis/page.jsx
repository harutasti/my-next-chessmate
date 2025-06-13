// src/pages/AnalysisPage.jsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useRouter } from "next/navigation";
import useStockfish from "@/app/hooks/useStockfish";
import ChessMoveAnalyzer from "@/app/utils/chessMoveAnalyzer";

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

  // 解析を実行して結果を返すヘルパー関数
  const analyzePositionWithResult = (fen) => {
    return new Promise((resolve) => {
      let completed = false;
      
      // 解析前の値をリセット
      latestAnalysisRef.current = { evaluation: null, bestMove: null, depth: null };
      
      // 解析結果を監視する関数
      const checkResult = () => {
        if (!completed) {
          const current = latestAnalysisRef.current;
          // タイムアウト前に結果が得られたかチェック
          if (current.evaluation !== null && current.bestMove !== null && current.depth > 0) {
            completed = true;
            console.log(`Analysis complete: eval=${current.evaluation}, bestMove=${current.bestMove}, depth=${current.depth}`);
            resolve({
              evaluation: current.evaluation,
              bestMove: current.bestMove,
              depth: current.depth
            });
          } else {
            // まだ結果が揃っていない場合は100ms後に再チェック
            setTimeout(checkResult, 100);
          }
        }
      };
      
      // 解析開始
      console.log(`Starting analysis for position: ${fen}`);
      analyzePosition(fen, 15);
      
      // 結果の監視開始
      setTimeout(checkResult, 100);
      
      // タイムアウト設定（最大5秒）
      setTimeout(() => {
        if (!completed) {
          completed = true;
          const current = latestAnalysisRef.current;
          console.warn(`Analysis timeout! Using partial results: eval=${current.evaluation}, bestMove=${current.bestMove}, depth=${current.depth}`);
          // タイムアウト時は現在の値を返す（nullの場合もある）
          resolve({
            evaluation: current.evaluation || 0,
            bestMove: current.bestMove || null,
            depth: current.depth || 0
          });
        }
      }, 5000);
    });
  };

  // 全ての手を解析
  const analyzeAllMoves = async (moves) => {
    if (!engineReady) {
      setErrorMessage("Stockfishエンジンが準備できていません。");
      return;
    }
    
    setIsAnalyzingAll(true);
    setAnalysisProgress(0);
    const analysisData = {};
    const tempChess = new Chess();
    
    try {
      // 初期位置を解析
      tempChess.reset();
      const initialAnalysis = await analyzePositionWithResult(tempChess.fen());
      
      analysisData[-1] = {
        fen: tempChess.fen(),
        evaluation: initialAnalysis.evaluation || 0,
        bestMove: initialAnalysis.bestMove || null,
        depth: initialAnalysis.depth || 15
      };
      
      // 各手を順番に解析
      for (let i = 0; i < moves.length; i++) {
        tempChess.move(moves[i]);
        const currentFen = tempChess.fen();
        
        // 解析開始と結果の取得
        const analysis = await analyzePositionWithResult(currentFen);
        
        // 解析結果を保存
        analysisData[i] = {
          fen: currentFen,
          evaluation: analysis.evaluation || 0,
          bestMove: analysis.bestMove || null,
          depth: analysis.depth || 15,
          previousEval: i > 0 ? analysisData[i-1].evaluation : analysisData[-1].evaluation
        };
        
        // 進捗更新
        setAnalysisProgress(Math.round(((i + 1) / moves.length) * 100));
      }
      
      setAllMovesAnalysis(analysisData);
      
      // 全ての手の説明を生成
      generateAllExplanations(moves, analysisData);
      
    } catch (error) {
      console.error("Analysis error:", error);
      setErrorMessage("解析中にエラーが発生しました。");
    } finally {
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
        const mateIn = parseInt(evalValue.substring(1), 10);
        // メイトの場合は大きな値として扱う (符号付き)
        return mateIn > 0 ? 100 - Math.abs(mateIn) : -100 + Math.abs(mateIn);
      }
    }
    return 0; // デフォルト値
  };

  // 評価値から手の品質を判定
  const getMoveQualityFromEval = (evalChange, isWhiteMove) => {
    const adjustedDiff = isWhiteMove ? evalChange : -evalChange;
    
    if (adjustedDiff >= 0) return { quality: 'good', symbol: '!', color: 'text-green-400' };
    if (adjustedDiff >= -0.5) return { quality: 'ok', symbol: '', color: 'text-gray-400' };
    if (adjustedDiff >= -1.0) return { quality: 'inaccuracy', symbol: '?!', color: 'text-yellow-400' };
    if (adjustedDiff >= -2.0) return { quality: 'mistake', symbol: '?', color: 'text-orange-400' };
    return { quality: 'blunder', symbol: '??', color: 'text-red-400' };
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
    const adjustedDiff = isWhiteMove ? evalDiff : -evalDiff;
    
    if (adjustedDiff >= -0.3) return { quality: 'good', symbol: '', color: 'text-gray-400' };
    if (adjustedDiff >= -0.5) return { quality: 'ok', symbol: '', color: 'text-gray-400' };
    if (adjustedDiff >= -1.0) return { quality: 'inaccuracy', symbol: '?!', color: 'text-yellow-400' };
    if (adjustedDiff >= -2.0) return { quality: 'mistake', symbol: '?', color: 'text-orange-400' };
    return { quality: 'blunder', symbol: '??', color: 'text-red-400' };
  };

  // 評価値の表示形式を整える
  const formatEvaluation = (eval_) => {
    if (eval_ === null || eval_ === undefined) return "0.00";
    if (typeof eval_ === "string") return eval_;
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white flex flex-col items-center p-4">
      {/* ヘッダー */}
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
          棋譜解析
        </h1>
        <p className="text-gray-400 mt-2">PGN形式の棋譜を読み込んで解析します</p>
        <button
          onClick={() => router.push("/")}
          className="mt-3 group relative bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-2 px-6 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
        >
          ホームに戻る
        </button>
      </header>

      {/* PGN入力エリア */}
      <div className="w-full max-w-7xl mb-6">
        <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
          <h3 className="text-xl font-semibold mb-3 flex items-center">
            <span className="mr-2">📝</span> PGN入力
          </h3>
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder="ここにPGN形式の棋譜を貼り付けてください..."
            rows="8"
            className="w-full p-3 bg-gray-700 text-gray-200 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none font-mono text-sm"
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
              <p className="text-red-400 text-sm">{errorMessage}</p>
            )}
            {engineReady && !isAnalyzingAll && (
              <span className="text-green-400 text-sm flex items-center">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                エンジン準備完了
              </span>
            )}
            {isAnalyzingAll && (
              <div className="text-blue-400 text-sm">
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
                  <span>全手解析中... {analysisProgress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
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
          <div className="bg-gray-800 rounded-xl shadow-2xl p-2 border border-gray-700">
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
                      backgroundColor: "rgba(200, 150, 255, 0.4)"
                    };
                    styles[previousBestMove.substring(2, 4)] = { 
                      backgroundColor: "rgba(200, 150, 255, 0.4)"
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
                className="group relative bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                disabled={isLoadingPgn || (currentIndex === -1 && history.length === 0)}
              >
                <span className="flex items-center justify-center gap-1">
                  <span className="text-lg">⏮️</span>
                  <span className="text-xs hidden sm:inline">最初</span>
                </span>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-400/0 to-purple-400/0 group-hover:from-blue-400/10 group-hover:to-purple-400/10 transition-all duration-300"></div>
              </button>
              <button
                onClick={() => navigateMoves("prev")}
                className="group relative bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                disabled={isLoadingPgn || currentIndex < 0}
              >
                <span className="flex items-center justify-center gap-1">
                  <span className="text-lg">◀️</span>
                  <span className="text-xs hidden sm:inline">戻る</span>
                </span>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-400/0 to-purple-400/0 group-hover:from-blue-400/10 group-hover:to-purple-400/10 transition-all duration-300"></div>
              </button>
              <button
                onClick={() => navigateMoves("next")}
                className="group relative bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                disabled={isLoadingPgn || currentIndex >= history.length - 1}
              >
                <span className="flex items-center justify-center gap-1">
                  <span className="text-xs hidden sm:inline">進む</span>
                  <span className="text-lg">▶️</span>
                </span>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-400/0 to-purple-400/0 group-hover:from-blue-400/10 group-hover:to-purple-400/10 transition-all duration-300"></div>
              </button>
              <button
                onClick={() => navigateMoves("last")}
                className="group relative bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                disabled={isLoadingPgn || history.length === 0 || currentIndex === history.length - 1}
              >
                <span className="flex items-center justify-center gap-1">
                  <span className="text-xs hidden sm:inline">最後</span>
                  <span className="text-lg">⏭️</span>
                </span>
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-400/0 to-purple-400/0 group-hover:from-blue-400/10 group-hover:to-purple-400/10 transition-all duration-300"></div>
              </button>
            </div>
            
            {/* 色の凡例 */}
            <div className="mt-3 flex flex-wrap gap-3 justify-center text-xs">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgba(100, 200, 255, 0.5)" }}></div>
                <span className="text-gray-300">最善手でした</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgba(255, 255, 0, 0.4)" }}></div>
                <span className="text-gray-300">指した手</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgba(200, 150, 255, 0.4)" }}></div>
                <span className="text-gray-300">最善手だった</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: "rgba(0, 255, 0, 0.3)", border: "2px solid #00ff00" }}></div>
                <span className="text-gray-300">現在の推奨手</span>
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
          <div className="bg-gray-800 rounded-xl shadow-2xl p-4 border border-gray-700">
            <h3 className="text-lg font-semibold mb-3 flex items-center justify-between">
              <span className="flex items-center">
                <span className="mr-2">🔍</span> エンジン解析
              </span>
              {/* 解析状態の表示 */}
              {allMovesAnalysis && Object.keys(allMovesAnalysis).length > 0 && (
                <div className="text-xs text-green-400 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  <span>全ての手を解析済み</span>
                </div>
              )}
            </h3>

            {/* 現在の局面の評価バー */}
            {currentIndex >= -1 && allMovesAnalysis[currentIndex] && (
              <div className="mb-4">
                <div className="h-8 bg-gray-700 rounded-lg overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-gray-100 to-white transition-all duration-500"
                    style={{ width: `${getEvalBarWidthForValue(allMovesAnalysis[currentIndex].evaluation)}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold">
                    <span className={allMovesAnalysis[currentIndex].evaluation && getEvalBarWidthForValue(allMovesAnalysis[currentIndex].evaluation) > 50 ? "text-gray-800" : "text-gray-200"}>
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
                <div className="flex justify-between text-xs text-gray-400 mt-1">
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
                <div className="bg-gradient-to-br from-gray-700 to-gray-750 rounded-lg p-4 border border-gray-600">
                  <div className="text-sm text-gray-400 font-medium mb-3">現在の手の評価</div>
                  <div className="space-y-3">
                    {/* 手の品質 */}
                    {(() => {
                      const quality = getMoveQuality(currentIndex);
                      const moveEval = moveEvaluations[currentIndex];
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
                            quality.quality === 'best' ? 'bg-green-900 text-green-300' :
                            quality.quality === 'good' ? 'bg-green-900 text-green-300' :
                            quality.quality === 'ok' ? 'bg-gray-700 text-gray-300' :
                            quality.quality === 'inaccuracy' ? 'bg-yellow-900 text-yellow-300' :
                            quality.quality === 'mistake' ? 'bg-orange-900 text-orange-300' :
                            'bg-red-900 text-red-300'
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
                        <div className="text-xs text-gray-500">
                          <span className="inline-block px-2 py-1 bg-gray-800 rounded">
                            前の局面を解析してから、この局面を解析してください
                          </span>
                        </div>
                      );
                    })()}
                    
                    {/* 最善手との比較 */}
                    {currentIndex > 0 && allMovesAnalysis[currentIndex - 1]?.bestMove && (
                      <div className="bg-gray-800 rounded p-2 mb-2">
                        <div className="text-xs text-gray-500 mb-1">前の局面での最善手</div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono text-green-400">
                            {moveAnalyzer.current.convertMoveToJapanese(allMovesAnalysis[currentIndex - 1].bestMove)}
                          </span>
                          {moveEvaluations[currentIndex]?.wasBestMove && (
                            <span className="text-xs px-2 py-1 bg-green-900 text-green-300 rounded">
                              最善手を指しました
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* 評価値の変化 */}
                    {moveEvaluations[currentIndex] && moveEvaluations[currentIndex].previousEvaluation !== null && (
                      <div className="bg-gray-800 rounded p-2">
                        <div className="text-xs text-gray-500 mb-1">評価値の変化</div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono">
                            {formatEvaluation(moveEvaluations[currentIndex].previousEvaluation)}
                          </span>
                          <span className="text-gray-500">→</span>
                          <span className="text-sm font-mono font-semibold">
                            {formatEvaluation(moveEvaluations[currentIndex].evaluation)}
                          </span>
                          <span className={`text-sm font-semibold ${
                            (evaluationToNumber(moveEvaluations[currentIndex].evaluation) - evaluationToNumber(moveEvaluations[currentIndex].previousEvaluation)) * 
                            (currentIndex % 2 === 0 ? 1 : -1) >= 0
                              ? 'text-green-400' : 'text-red-400'
                          }`}>
                            ({(evaluationToNumber(moveEvaluations[currentIndex].evaluation) - evaluationToNumber(moveEvaluations[currentIndex].previousEvaluation) >= 0 ? '+' : '')}
                            {(evaluationToNumber(moveEvaluations[currentIndex].evaluation) - evaluationToNumber(moveEvaluations[currentIndex].previousEvaluation)).toFixed(2)})
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* 現在の評価 */}
                    <div className="text-xs text-gray-500">
                      {evaluation && typeof evaluation === 'number' && (
                        <span className={`inline-block px-2 py-1 rounded ${
                          evaluation > 0.5 ? 'bg-green-800 text-green-300' :
                          evaluation < -0.5 ? 'bg-red-800 text-red-300' :
                          'bg-gray-800 text-gray-300'
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
                <div className="bg-gradient-to-br from-gray-700 to-gray-750 rounded-lg p-4 border border-gray-600 mb-3">
                  <div className="text-sm text-gray-400 font-medium mb-2">現在の局面の評価</div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-white">
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
                      <span className="text-sm text-green-400">
                        最善手: {moveAnalyzer.current.convertMoveToJapanese(allMovesAnalysis[currentIndex].bestMove)}
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              {/* 自然言語による手の説明 */}
              {currentIndex >= 0 && moveExplanations[currentIndex] && (
                <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-lg p-4 border border-blue-700/30">
                  <div className="text-sm font-medium text-blue-300 mb-2 flex items-center gap-2">
                    <span>📝</span>
                    <span>手の解説</span>
                  </div>
                  
                  {/* 要約 */}
                  <div className="text-sm text-gray-300 mb-3 font-medium">
                    {moveExplanations[currentIndex].summary}
                  </div>
                  
                  {/* 詳細 */}
                  {moveExplanations[currentIndex].details.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {moveExplanations[currentIndex].details.map((detail, idx) => (
                        <div key={idx} className="text-xs text-gray-300 flex items-start gap-2 leading-relaxed">
                          <span className="text-blue-400 mt-0.5">•</span>
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
                            point === '最善手' ? 'bg-green-800/30 text-green-300 border-green-700/50' :
                            point === '重大なミス' ? 'bg-red-800/30 text-red-300 border-red-700/50' :
                            point === 'ミス' ? 'bg-orange-800/30 text-orange-300 border-orange-700/50' :
                            point === '決定的な手' ? 'bg-purple-800/30 text-purple-300 border-purple-700/50' :
                            'bg-blue-800/30 text-blue-300 border-blue-700/50'
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
                  <div className="bg-gradient-to-br from-gray-700 to-gray-750 rounded-lg p-3 border border-gray-600">
                    <div className="text-xs text-gray-400 mb-1">全手数</div>
                    <div className="font-bold text-lg text-blue-400">{history.length}</div>
                  </div>
                  <div className="bg-gradient-to-br from-gray-700 to-gray-750 rounded-lg p-3 border border-gray-600">
                    <div className="text-xs text-gray-400 mb-1">解析済み</div>
                    <div className="font-bold text-lg text-green-400">{Object.keys(allMovesAnalysis).length - 1}</div>
                  </div>
                  <div className="bg-gradient-to-br from-gray-700 to-gray-750 rounded-lg p-3 border border-gray-600">
                    <div className="text-xs text-gray-400 mb-1">平均深さ</div>
                    <div className="font-bold text-lg text-purple-400">
                      {Math.round(Object.values(allMovesAnalysis).reduce((sum, a) => sum + (a.depth || 0), 0) / Math.max(1, Object.keys(allMovesAnalysis).length))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 現在の局面情報 */}
          <div className="bg-gray-800 rounded-xl shadow-2xl p-4 border border-gray-700 mt-4">
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              <span className="mr-2">📍</span> 現在の局面
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">手数:</span>
                <span className="font-mono">
                  {currentIndex === -1 ? "初期位置" : `${currentIndex + 1}手目`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">手番:</span>
                <span>{chessGame.current?.turn() === "w" ? "白番" : "黒番"}</span>
              </div>
              {currentIndex >= 0 && history[currentIndex] && (
                <div className="flex justify-between">
                  <span className="text-gray-400">最後の手:</span>
                  <span className="font-mono font-semibold">
                    {history[currentIndex].san}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 手のリストパネル */}
          <div className="bg-gray-800 rounded-xl shadow-2xl p-4 border border-gray-700 mt-4">
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              <span className="mr-2">📋</span> 棋譜
            </h3>
            <div className="max-h-64 overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-gray-400 text-center py-4">棋譜が読み込まれていません</p>
              ) : (
                <div className="space-y-1">
                  {/* 初期位置 */}
                  <button
                    onClick={() => jumpToMove(-1)}
                    className={`w-full text-left px-2 py-1 rounded transition ${
                      currentIndex === -1
                        ? "bg-blue-600 text-white"
                        : "hover:bg-gray-700 text-gray-300"
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
                          : "hover:bg-gray-700 text-gray-300"
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
  );
}