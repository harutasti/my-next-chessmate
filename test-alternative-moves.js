// Test script for alternative move comparison
import ChessMoveAnalyzer from './app/utils/chessMoveAnalyzer.js';
import { Chess } from 'chess.js';

console.log('=== Alternative Move Comparison Test ===\n');

const analyzer = new ChessMoveAnalyzer();

// Test 1: 序盤での複数の開発手の比較
console.log('Test 1: 序盤の開発手の比較');
const game1 = new Chess();
game1.move('e4');
game1.move('e5');
const fen1 = game1.fen();

// 実際に指された手: Nf3
const playedMove1 = { from: 'g1', to: 'f3', piece: 'n', san: 'Nf3' };

// 代替手: Nc3, Bc4, d4
const alternatives1 = [
  { from: 'b1', to: 'c3', piece: 'n', san: 'Nc3' },
  { from: 'f1', to: 'c4', piece: 'b', san: 'Bc4' },
  { from: 'd2', to: 'd4', piece: 'p', san: 'd4' }
];

const result1 = analyzer.analyzeMoveNaturalLanguage(fen1, playedMove1, null, null, null, alternatives1);
console.log('Played move:', playedMove1.san);
console.log('Summary:', result1.summary);
console.log('\nAlternative move analysis:');
result1.details.forEach((d, i) => {
  if (d.includes('も') || d.includes('選択') || d.includes('比較')) {
    console.log(`- ${d}`);
  }
});

// Test 2: 戦術的な局面での選択
console.log('\n\nTest 2: 戦術的な選択の比較');
const game2 = new Chess();
// より複雑な中盤の局面をセットアップ
game2.load('r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
const fen2 = game2.fen();

// 実際に指された手: Bxc6 (駒交換)
const playedMove2 = { from: 'b5', to: 'c6', piece: 'b', captured: 'n', san: 'Bxc6' };

// 代替手: O-O (キャスリング), d3 (ポーン前進), Nc3 (ナイト開発)
const alternatives2 = [
  { from: 'e1', to: 'g1', san: 'O-O' },
  { from: 'd2', to: 'd3', piece: 'p', san: 'd3' },
  { from: 'b1', to: 'c3', piece: 'n', san: 'Nc3' }
];

const result2 = analyzer.analyzeMoveNaturalLanguage(fen2, playedMove2, null, null, null, alternatives2);
console.log('Played move:', playedMove2.san);
console.log('Summary:', result2.summary);
console.log('Key points:', result2.keyPoints.filter(k => k.includes('代替')));
console.log('\nComparison details:');
result2.details.forEach((d, i) => {
  if (d.includes('も') || d.includes('選択') || d.includes('O-O') || d.includes('キャスリング')) {
    console.log(`- ${d}`);
  }
});

// Test 3: 明確に優劣がある選択
console.log('\n\nTest 3: 明確な優劣がある選択');
const game3 = new Chess();
game3.load('rnbqkb1r/pp1ppppp/5n2/2p5/2P5/5N2/PP1PPPPP/RNBQKB1R w KQkq c6 0 3');
const fen3 = game3.fen();

// 実際に指された手: e3 (控えめなポーン前進)
const playedMove3 = { from: 'e2', to: 'e3', piece: 'p', san: 'e3' };

// 代替手: d4 (中央突破), Nc3 (ナイト開発), e4 (積極的な中央支配)
const alternatives3 = [
  { from: 'd2', to: 'd4', piece: 'p', san: 'd4' },
  { from: 'b1', to: 'c3', piece: 'n', san: 'Nc3' },
  { from: 'e2', to: 'e4', piece: 'p', san: 'e4' }
];

const result3 = analyzer.analyzeMoveNaturalLanguage(fen3, playedMove3, null, null, null, alternatives3);
console.log('Played move:', playedMove3.san);
console.log('Summary:', result3.summary);
console.log('\nAlternative analysis:');
const hasAlternatives = result3.details.some(d => d.includes('より強力な選択肢'));
console.log('Has better alternatives:', hasAlternatives);
result3.details.forEach((d, i) => {
  if (d.includes('d4') || d.includes('e4') || d.includes('中央') || d.includes('より') || d.includes('選択')) {
    console.log(`- ${d}`);
  }
});

// Test 4: 同等の価値がある手の比較
console.log('\n\nTest 4: 同等の価値がある手');
const game4 = new Chess();
const fen4 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// 実際に指された手: e4
const playedMove4 = { from: 'e2', to: 'e4', piece: 'p', san: 'e4' };

// 代替手: d4, Nf3 (すべて良い開始手)
const alternatives4 = [
  { from: 'd2', to: 'd4', piece: 'p', san: 'd4' },
  { from: 'g1', to: 'f3', piece: 'n', san: 'Nf3' }
];

const result4 = analyzer.analyzeMoveNaturalLanguage(fen4, playedMove4, null, null, null, alternatives4);
console.log('Played move:', playedMove4.san);
console.log('Summary:', result4.summary);
console.log('\nSimilar value alternatives:');
result4.details.forEach((d, i) => {
  if (d.includes('同様に') || d.includes('同等') || d.includes('スタイル')) {
    console.log(`- ${d}`);
  }
});

console.log('\n=== Test Complete ===');