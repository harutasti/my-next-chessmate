// src/pages/AnalysisPage.jsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { Chess } from "chess.js"; // chess.js v1 (ESM)
import { Chessboard } from "react-chessboard";
import { useRouter } from "next/navigation";

// Tailwind CSSはプロジェクトに設定済みであることを想定

// --- 事前定義PGN ---
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
// --- ---

export default function AnalysisPage() {
  // --- State Hooks ---
  const [pgn, setPgn] = useState(prefilledPgn);
  const [fen, setFen] = useState("start");
  const [history, setHistory] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoadingPgn, setIsLoadingPgn] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [log, setLog] = useState([]);

  const [engineAnalysis, setEngineAnalysis] = useState({
    bestMove: null,
    evaluation: null,
    line: [],
    depth: 0,
    nodes: 0,
    nps: 0,
  });
  const [engineReady, setEngineReady] = useState(false);
  const [wasmFileStatus, setWasmFileStatus] = useState("WASMファイル検証中..."); // WASMファイル検証用

  const router = useRouter();

  // --- Refs ---
  const chessGame = useRef(null);
  const boardWrapperRef = useRef(null);
  const stockfishWorker = useRef(null);

  // --- State for dynamic board width ---
  const [dynamicBoardWidth, setDynamicBoardWidth] = useState(300);

  // --- Effects ---
  useEffect(() => {
    chessGame.current = new Chess();
    setFen(chessGame.current.fen());

    /* ② Stockfish Proxy Worker を起動（1 行で完結） */
    stockfishWorker.current = new Worker(
      "/stockfish/stockfish-nnue-16-single.js"
    );

    const push = (line) => setLog((prev) => [...prev, line].slice(-100));

    /* ③ メッセージ受信ハンドラ */
    stockfishWorker.current.onmessage = (event) => {
      const type = typeof event === "string" ? event : event.data;
      if (type) push(type);

      if (type === "uciok") {
        setEngineReady(true);
        setWasmFileStatus("Stockfish エンジン準備完了！");
        return;
      }

      if (type === "analysis_update") {
        console.log("[SF-RAW]", payload); // 必要に応じて parse
        return;
      }

      if (type.startsWith("info")) {
        console.log("解析完了");
      }

      if (type.startsWith("bestmove")) {
        const [, best] = type.split(" ");
        setEngineAnalysis({ bestMove: best });
        setIsAnalyzing(false);
      }

      if (type === "analysis_complete") {
        setIsAnalyzing(false);
        setEngineAnalysis((prev) => ({ ...prev, ...payload }));
        return;
      }
    };

    stockfishWorker.current.onerror = (e) => {
      setErrorMessage(`Worker error: ${e.message || "unknown"}`);
      setEngineReady(false);
    };

    stockfishWorker.current.postMessage("uci");

    return () => {
      stockfishWorker.current?.terminate();
    };
  }, []);

  useEffect(() => {
    const calculateBoardSize = () => {
      if (boardWrapperRef.current) {
        const containerWidth = boardWrapperRef.current.offsetWidth;
        setDynamicBoardWidth(Math.min(containerWidth, 560));
      }
    };
    calculateBoardSize();
    window.addEventListener("resize", calculateBoardSize);
    return () => {
      window.removeEventListener("resize", calculateBoardSize);
    };
  }, []);

  // --- Event Handlers ---
  const handlePgnChange = (event) => {
    setPgn(event.target.value);
    setErrorMessage("");
  };

  const return_home = () => {
    router.push("/");
  };

  const loadPgn = () => {
    if (isLoadingPgn) return;
    setIsLoadingPgn(true);
    console.log("loadPgn: Processing started.");
    try {
      if (!chessGame.current)
        throw new Error(
          "チェスエンジンのメインインスタンスが初期化されていません。"
        );
      chessGame.current.reset();

      let pgnRawInput = pgn;
      let processedPgn = pgnRawInput
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      processedPgn = processedPgn.replace(
        /[^a-zA-Z0-9 \n\[\]().#+\-=\/\:?*!"']/g,
        ""
      );
      const lines = processedPgn.split("\n").map((line) => line.trim());
      const headerLines = [];
      const movetextParts = [];
      let inMovetext = false;
      for (const line of lines) {
        if (line.startsWith("[") && line.endsWith("]")) {
          if (inMovetext)
            console.warn("PGN Warning: Tag found after movetext. Line:", line);
          headerLines.push(line);
        } else if (line.length > 0) {
          inMovetext = true;
          movetextParts.push(line);
        }
      }
      const headerString = headerLines.join("\n");
      const movetextString = movetextParts
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      let pgnToLoad;
      if (headerString.length > 0 && movetextString.length > 0)
        pgnToLoad = headerString + "\n\n" + movetextString;
      else if (movetextString.length > 0) pgnToLoad = movetextString;
      else if (headerString.length > 0) pgnToLoad = headerString;
      else pgnToLoad = "";
      pgnToLoad = pgnToLoad.trim();

      if (pgnToLoad.length === 0 && pgnRawInput.trim().length > 0) {
        throw new Error("入力されたPGNの内容が処理後に空になりました。");
      }

      chessGame.current.loadPgn(pgnToLoad, { sloppy: true });

      const newHistory = chessGame.current.history({ verbose: true });
      setHistory(newHistory);
      setCurrentIndex(newHistory.length > 0 ? newHistory.length - 1 : -1);
      setFen(chessGame.current.fen());
      setEngineAnalysis({
        bestMove: null,
        evaluation: null,
        line: [],
        depth: 0,
        nodes: 0,
        nps: 0,
      });
      setErrorMessage("");
      console.log(
        "User PGN processing completed. History length:",
        newHistory.length
      );
    } catch (error) {
      console.error("RAW CAUGHT ERROR in loadPgn:", error);
      setErrorMessage(error.message || "PGNの読み込みに失敗しました。");
      if (chessGame.current) {
        chessGame.current.reset();
        setFen(chessGame.current.fen());
      } else {
        setFen("start");
      }
      setHistory([]);
      setCurrentIndex(-1);
    } finally {
      setIsLoadingPgn(false);
      console.log("loadPgn: Processing finished.");
    }
  };

  const navigateMoves = (direction) => {
    if (!chessGame.current || typeof chessGame.current.move !== "function")
      return;
    if (history.length === 0 && direction !== "first") return;
    let newIndex = currentIndex;
    if (direction === "first") newIndex = -1;
    else if (direction === "last") newIndex = history.length - 1;
    else if (direction === "prev") newIndex = Math.max(-1, currentIndex - 1);
    else if (direction === "next")
      newIndex = Math.min(history.length - 1, currentIndex + 1);

    chessGame.current.reset();
    for (let i = 0; i <= newIndex; i++) {
      if (history[i]) chessGame.current.move(history[i]);
    }
    setFen(chessGame.current.fen());
    setCurrentIndex(newIndex);
    setEngineAnalysis({
      bestMove: null,
      evaluation: null,
      line: [],
      depth: 0,
      nodes: 0,
      nps: 0,
    });
  };

  const runAnalysis = () => {
    if (!engineReady) {
      setErrorMessage("Stockfishエンジンが準備できていません。");
      console.warn(
        "runAnalysis: Stockfish worker not ready or not initialized."
      );
      return;
    }
    if (!chessGame.current) {
      setErrorMessage("ゲームがロードされていません。");
      return;
    }
    if (isAnalyzing) {
      console.log("runAnalysis: Stopping current analysis.");
      stockfishWorker.current.postMessage({ command: "stop" });
      setIsAnalyzing(false);
    } else {
      const currentFen = chessGame.current.fen();
      console.log("runAnalysis: Requesting analysis for FEN:", currentFen);
      stockfishWorker.current.postMessage(`position fen ${currentFen}`);
      stockfishWorker.current.postMessage("go depth 20");
      stockfishWorker.current.postMessage({
        command: "analyze",
        fen: currentFen,
        depth: 15,
      });
    }
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-stone-50 text-black flex flex-col items-center p-4 font-sans">
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-bold text-stone-900">解析画面</h1>
        <p className="text-stone-700 mb-2">
          保存された棋譜や解析結果を確認できます。
        </p>
        <button
          onClick={return_home}
          className="mt-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition duration-150 ease-in-out shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ホームに戻る
        </button>
      </header>

      <div className="w-full max-w-2xl mb-6 p-6 bg-gray-800 rounded-lg shadow-xl">
        <h3 className="text-2xl font-semibold mb-3 text-stone-50">
          1. PGN入力
        </h3>
        <textarea
          value={pgn}
          onChange={handlePgnChange}
          placeholder="ここにPGN形式の棋譜を貼り付けてください..."
          rows="12"
          className="w-full p-3 bg-gray-700 text-gray-200 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
          disabled={isLoadingPgn}
        />
        <button
          onClick={loadPgn}
          className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition duration-150 ease-in-out shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoadingPgn}
        >
          {isLoadingPgn ? "読み込み中..." : "PGNを読み込む"}
        </button>
        {errorMessage && (
          <p className="mt-2 text-sm text-red-500">{errorMessage}</p>
        )}
        {/* WASMファイル検証とエンジン準備状態の表示 */}
        <p
          className={`mt-2 text-sm ${
            engineReady && !errorMessage
              ? "text-green-500 font-semibold"
              : errorMessage
              ? "text-red-500"
              : "text-blue-400"
          }`}
        >
          {wasmFileStatus}
        </p>
      </div>

      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-6">
        {/* チェス盤エリア */}
        <div className="lg:w-1/2 w-full p-6 bg-gray-800 rounded-lg shadow-xl flex flex-col items-center">
          <h3 className="text-2xl font-semibold mb-4 text-stone-50">
            2. チェス盤
          </h3>
          <div ref={boardWrapperRef} className="w-full max-w-md aspect-square">
            <Chessboard
              position={fen}
              arePiecesDraggable={false}
              boardWidth={dynamicBoardWidth}
              customDarkSquareStyle={{ backgroundColor: "#4A5568" }}
              customLightSquareStyle={{ backgroundColor: "#A0AEC0" }}
            />
          </div>
          <p className="mt-3 text-sm text-gray-400 break-all w-full max-w-md text-center">
            FEN: {fen}
          </p>
        </div>

        {/* 操作・解析エリア */}
        <div className="lg:w-1/2 w-full p-6 bg-gray-800 rounded-lg shadow-xl">
          <h3 className="text-2xl font-semibold mb-4 text-stone-50">
            3. 棋譜操作 & 解析
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <button
              onClick={() => navigateMoves("first")}
              className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-md transition shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={
                isLoadingPgn || (currentIndex === -1 && history.length === 0)
              }
            >
              最初へ
            </button>
            <button
              onClick={() => navigateMoves("prev")}
              className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-md transition shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isLoadingPgn || currentIndex < 0}
            >
              一手戻る
            </button>
            <button
              onClick={() => navigateMoves("next")}
              className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-md transition shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isLoadingPgn || currentIndex >= history.length - 1}
            >
              一手進む
            </button>
            <button
              onClick={() => navigateMoves("last")}
              className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-md transition shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={
                isLoadingPgn ||
                history.length === 0 ||
                currentIndex === history.length - 1
              }
            >
              最後へ
            </button>
          </div>

          <p className="mb-3 text-gray-300">
            現在の局面:{" "}
            {currentIndex === -1 ? "初期局面" : `${currentIndex + 1}手目`}
            {history.length > 0 &&
              currentIndex >= 0 &&
              history[currentIndex] && (
                <span className="ml-2 font-mono p-1 bg-gray-700 rounded text-sm">
                  {history[currentIndex].san}
                </span>
              )}
          </p>

          <button
            onClick={runAnalysis}
            className={`w-full text-white font-semibold py-2 px-4 rounded-md transition shadow-md mb-4 ${
              isAnalyzing
                ? "bg-red-600 hover:bg-red-700"
                : "bg-green-600 hover:bg-green-700"
            } disabled:bg-gray-500 disabled:cursor-not-allowed`}
            disabled={
              !engineReady ||
              isLoadingPgn ||
              !chessGame.current ||
              typeof chessGame.current.history !== "function"
            }
          >
            {isAnalyzing ? "解析停止" : "現在の局面を解析"}
          </button>

          {(isAnalyzing ||
            engineAnalysis.bestMove ||
            engineAnalysis.evaluation !== null) && (
            <div className="p-4 bg-gray-700 rounded-md text-sm">
              <h4 className="text-lg font-semibold text-green-300 mb-2">
                {isAnalyzing ? "解析中..." : "解析結果"}
              </h4>
              {/* {engineAnalysis.evaluation !== null && (
                <p className="text-gray-300">
                  評価値: <span className="font-bold text-white">{typeof engineAnalysis.evaluation === 'number' ? engineAnalysis.evaluation.toFixed(2) : engineAnalysis.evaluation}</span>
                </p>
              )} */}
              {engineAnalysis.bestMove && (
                <p className="text-gray-300">
                  最善手 (候補):{" "}
                  <span className="font-bold text-white font-mono">
                    {engineAnalysis.bestMove}
                  </span>
                </p>
              )}
              {/* {engineAnalysis.line && engineAnalysis.line.length > 0 && (
                <p className="text-gray-300">
                  読み筋: <span className="font-mono text-xs text-gray-400">{engineAnalysis.line.join(' ')}</span>
                </p>
              )}
               <p className="text-gray-400 text-xs mt-2">
                  深さ: <span className="font-semibold text-gray-300">{engineAnalysis.depth}</span>,
                  Nodes: <span className="font-semibold text-gray-300">{engineAnalysis.nodes.toLocaleString()}</span>
                  {engineAnalysis.nps > 0 && (
                    <>, NPS: <span className="font-semibold text-gray-300">{engineAnalysis.nps.toLocaleString()}</span></>
                  )}
                </p> */}
            </div>
          )}
        </div>
      </div>

      <footer className="mt-8 text-center text-gray-500 text-sm">
        <p>&copy; 解析くん</p>
      </footer>
    </div>
  );
}
