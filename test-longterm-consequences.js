// Test script for long-term consequence analysis
import ChessMoveAnalyzer from './app/utils/chessMoveAnalyzer.js';
import { Chess } from 'chess.js';

console.log('=== Long-Term Consequence Analysis Test ===\n');

const analyzer = new ChessMoveAnalyzer();

// Test 1: キングサイドのポーン前進による長期的弱点
console.log('Test 1: キングサイドの弱体化');
const game1 = new Chess();
// キャスリング後の局面
game1.load('rnbq1rk1/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 0 7');
const fen1 = game1.fen();

// f2-f3のポーン前進（キング前を弱める）
const move1 = { from: 'f2', to: 'f3', piece: 'p', san: 'f3', color: 'w' };

const result1 = analyzer.analyzeMoveNaturalLanguage(fen1, move1, fen1);
console.log('Move:', move1.san);
console.log('Summary:', result1.summary);
console.log('\nLong-term consequences:');
result1.details.forEach((d, i) => {
  if (d.includes('将来') || d.includes('キング') || d.includes('弱') || d.includes('長期')) {
    console.log(`- ${d}`);
  }
});
console.log('Has long-term warning:', result1.keyPoints.includes('長期的影響'));

// Test 2: ポーン構造への影響（孤立ポーン）
console.log('\n\nTest 2: 孤立ポーンの作成');
const game2 = new Chess();
game2.load('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2');
// d2-d4でcポーンを孤立させる可能性
game2.move('d4');
game2.move('cxd4');
const fen2 = game2.fen();

// c2-c3でdポーンを孤立させる
const move2 = { from: 'c2', to: 'c3', piece: 'p', san: 'c3', color: 'w' };

const result2 = analyzer.analyzeMoveNaturalLanguage(fen2, move2, fen2);
console.log('Move:', move2.san);
console.log('Summary:', result2.summary);
console.log('\nPawn structure consequences:');
result2.details.forEach((d, i) => {
  if (d.includes('孤立') || d.includes('ポーン構造') || d.includes('ファイル')) {
    console.log(`- ${d}`);
  }
});

// Test 3: エンドゲームへの好影響（パスポーン）
console.log('\n\nTest 3: パスポーンの可能性');
const game3 = new Chess();
game3.load('r1bqkb1r/pp3ppp/2n1pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R w KQkq - 0 7');
const fen3 = game3.fen();

// e2-e4でセンターを拡大し、将来的なパスポーンを狙う
const move3 = { from: 'e2', to: 'e4', piece: 'p', san: 'e4', color: 'w' };

const result3 = analyzer.analyzeMoveNaturalLanguage(fen3, move3, fen3);
console.log('Move:', move3.san);
console.log('Summary:', result3.summary);
console.log('\nPositive long-term effects:');
result3.details.forEach((d, i) => {
  if (d.includes('パスポーン') || d.includes('エンドゲーム') || d.includes('強固')) {
    console.log(`- ${d}`);
  }
});

// Test 4: 駒の活動性への影響
console.log('\n\nTest 4: ビショップの閉じ込め');
const game4 = new Chess();
const fen4 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// d2-d3でビショップを閉じ込める可能性
const move4 = { from: 'd2', to: 'd3', piece: 'p', san: 'd3', color: 'w' };

const result4 = analyzer.analyzeMoveNaturalLanguage(fen4, move4, fen4);
console.log('Move:', move4.san);
console.log('Summary:', result4.summary);
console.log('\nPiece activity consequences:');
result4.details.forEach((d, i) => {
  if (d.includes('ビショップ') || d.includes('活動性') || d.includes('制限')) {
    console.log(`- ${d}`);
  }
});

// Test 5: 戦略的弱点の創出
console.log('\n\nTest 5: カラーコンプレックスの弱体化');
const game5 = new Chess();
// 多くのポーンを同じ色のマスに配置した局面
game5.load('rnbqkb1r/pp3ppp/4pn2/3p4/3P4/3BP3/PPP2PPP/RNBQK1NR w KQkq - 0 6');
const fen5 = game5.fen();

// f2-f3でさらに白マスを弱める
const move5 = { from: 'f2', to: 'f3', piece: 'p', san: 'f3', color: 'w' };

const result5 = analyzer.analyzeMoveNaturalLanguage(fen5, move5, fen5);
console.log('Move:', move5.san);
console.log('Summary:', result5.summary);
console.log('\nStrategic weakness consequences:');
result5.details.forEach((d, i) => {
  if (d.includes('コンプレックス') || d.includes('弱点') || d.includes('永続')) {
    console.log(`- ${d}`);
  }
});

console.log('\n=== Test Complete ===');