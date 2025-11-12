"use client";

import React, { useMemo, useState } from "react";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function EvaluationGraph({
  analysisData,
  history,
  currentIndex,
  onSelectMove,
  evaluationToNumber,
  formatEvaluation,
}) {
  const points = useMemo(() => {
    if (!analysisData || Object.keys(analysisData).length === 0) return [];

    return Object.keys(analysisData)
      .map((key) => Number(key))
      .filter((index) => index >= -1)
      .sort((a, b) => a - b)
      .map((index) => {
        const analysis = analysisData[index];
        const rawEval = analysis?.evaluation ?? 0;
        const numeric = evaluationToNumber
          ? evaluationToNumber(rawEval)
          : typeof rawEval === "number"
            ? rawEval
            : 0;

        return {
          moveIndex: index,
          evaluation: rawEval,
          numeric,
          san: index >= 0 && history?.[index] ? history[index].san : "初期位置",
          ply: index,
        };
      });
  }, [analysisData, history, evaluationToNumber]);

  const maxAbsValue = 5;

  const plottedPoints = useMemo(() => {
    if (points.length === 0) return [];

    const total = points.length - 1;

    return points.map((point, idx) => {
      let clampedValue = clamp(point.numeric, -maxAbsValue, maxAbsValue);
      const x = total === 0 ? 0 : (idx / total) * 100;
      let y;
      if (point.numeric >= maxAbsValue) {
        y = 0;
        clampedValue = maxAbsValue;
      } else if (point.numeric <= -maxAbsValue) {
        y = 60;
        clampedValue = -maxAbsValue;
      } else {
        y = ((maxAbsValue - clampedValue) / (2 * maxAbsValue)) * 60;
      }
      return {
        ...point,
        clampedValue,
        x,
        y,
      };
    });
  }, [points, maxAbsValue]);

  const gradientId = useMemo(
    () => `eval-gradient-${Math.random().toString(36).slice(2, 8)}`,
    []
  );

  const [hoveredMove, setHoveredMove] = useState(null);

  if (plottedPoints.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-500">
        全手解析を実行すると評価グラフを表示します
      </div>
    );
  }

  const zeroLineY = ((maxAbsValue - 0) / (2 * maxAbsValue)) * 60;
  const pathD = plottedPoints
    .map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`)
    .join(" ");

  const areaPathD = `${pathD} L 100 60 L 0 60 Z`;

  const activeMoveIndex = hoveredMove ?? currentIndex;
  const activePoint =
    plottedPoints.find((point) => point.moveIndex === activeMoveIndex) ??
    plottedPoints.find((point) => point.moveIndex === currentIndex) ??
    plottedPoints[plottedPoints.length - 1];

  const zeroLineColor = "rgba(100, 116, 139, 0.35)"; // slate-500 at low opacity

  const tooltipTopPercent = 6; // 固定表示 (縦方向は変えない)
  const tooltipLeftPercent = clamp(activePoint.x, 4, 96);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-xs font-medium text-slate-500">
        <span>評価の推移</span>
        <span>{`±${maxAbsValue.toFixed(1)} (cp)`}</span>
      </div>
      <div className="relative h-48 w-full">
        <svg
          viewBox="0 0 100 60"
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label="評価値の推移グラフ"
          onMouseLeave={() => setHoveredMove(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(59,130,246,0.18)" />
              <stop offset="100%" stopColor="rgba(16,185,129,0.05)" />
            </linearGradient>
          </defs>

          {/* 背景グリッド */}
          {[25, 50, 75].map((percent) => (
            <line
              key={percent}
              x1="0"
              x2="100"
              y1={(percent / 100) * 60}
              y2={(percent / 100) * 60}
              stroke="rgba(148, 163, 184, 0.15)"
              strokeWidth="0.2"
            />
          ))}

          {/* 0ライン */}
          <line x1="0" x2="100" y1={zeroLineY} y2={zeroLineY} stroke={zeroLineColor} strokeWidth="0.4" strokeDasharray="1 3" />

          {/* 面グラフ */}
          <path d={areaPathD} fill={`url(#${gradientId})`} opacity={0.7} />
          {/* 折れ線 */}
          <path d={pathD} fill="none" stroke="rgba(37,99,235,0.8)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />

          {/* データ点 */}
          {plottedPoints.map((point) => (
            <circle
              key={point.moveIndex}
              cx={point.x}
              cy={point.y}
              r={point.moveIndex === activePoint.moveIndex ? 1.8 : 1.2}
              fill={point.moveIndex === activePoint.moveIndex ? "rgba(37,99,235,0.95)" : "white"}
              stroke={point.moveIndex === activePoint.moveIndex ? "rgba(37,99,235,0.95)" : "rgba(59,130,246,0.6)"}
              strokeWidth={point.moveIndex === activePoint.moveIndex ? 0.6 : 0.4}
              onMouseEnter={() => setHoveredMove(point.moveIndex)}
              onFocus={() => setHoveredMove(point.moveIndex)}
              onClick={() => onSelectMove?.(point.moveIndex)}
              onBlur={() => setHoveredMove(null)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectMove?.(point.moveIndex);
                }
              }}
              tabIndex={0}
              className="cursor-pointer transition-all duration-150 ease-out"
            />
          ))}
        </svg>

        {activePoint && (
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute flex -translate-x-1/2 flex-col items-center text-xs"
              style={{
                left: `${tooltipLeftPercent}%`,
                top: `${tooltipTopPercent}%`,
              }}
            >
              <div className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm">
                {formatEvaluation
                  ? formatEvaluation(activePoint.evaluation)
                  : activePoint.numeric.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
        <span>黒有利</span>
        <span>白有利</span>
      </div>
    </div>
  );
}
