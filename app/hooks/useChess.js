// src/hooks/useChess.js

import { useState, useCallback, useRef } from "react";
import { Chess } from "chess.js"; // チェスロジックを扱うライブラリ（ESM版）

/**
 * useChess - チェスゲームの状態と操作を管理するカスタムReactフック
 * チェスエンジン(chess.js)を内部に持ち、Reactコンポーネントと分離された形で使えるようにする
 */
export default function useChess() {
  // Chessインスタンスを保持（useRefを使うことで再描画ごとに初期化されないようにする）
  const chessRef = useRef(new Chess());

  // 現在の局面（FEN形式）をReactの状態として保持
  const [fen, setFen] = useState(chessRef.current.fen());

  // 棋譜履歴（SAN形式）をReactの状態として保持
  const [history, setHistory] = useState([]);

  /**
   * move - 駒を指定のマスに動かす
   * @param {string} from - 移動元のマス（例: "e2"）
   * @param {string} to - 移動先のマス（例: "e4"）
   * @param {string} promotion - 昇格駒の指定（省略時は常にクイーン）
   * @returns {object|null} - 成功時は move オブジェクト、失敗時は null
   */
  const move = useCallback((from, to, promotion = "q") => {
    const game = chessRef.current;

    try {
      // 移動を試みる（不正な手なら例外が出る）
      const result = game.move({ from, to, promotion });

      if (result) {
        // 合法手なら状態を更新
        setFen(game.fen());
        setHistory(game.history());
      }

      return result;
    } catch (error) {
      // 非合法手の場合はnullを返す（呼び出し元で判断可能にする）
      return null;
    }
  }, []);

  /**
   * getFen - 現在の局面（FEN）を取得する
   */
  const getFen = useCallback(() => chessRef.current.fen(), []);

  /**
   * getLegalMoves - 合法手の一覧を取得する
   * @param {string|null} fromSquare - 指定したマスからの合法手だけに絞ることも可能
   */
  const getLegalMoves = useCallback(
    (fromSquare = null) =>
      chessRef.current.moves({ square: fromSquare, verbose: true }),
    []
  );

  /**
   * isGameOver - チェスゲームが終了しているかを判定する
   * チェックメイト・ステイルメイト・ドローなどに対応
   */
  const isGameOver = useCallback(() => {
    return chessRef.current.isGameOver(); // chess.js v1系では isGameOver()
  }, []);

  /**
   * resetGame - ゲームを初期状態にリセットする
   * 盤面・履歴をすべて初期化
   */
  const resetGame = useCallback(() => {
    chessRef.current.reset(); // インスタンス内部の状態をリセット
    setFen(chessRef.current.fen()); // 初期盤面に更新
    setHistory([]); // 棋譜をクリア
  }, []);

  // 外部に公開する状態と操作API
  return {
    fen, // 現在の盤面（FEN）
    history, // 棋譜履歴（SAN形式）
    move, // 駒を動かす関数
    getFen, // 現在のFENを取得
    getLegalMoves, // 合法手の取得
    isGameOver, // ゲーム終了の判定
    resetGame, // ゲームのリセット
    chess: chessRef.current, // chessインスタンスを公開
  };
}
