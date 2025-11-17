"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ChessBoard from "@/app/components/ChessBoard";
import useChess from "@/app/hooks/useChess";
import useStockfish from "@/app/hooks/useStockfish";

function GamePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mode = searchParams.get("mode"); // bot or local

  const { fen, move, isGameOver, resetGame, history, getLegalMoves, chess, undo, goToStart } =
    useChess();

  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [gameResult, setGameResult] = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState(5);
  const [gameStarted, setGameStarted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hintMove, setHintMove] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Calculate thinking time and depth based on difficulty
  const getEngineSettings = (difficulty) => {
    if (difficulty <= 5) {
      return { thinkingTime: 100, maxDepth: 5 };
    } else if (difficulty <= 10) {
      return { thinkingTime: 300, maxDepth: 8 };
    } else if (difficulty <= 15) {
      return { thinkingTime: 700, maxDepth: 12 };
    } else {
      return { thinkingTime: 1000, maxDepth: 20 };
    }
  };

  const engineSettings = getEngineSettings(selectedDifficulty);

  const {
    isReady: isEngineReady,
    isAnalyzing,
    bestMove,
    analyzePosition,
    stopAnalysis,
    currentDifficulty,
    setDifficulty,
  } = useStockfish({
    difficulty: selectedDifficulty,
    thinkingTime: engineSettings.thinkingTime,
  });

  // Separate Stockfish instance for hints (always at full strength)
  const {
    isReady: isHintEngineReady,
    isAnalyzing: isAnalyzingHint,
    bestMove: hintBestMove,
    analyzePosition: analyzeHintPosition,
    stopAnalysis: stopHintAnalysis,
  } = useStockfish({
    difficulty: 20,
    thinkingTime: 1000,
  });

  useEffect(() => {
    if (selectedSquare) {
      const moves = getLegalMoves(selectedSquare);
      setLegalMoves(moves);
    } else {
      setLegalMoves([]);
    }
  }, [selectedSquare, getLegalMoves]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    if (isGameOver()) {
      const result = getGameResult();
      setGameResult(result);
    }
  }, [fen, isGameOver]);

  const getGameResult = useCallback(() => {
    if (!isGameOver()) return null;
    if (chess.isCheckmate()) {
      return chess.turn() === "w"
        ? "黒の勝利！チェックメイト！"
        : "白の勝利！チェックメイト！";
    }
    if (chess.isDraw()) {
      if (chess.isStalemate()) return "ステイルメイト！引き分けです。";
      if (chess.isThreefoldRepetition()) return "同一局面3回！引き分けです。";
      if (chess.isInsufficientMaterial()) return "駒不足！引き分けです。";
      return "引き分けです。";
    }
    return null;
  }, [isGameOver, chess]);

  const getCheckStatus = useCallback(() => {
    if (chess.isCheck()) {
      return chess.turn() === "w"
        ? "白がチェックされています"
        : "黒がチェックされています";
    }
    return null;
  }, [chess]);

  const handleNewGame = useCallback(() => {
    resetGame();
    setGameResult(null);
    setIsPlayerTurn(true);
    setSelectedSquare(null);
    setLegalMoves([]);
    setGameStarted(false);
  }, [resetGame]);
  
  const handleStartGame = useCallback(() => {
    setDifficulty(selectedDifficulty);
    setGameStarted(true);
  }, [selectedDifficulty, setDifficulty]);

  useEffect(() => {
    if (
      mode === "bot" &&
      gameStarted &&
      isEngineReady &&
      !isAnalyzing &&
      !isPlayerTurn &&
      !gameResult
    ) {
      analyzePosition(fen, engineSettings.maxDepth);
    }
  }, [
    mode,
    gameStarted,
    isEngineReady,
    fen,
    isAnalyzing,
    analyzePosition,
    isPlayerTurn,
    gameResult,
  ]);

  useEffect(() => {
    if (
      mode === "bot" &&
      gameStarted &&
      bestMove &&
      !isAnalyzing &&
      !isPlayerTurn &&
      !gameResult
    ) {
      const result = move(bestMove.substring(0, 2), bestMove.substring(2, 4));
      if (result) {
        setIsPlayerTurn(true);
      }
    }
  }, [mode, gameStarted, bestMove, isAnalyzing, move, isPlayerTurn, gameResult]);

  // Update hint move when hint analysis completes
  useEffect(() => {
    if (showHint && hintBestMove && !isAnalyzingHint) {
      setHintMove(hintBestMove);
    }
  }, [showHint, hintBestMove, isAnalyzingHint]);

  function onDrop(sourceSquare, targetSquare, piece) {
    if (mode === "bot" && !gameStarted) return false;
    if (mode === "bot" && !isPlayerTurn) return false;
    if (mode === "bot") stopAnalysis();
    const result = move(sourceSquare, targetSquare);
    if (!result) return false;
    if (mode === "bot") setIsPlayerTurn(false);
    setSelectedSquare(null);
    setLegalMoves([]);
    
    // Turn off hint after move
    if (showHint) {
      setShowHint(false);
      setHintMove(null);
      stopHintAnalysis();
    }
    
    return true;
  }

  const onSquareClick = useCallback(
    (square) => {
      if (gameResult || (mode === "bot" && !gameStarted)) return;
      if (gameResult || (mode === "bot" && !isPlayerTurn)) return;
      setSelectedSquare(square);
    },
    [mode, isPlayerTurn, gameResult, gameStarted]
  );

  const [boardSize, setBoardSize] = useState(700);
  const boardContainerRef = useRef(null);

  // Dynamically calculate board size to fit container
  useEffect(() => {
    const calculateBoardSize = () => {
      if (boardContainerRef.current) {
        const container = boardContainerRef.current;
        const rect = container.getBoundingClientRect();
        // Calculate inner size accounting for padding (p-6 = 24px on each side = 48px total)
        const innerSize = Math.min(rect.width - 48, rect.height - 48);
        // Set board size to fill the container, with max of 752px (800px container - 48px padding)
        setBoardSize(Math.min(innerSize, 752));
      }
    };

    // Small delay to ensure container is properly rendered
    setTimeout(calculateBoardSize, 100);
    calculateBoardSize();
    window.addEventListener('resize', calculateBoardSize);
    return () => window.removeEventListener('resize', calculateBoardSize);
  }, [mode, gameStarted]);

  const handleGoHome = () => {
    router.push("/");
  };

  // Toggle hint display
  const toggleHint = useCallback(() => {
    if (!showHint && isHintEngineReady && isPlayerTurn && !gameResult) {
      // Turn on hint - analyze current position
      setShowHint(true);
      analyzeHintPosition(fen, 15);
    } else {
      // Turn off hint
      setShowHint(false);
      setHintMove(null);
      if (isAnalyzingHint) {
        stopHintAnalysis();
      }
    }
  }, [showHint, isHintEngineReady, isPlayerTurn, gameResult, fen, analyzeHintPosition, isAnalyzingHint, stopHintAnalysis]);

  const handleUndo = useCallback(() => {
    if (gameResult) return;
    
    if (mode === "bot") {
      // In bot mode, undo twice (bot's move and player's move)
      if (!isPlayerTurn) {
        // If it's bot's turn, just undo once to get back to player's turn
        const undone = undo();
        if (undone) {
          setIsPlayerTurn(true);
          stopAnalysis();
        }
      } else if (history.length >= 2) {
        // If it's player's turn, undo twice to get back to previous player's turn
        undo();
        undo();
      }
    } else {
      // In local mode, just undo once
      undo();
    }
    
    setSelectedSquare(null);
    setLegalMoves([]);
    
    // Turn off hint after undo
    if (showHint) {
      setShowHint(false);
      setHintMove(null);
      stopHintAnalysis();
    }
  }, [mode, isPlayerTurn, gameResult, history.length, undo, stopAnalysis, showHint, stopHintAnalysis]);

  const handleGoToStart = useCallback(() => {
    if (gameResult) return;
    
    goToStart();
    setIsPlayerTurn(true);
    setSelectedSquare(null);
    setLegalMoves([]);
    
    if (mode === "bot") {
      stopAnalysis();
    }
    
    // Turn off hint
    if (showHint) {
      setShowHint(false);
      setHintMove(null);
      stopHintAnalysis();
    }
  }, [gameResult, goToStart, mode, stopAnalysis, showHint, stopHintAnalysis]);

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
      <div className="relative z-10 flex min-h-screen flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-2 relative">
          <button
            onClick={handleGoHome}
            className="absolute left-0 top-0 flex items-center space-x-2 px-4 py-2 bg-white/80 backdrop-blur-sm hover:bg-white/90 text-slate-700 font-medium rounded-xl border border-slate-200/50 shadow-sm transition-all duration-200 hover:shadow-md"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <span>ホーム</span>
          </button>

          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
            対局画面
          </h1>
          <p className="text-sm text-slate-500">対戦モード: {mode}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          {mode === "bot" && (
            <div className="lg:col-span-1">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-slate-100/50">
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50/50 rounded-xl">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-600">
                        エンジン状態
                      </span>
                      <span
                        className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${
                          isEngineReady
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {isEngineReady ? "準備完了" : "準備中..."}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50/50 rounded-xl flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-600">現在の手番</span>
                    <span className="text-sm font-medium px-3 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
                      {isPlayerTurn ? "プレイヤー" : "Bot"}
                    </span>
                  </div>

                  {!gameStarted ? (
                    <div className="p-3 bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl border border-violet-200">
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-slate-700 block mb-2">
                            AIの強さを選択
                          </label>
                          
                          {/* プリセットボタン */}
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <button
                              onClick={() => setSelectedDifficulty(1)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                selectedDifficulty === 1
                                  ? "bg-green-500 text-white"
                                  : "bg-white text-slate-600 hover:bg-green-50"
                              }`}
                            >
                              入門 (1)
                            </button>
                            <button
                              onClick={() => setSelectedDifficulty(5)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                selectedDifficulty === 5
                                  ? "bg-blue-500 text-white"
                                  : "bg-white text-slate-600 hover:bg-blue-50"
                              }`}
                            >
                              初級 (5)
                            </button>
                            <button
                              onClick={() => setSelectedDifficulty(10)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                selectedDifficulty === 10
                                  ? "bg-orange-500 text-white"
                                  : "bg-white text-slate-600 hover:bg-orange-50"
                              }`}
                            >
                              中級 (10)
                            </button>
                            <button
                              onClick={() => setSelectedDifficulty(20)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                selectedDifficulty === 20
                                  ? "bg-red-500 text-white"
                                  : "bg-white text-slate-600 hover:bg-red-50"
                              }`}
                            >
                              最強 (20)
                            </button>
                          </div>
                          
                          {/* スライダー */}
                          <div className="space-y-2">
                            <input
                              type="range"
                              min="1"
                              max="20"
                              value={selectedDifficulty}
                              onChange={(e) => setSelectedDifficulty(Number(e.target.value))}
                              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                            />
                            <div className="flex justify-between text-xs text-slate-500">
                              <span>1</span>
                              <span className="font-medium text-violet-600">
                                レベル: {selectedDifficulty}
                              </span>
                              <span>20</span>
                            </div>
                          </div>
                        </div>
                        
                        <button
                          onClick={handleStartGame}
                          disabled={!isEngineReady}
                          className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-medium rounded-xl transition-all duration-200 shadow-md hover:shadow-lg disabled:cursor-not-allowed"
                        >
                          対局開始
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50/50 rounded-xl">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-600">
                          Botの難易度
                        </span>
                        <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                          {currentDifficulty}/20
                        </span>
                      </div>
                    </div>
                  )}

                  {isAnalyzing && (
                    <div className="mt-4 p-3 bg-blue-50/50 rounded-xl">
                      <div className="flex items-center justify-center space-x-2">
                        <svg
                          className="animate-spin h-4 w-4 text-blue-600"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        <span className="text-sm font-medium text-blue-700">
                          Bot思考中...
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {mode === "local" && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-100/50">
                <h3 className="text-lg font-semibold mb-4 text-slate-800">
                  ローカル対戦
                </h3>
                <div className="space-y-4">
                  <div className="p-3 bg-slate-50/50 rounded-xl flex items-center justify-between">
                    <span className="text-sm text-slate-600">現在の手番</span>
                    <span className="text-sm font-medium px-3 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
                      {chess.turn() === "w" ? "白" : "黒"}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50/50 rounded-xl flex items-center justify-between">
                    <span className="text-sm text-slate-600">手数</span>
                    <span className="text-sm font-medium px-3 py-0.5 rounded-full bg-green-100 text-green-700">
                      {Math.ceil(history.length / 2)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50/50 rounded-xl">
                    <span className="text-sm text-slate-600 block mb-2">
                      最近の手
                    </span>
                    <div className="max-h-32 overflow-y-auto">
                      {history.length > 0 ? (
                        <div className="space-y-1">
                          {history.slice(-6).map((move, index) => (
                            <div
                              key={index}
                              className="text-xs font-mono bg-white px-2 py-1 rounded"
                            >
                              {history.length - 6 + index + 1}. {move}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">
                          まだ手が指されていません
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            className={`${
              mode === "bot" || mode === "local"
                ? "lg:col-span-3"
                : "lg:col-span-4"
            } flex items-center justify-center`}
          >
            <div 
              ref={boardContainerRef}
              className={`bg-white p-6 rounded-2xl shadow-lg border border-slate-100/50 relative aspect-square w-full max-w-[800px] ${
                mode === "bot" && !gameStarted ? "opacity-60" : ""
              }`}
            >
              <div className="w-full h-full flex items-center justify-center">
                <ChessBoard
                  position={fen}
                  onPieceDrop={onDrop}
                  onSquareClick={onSquareClick}
                  boardWidth={boardSize}
                  arePiecesDraggable={mode === "local" || (mode === "bot" && gameStarted && isPlayerTurn)}
                customSquareStyles={{
                  ...(selectedSquare && {
                    [selectedSquare]: {
                      backgroundColor: "rgba(255, 255, 0, 0.4)",
                    },
                  }),
                  ...legalMoves.reduce((styles, move) => {
                    styles[move.to] = {
                      backgroundColor: "rgba(0, 255, 0, 0.4)",
                    };
                    return styles;
                  }, {}),
                  ...(showHint && hintMove && {
                    [hintMove.substring(0, 2)]: {
                      backgroundColor: "rgba(100, 150, 255, 0.5)",
                      border: "3px solid #4A90E2",
                    },
                    [hintMove.substring(2, 4)]: {
                      backgroundColor: "rgba(100, 150, 255, 0.5)",
                      border: "3px solid #4A90E2",
                    },
                  }),
                }}
                  transitionDuration={0}
                  dropOffBoard="snapback"
                />
              </div>
              {mode === "bot" && !gameStarted && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-2xl">
                  <div className="text-center">
                    <p className="text-lg font-medium text-slate-700 mb-2">AIの強さを選択してください</p>
                    <p className="text-sm text-slate-500">左のパネルから難易度を選択</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Control buttons - moved outside the column div */}
          {(mode === "local" || (mode === "bot" && gameStarted)) && !gameResult && (
            <div className={`${
              mode === "bot" || mode === "local"
                ? "lg:col-span-3"
                : "lg:col-span-4"
            }`}>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  onClick={handleGoToStart}
                  disabled={history.length === 0}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                  最初へ
                </button>
                
                <button
                  onClick={handleUndo}
                  disabled={
                    (mode === "bot" && (!isPlayerTurn || history.length === 0)) ||
                    (mode === "local" && history.length === 0)
                  }
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  一手戻る
                </button>
                
                <button
                  onClick={toggleHint}
                  disabled={!isHintEngineReady || !isPlayerTurn || mode === "local"}
                  className={`px-4 py-2 ${
                    showHint 
                      ? "bg-purple-600 hover:bg-purple-700" 
                      : "bg-gray-500 hover:bg-gray-600"
                  } disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 flex items-center gap-2`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  {showHint ? "ヒント表示中" : "ヒント"}
                  {isAnalyzingHint && showHint && (
                    <svg className="animate-spin h-3 w-3 ml-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {getCheckStatus() && !gameResult && (
          <div className="text-red-500 font-medium text-center bg-red-50/80 backdrop-blur-sm p-4 rounded-xl border border-red-100/50 shadow-sm">
            {getCheckStatus()}
          </div>
        )}

        {gameResult && (
          <div className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl p-8 text-center max-w-md mx-auto border border-slate-100/50">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-700 to-emerald-600 bg-clip-text text-transparent mb-6">
              {gameResult}
            </h2>
            <button
              onClick={handleNewGame}
              className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-medium rounded-xl shadow-md transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-opacity-50"
            >
              再対戦
            </button>
          </div>
        )}
      </div>
    </div>
  </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <GamePageInner />
    </Suspense>
  );
}
