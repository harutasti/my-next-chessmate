"use client"; // ← クライアント側で動作させるために必須

import React from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  const handleBotGame = () => {
    router.push("/game?mode=bot");
  };

  const handleLocalGame = () => {
    router.push("/game?mode=local");
  };

  const handleViewAnalysis = () => {
    router.push("/analysis");
  };

  return (
    <div className="text-center p-8">
      <h1 className="text-4xl font-bold my-6">ChessMateへようこそ</h1>
      <p className="mb-4">プレイモードを選んでください</p>
      <div className="space-x-4">
        <button
          onClick={handleBotGame}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Botと対戦
        </button>
        <button
          onClick={handleLocalGame}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          ローカル対戦
        </button>
        <button
          onClick={handleViewAnalysis}
          className="px-4 py-2 bg-gray-500 text-white rounded"
        >
          対局解析
        </button>
      </div>
    </div>
  );
}
