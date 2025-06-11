"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [hoveredCard, setHoveredCard] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const handleBotGame = () => {
    router.push("/game?mode=bot");
  };

  const handleLocalGame = () => {
    router.push("/game?mode=local");
  };

  const handleViewAnalysis = () => {
    router.push("/analysis");
  };

  const gameModes = [
    {
      id: "bot",
      title: "AIと対戦",
      subtitle: "Stockfishエンジン搭載",
      description: "世界最強クラスのチェスエンジンと対戦。レベル調整可能で初心者から上級者まで楽しめます。",
      icon: "🤖",
      gradient: "from-blue-500 to-purple-600",
      features: ["難易度調整 (1-20)", "リアルタイム解析", "ヒント機能"],
      onClick: handleBotGame,
    },
    {
      id: "local",
      title: "ローカル対戦",
      subtitle: "同じ画面で2人対戦",
      description: "友達や家族と同じデバイスで対戦。棋譜の記録も自動で行われます。",
      icon: "👥",
      gradient: "from-green-500 to-teal-600",
      features: ["交互にプレイ", "棋譜自動記録", "即座に対戦開始"],
      onClick: handleLocalGame,
    },
    {
      id: "analysis",
      title: "棋譜解析",
      subtitle: "過去の対局を分析",
      description: "PGN形式の棋譜を読み込んで、Stockfishによる詳細な解析を実行できます。",
      icon: "📊",
      gradient: "from-purple-500 to-pink-600",
      features: ["PGN読み込み", "局面ごとの評価", "最善手の提案"],
      onClick: handleViewAnalysis,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white overflow-hidden relative">
      {/* 背景のチェスパターン */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,.1) 35px, rgba(255,255,255,.1) 70px)`,
        }} />
      </div>

      {/* 動的な背景グロー効果 */}
      <div 
        className="absolute inset-0 opacity-30 blur-3xl"
        style={{
          background: `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(59, 130, 246, 0.5), transparent 50%)`,
        }}
      />

      {/* メインコンテンツ */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* ヘッダー */}
        <header className="pt-16 pb-8 text-center">
          <div className="inline-block">
            <h1 className="text-6xl md:text-7xl font-bold mb-4 bg-gradient-to-r from-white via-blue-200 to-white bg-clip-text text-transparent animate-gradient-x">
              ChessMate
            </h1>
            <div className="h-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-pulse" />
          </div>
          <p className="mt-6 text-xl text-gray-300 max-w-2xl mx-auto px-4">
            最先端のAIを搭載した、美しく直感的なチェスプラットフォーム
          </p>
          
          {/* ステータスバッジ */}
          <div className="mt-6 flex items-center justify-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 bg-green-500/20 border border-green-500/50 rounded-full px-4 py-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-green-400">Stockfish 16 搭載</span>
            </div>
            <div className="flex items-center gap-2 bg-blue-500/20 border border-blue-500/50 rounded-full px-4 py-2">
              <span className="text-sm text-blue-400">🎯 初心者から上級者まで</span>
            </div>
          </div>
        </header>

        {/* ゲームモード選択 */}
        <main className="flex-1 px-4 pb-16">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-semibold text-center mb-12 text-gray-300">
              プレイモードを選択
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
              {gameModes.map((mode) => (
                <div
                  key={mode.id}
                  className="group relative"
                  onMouseEnter={() => setHoveredCard(mode.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  {/* カードの背景グロー */}
                  <div
                    className={`absolute -inset-0.5 bg-gradient-to-r ${mode.gradient} rounded-2xl blur-lg opacity-0 group-hover:opacity-75 transition duration-500`}
                  />
                  
                  {/* カード本体 */}
                  <div className="relative bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 h-full transition-all duration-300 group-hover:transform group-hover:scale-[1.02] group-hover:border-gray-600">
                    {/* アイコン */}
                    <div className="text-6xl mb-6 transform transition-transform duration-300 group-hover:scale-110">
                      {mode.icon}
                    </div>
                    
                    {/* タイトル */}
                    <h3 className={`text-2xl font-bold mb-2 bg-gradient-to-r ${mode.gradient} bg-clip-text text-transparent`}>
                      {mode.title}
                    </h3>
                    
                    {/* サブタイトル */}
                    <p className="text-sm text-gray-400 mb-4">{mode.subtitle}</p>
                    
                    {/* 説明 */}
                    <p className="text-gray-300 mb-6 leading-relaxed">
                      {mode.description}
                    </p>
                    
                    {/* 特徴リスト */}
                    <ul className="space-y-2 mb-8">
                      {mode.features.map((feature, index) => (
                        <li key={index} className="flex items-center text-sm text-gray-400">
                          <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    
                    {/* プレイボタン */}
                    <button
                      onClick={mode.onClick}
                      className={`w-full py-4 px-6 rounded-xl font-semibold text-white bg-gradient-to-r ${mode.gradient} transform transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        プレイ開始
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 追加情報セクション */}
            <div className="mt-16 text-center">
              <div className="inline-flex items-center gap-8 text-gray-400 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">♟️</span>
                  <span>完全無料</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🌐</span>
                  <span>日本語対応</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">💾</span>
                  <span>棋譜保存可能</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* フッター */}
        <footer className="py-8 text-center text-gray-500 text-sm">
          <p>© 2025 ChessMate - Powered by Stockfish Engine</p>
        </footer>
      </div>

      <style jsx>{`
        @keyframes gradient-x {
          0%, 100% {
            background-size: 200% 200%;
            background-position: left center;
          }
          50% {
            background-size: 200% 200%;
            background-position: right center;
          }
        }
        .animate-gradient-x {
          animation: gradient-x 3s ease infinite;
        }
      `}</style>
    </div>
  );
}