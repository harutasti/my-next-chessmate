// Test script for multi-move variations
import ChessMoveAnalyzer from './app/utils/chessMoveAnalyzer.js';
import { Chess } from 'chess.js';

console.log('=== Multi-Move Variations Test ===\n');

const analyzer = new ChessMoveAnalyzer();

// Test 1: 駒交換の変化（複数手）
console.log('Test 1: 駒交換の変化テスト');
const fen1 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
const move1 = { from: 'b8', to: 'c6', piece: 'n', san: 'Nc6' };

const result1 = analyzer.analyzeMoveNaturalLanguage(fen1, move1);
console.log('Move:', move1.san);
console.log('Summary:', result1.summary);
console.log('\nVariations:');
result1.variations.forEach((v, i) => {
  console.log(`${i+1}. ${v.moves || v.move}`);
  console.log(`   ${v.explanation}`);
  console.log(`   深度: ${v.depth || 1}, 評価: ${v.evaluation}`);
});

// Test 2: チェックを含む複雑な変化
console.log('\n\nTest 2: 駒取りの後の変化');
const fen2 = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
const move2 = { from: 'c4', to: 'f7', piece: 'b', san: 'Bxf7+', captured: 'p' };

const result2 = analyzer.analyzeMoveNaturalLanguage(fen2, move2);
console.log('Move:', move2.san);
console.log('Summary:', result2.summary);
console.log('\nVariations:');
result2.variations.forEach((v, i) => {
  console.log(`${i+1}. ${v.moves || v.move}`);
  console.log(`   ${v.explanation}`);
  console.log(`   深度: ${v.depth || 1}, 重要: ${v.isCritical}`);
});

// Test 3: 静かな手の変化
console.log('\n\nTest 3: 静かな手の後の展開');
const fen3 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const move3 = { from: 'e2', to: 'e4', piece: 'p', san: 'e4' };

const result3 = analyzer.analyzeMoveNaturalLanguage(fen3, move3);
console.log('Move:', move3.san);
console.log('Summary:', result3.summary);
console.log('\nVariations (limited to show most important):');
result3.variations.slice(0, 3).forEach((v, i) => {
  console.log(`${i+1}. ${v.moves || v.move}`);
  console.log(`   ${v.explanation}`);
  if (v.depth) console.log(`   深度: ${v.depth}`);
});

console.log('\n=== Test Complete ===');