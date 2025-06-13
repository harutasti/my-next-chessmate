// Simple test for discovered attack detection
import ChessMoveAnalyzer from './app/utils/chessMoveAnalyzer.js';

console.log('=== Simple Discovered Attack Test ===\n');

const analyzer = new ChessMoveAnalyzer();

// Test 1: 最も単純な開き攻撃
console.log('Test 1: 単純な開き攻撃');
// 初期局面から数手進めた状態
const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const move = {
  from: 'e2',
  to: 'e4',
  piece: 'p',
  san: 'e4',
  color: 'w'
};

// previousFenなしでテスト（開き攻撃は検出されないはず）
const result1 = analyzer.analyzeMoveNaturalLanguage(fen, move);
console.log('Without previousFen:');
console.log('Summary:', result1.summary);
console.log('Move types:', result1.moveType);
console.log('');

// Test 2: より明確な開き攻撃の例
console.log('Test 2: 明確な開き攻撃');
// 手動で作成した局面：白ビショップc1、白ポーンe3、黒クイーンg5
const testPrevFen = 'rnb1kbnr/pppppppp/8/6q1/8/4P3/PPPP1PPP/RNBQKBNR w KQkq - 0 1';
const testCurrFen = 'rnb1kbnr/pppppppp/8/4P1q1/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const testMove = {
  from: 'e3',
  to: 'e5',
  piece: 'p',
  san: 'e5',
  color: 'w'
};

const result2 = analyzer.analyzeMoveNaturalLanguage(testCurrFen, testMove, testPrevFen);
console.log('With previousFen:');
console.log('Summary:', result2.summary);
console.log('Move types:', result2.moveType);
console.log('Has discovered attack:', result2.moveType.includes('discovered-attack'));
console.log('Details:', result2.details.filter(d => d.includes('開き')));

// デバッグ：開き攻撃の検出を直接テスト
console.log('\n=== Debug: Direct Detection ===');
const chess = analyzer.chess;
chess.load(testCurrFen);
const discoveredResult = analyzer.detectDiscoveredAttack(testMove, chess, testPrevFen);
console.log('Direct detection result:', discoveredResult);

console.log('\n=== Test Complete ===');