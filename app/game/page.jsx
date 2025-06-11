"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ChessBoard from "@/app/components/ChessBoard";
import useChess from "@/app/hooks/useChess";
import useStockfish from "@/app/hooks/useStockfish";

export default function GamePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mode = searchParams.get("mode"); // bot or local

  const { fen, move, isGameOver, resetGame, history, getLegalMoves, chess } =
    useChess();

  const [isPlayerTurn, setIsPlayerTurn] = useState(true);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [gameResult, setGameResult] = useState(null);

  const {
    isReady: isEngineReady,
    isAnalyzing,
    bestMove,
    analyzePosition,
    stopAnalysis,
    currentDifficulty,
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
  }, [resetGame]);

  useEffect(() => {
    if (
      mode === "bot" &&
      isEngineReady &&
      !isAnalyzing &&
      !isPlayerTurn &&
      !gameResult
    ) {
      analyzePosition(fen);
    }
  }, [
    mode,
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
  }, [mode, bestMove, isAnalyzing, move, isPlayerTurn, gameResult]);

  function onDrop(sourceSquare, targetSquare, piece) {
    if (mode === "bot" && !isPlayerTurn) return false;
    if (mode === "bot") stopAnalysis();
    const result = move(sourceSquare, targetSquare);
    if (!result) return false;
    if (mode === "bot") setIsPlayerTurn(false);
    setSelectedSquare(null);
    setLegalMoves([]);
    return true;
  }

  const onSquareClick = useCallback(
    (square) => {
      if (gameResult || (mode === "bot" && !isPlayerTurn)) return;
      setSelectedSquare(square);
    },
    [mode, isPlayerTurn, gameResult]
  );

  const boardWidth = 400;

  const handleGoHome = () => {
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100 flex flex-col items-center p-4 md:p-8">
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
            }`}
          >
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100/50 overflow-visible">
              <ChessBoard
                position={fen}
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                boardWidth={boardWidth}
                arePiecesDraggable={mode !== "bot" || isPlayerTurn}
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
                }}
                transitionDuration={0}
                dropOffBoard="snapback"
              />
            </div>
          </div>
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
  );
}
