import { useState, useEffect, useCallback, useRef } from "react";

/**
 * useStockfish - Stockfishエンジンとの通信を管理するカスタムフック
 * @param {Object} options - 設定オプション
 * @param {number} options.difficulty - 難易度（1-20）
 * @param {number} options.thinkingTime - 思考時間（ミリ秒）
 * @returns {Object} - Stockfishエンジンの状態と操作API
 */
export default function useStockfish({
  difficulty = 10,
  thinkingTime = 1000,
} = {}) {
  // 難易度の状態管理
  const [currentDifficulty, setCurrentDifficulty] = useState(() => {
    const clamped = Math.max(1, Math.min(20, difficulty));
    if (difficulty !== clamped) {
      console.warn(
        `難易度は1-20の範囲で設定してください。${difficulty}は${clamped}に調整されました。`
      );
    }
    return clamped;
  });

  // 状態管理
  const [isReady, setIsReady] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [bestMove, setBestMove] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [depth, setDepth] = useState(0);
  const [nodes, setNodes] = useState(0);
  const [nps, setNps] = useState(0);

  // Web Workerの参照を保持
  const workerRef = useRef(null);

  // ログ管理
  const [log, setLog] = useState([]);
  const addLog = useCallback((message) => {
    setLog((prev) => [...prev, message].slice(-100)); // 最新100件のみ保持
  }, []);

  // Stockfishエンジンの初期化
  useEffect(() => {
    // Web Workerの作成
    workerRef.current = new Worker("/stockfish/stockfish-nnue-16-single.js");

    // メッセージハンドラの設定
    workerRef.current.onmessage = (event) => {
      const message = event.data;
      addLog(message);

      if (message === "uciok") {
        setIsReady(true);
        // 難易度の設定
        workerRef.current.postMessage(
          `setoption name Skill Level value ${currentDifficulty}`
        );
        return;
      }

      // 解析結果の処理
      if (message.startsWith("info")) {
        const info = parseInfoMessage(message);
        if (info) {
          if (info.depth) setDepth(info.depth);
          if (info.nodes) setNodes(info.nodes);
          if (info.nps) setNps(info.nps);
          if (info.evaluation) setEvaluation(info.evaluation);
        }
      }

      // 最善手の処理
      if (message.startsWith("bestmove")) {
        const [, move] = message.split(" ");
        setBestMove(move);
        setIsAnalyzing(false);
      }
    };

    // エラーハンドラの設定
    workerRef.current.onerror = (error) => {
      console.error("Stockfish Worker Error:", error);
      addLog(`Error: ${error.message}`);
      setIsReady(false);
    };

    // UCIプロトコルの初期化
    workerRef.current.postMessage("uci");

    // クリーンアップ
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [currentDifficulty, addLog]);

  /**
   * 局面の解析を開始
   * @param {string} fen - 現在の局面（FEN形式）
   * @param {number} maxDepth - 最大探索深さ
   */
  const analyzePosition = useCallback(
    (fen, maxDepth = 20) => {
      if (!isReady || !workerRef.current) {
        console.warn("Stockfish is not ready");
        return;
      }

      setIsAnalyzing(true);
      setBestMove(null);
      setEvaluation(null);
      setDepth(0);
      setNodes(0);
      setNps(0);

      // 局面の設定と解析開始
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage(
        `go depth ${maxDepth} movetime ${thinkingTime}`
      );
    },
    [isReady, thinkingTime]
  );

  /**
   * 解析を停止
   */
  const stopAnalysis = useCallback(() => {
    if (!isReady || !workerRef.current) return;
    workerRef.current.postMessage("stop");
    setIsAnalyzing(false);
  }, [isReady]);

  /**
   * 難易度の変更
   * @param {number} newDifficulty - 新しい難易度（1-20）
   */
  const setDifficulty = useCallback(
    (newDifficulty) => {
      if (!isReady || !workerRef.current) return;
      const clampedDifficulty = Math.max(1, Math.min(20, newDifficulty));
      if (newDifficulty !== clampedDifficulty) {
        console.warn(
          `難易度は1-20の範囲で設定してください。${newDifficulty}は${clampedDifficulty}に調整されました。`
        );
      }
      setCurrentDifficulty(clampedDifficulty);
      workerRef.current.postMessage(
        `setoption name Skill Level value ${clampedDifficulty}`
      );
    },
    [isReady]
  );

  // 外部に公開する状態と操作API
  return {
    isReady,
    isAnalyzing,
    bestMove,
    evaluation,
    depth,
    nodes,
    nps,
    log,
    currentDifficulty, // 現在の難易度を公開
    analyzePosition,
    stopAnalysis,
    setDifficulty,
  };
}

/**
 * Stockfishのinfoメッセージをパース
 * @param {string} message - Stockfishからのinfoメッセージ
 * @returns {Object|null} - パースされた情報
 */
function parseInfoMessage(message) {
  const parts = message.split(" ");
  const info = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    switch (part) {
      case "depth":
        info.depth = parseInt(parts[++i], 10);
        break;
      case "nodes":
        info.nodes = parseInt(parts[++i], 10);
        break;
      case "nps":
        info.nps = parseInt(parts[++i], 10);
        break;
      case "score":
        const scoreType = parts[++i];
        if (scoreType === "cp") {
          info.evaluation = parseInt(parts[++i], 10) / 100; // センチポーンをポーンに変換
        } else if (scoreType === "mate") {
          info.evaluation = `M${parts[++i]}`; // チェックメイトまでの手数
        }
        break;
    }
  }

  return Object.keys(info).length > 0 ? info : null;
}
