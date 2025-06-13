// Test script for strategic plan analysis
import ChessMoveAnalyzer from './app/utils/chessMoveAnalyzer.js';
import { Chess } from 'chess.js';

console.log('=== Strategic Plan Analysis Test ===\n');

const analyzer = new ChessMoveAnalyzer();

// Test 1: キングサイド攻撃プラン
console.log('Test 1: キングサイド攻撃プラン');
const game1 = new Chess();
// イタリアンゲームの攻撃的な変化
game1.move('e4');
game1.move('e5');
game1.move('Nf3');
game1.move('Nc6');
game1.move('Bc4');
game1.move('Bc5');
game1.move('c3');
game1.move('Nf6');
game1.move('d4');
game1.move('exd4');
game1.move('cxd4');
game1.move('Bb4+');
game1.move('Bd2');
game1.move('Bxd2+');
game1.move('Nbxd2');
game1.move('d6');
game1.move('O-O');
game1.move('O-O');

const fen1 = game1.fen();
// クイーンをh5に移動してキングサイド攻撃を準備
const move1 = { from: 'd1', to: 'h5', piece: 'q', san: 'Qh5', color: 'w' };

const result1 = analyzer.analyzeMoveNaturalLanguage(fen1, move1, fen1);
console.log('Move:', move1.san);
console.log('Summary:', result1.summary);
console.log('Strategic types:', result1.moveType.filter(t => t.includes('strategic')));
console.log('\nStrategic details:');
result1.details.forEach((d, i) => {
  if (d.includes('攻撃') || d.includes('キングサイド')) {
    console.log(`- ${d}`);
  }
});
console.log('Key points:', result1.keyPoints);

// Test 2: ポジション改善プラン（ナイトのアウトポスト）
console.log('\n\nTest 2: ポジション改善プラン');
const game2 = new Chess();
game2.load('r1bq1rk1/pp2ppbp/2np1np1/8/3PP3/2N2N2/PPP1BPPP/R1BQ1RK1 w - - 0 10');
const fen2 = game2.fen();

// ナイトをd5の理想的なアウトポストへ
const move2 = { from: 'c3', to: 'd5', piece: 'n', san: 'Nd5', color: 'w' };

const result2 = analyzer.analyzeMoveNaturalLanguage(fen2, move2, fen2);
console.log('Move:', move2.san);
console.log('Summary:', result2.summary);
console.log('Has positional plan:', result2.moveType.includes('strategic_positional'));
console.log('\nPositional details:');
result2.details.forEach((d, i) => {
  if (d.includes('アウトポスト') || d.includes('長期') || d.includes('ポジション')) {
    console.log(`- ${d}`);
  }
});

// Test 3: エンドゲーム移行プラン
console.log('\n\nTest 3: エンドゲーム移行プラン');
const game3 = new Chess();
// マテリアルアドバンテージがある中盤の局面
game3.load('r1b2rk1/pp3ppp/2n1p3/3q4/3P4/2NQ1N2/PPP2PPP/R1B1K2R w KQ - 0 12');
const fen3 = game3.fen();

// クイーン交換を提案
const move3 = { from: 'd3', to: 'd5', piece: 'q', captured: 'q', san: 'Qxd5', color: 'w' };

const result3 = analyzer.analyzeMoveNaturalLanguage(fen3, move3, fen3);
console.log('Move:', move3.san);
console.log('Summary:', result3.summary);
console.log('Has endgame plan:', result3.moveType.includes('strategic_endgame'));
console.log('\nEndgame details:');
result3.details.forEach((d, i) => {
  if (d.includes('エンドゲーム') || d.includes('クイーン交換') || d.includes('マテリアル')) {
    console.log(`- ${d}`);
  }
});

// Test 4: 複合的な戦略プラン
console.log('\n\nTest 4: 複合的な戦略');
const game4 = new Chess();
game4.load('r1bqr1k1/pp3ppp/2np1n2/2b1p3/2B1P3/3P1N2/PPP1NPPP/R1BQR1K1 w - - 0 11');
const fen4 = game4.fen();

// 中央を支配しつつ攻撃準備
const move4 = { from: 'f3', to: 'g5', piece: 'n', san: 'Ng5', color: 'w' };

const result4 = analyzer.analyzeMoveNaturalLanguage(fen4, move4, fen4);
console.log('Move:', move4.san);
console.log('Summary:', result4.summary);
console.log('All strategic types:', result4.moveType.filter(t => t.includes('strategic')));
console.log('All key points:', result4.keyPoints);

console.log('\n=== Test Complete ===');