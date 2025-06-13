// Simple test for removal tactics
import ChessMoveAnalyzer from './app/utils/chessMoveAnalyzer.js';
import { Chess } from 'chess.js';

console.log('=== Simple Removal Tactics Test ===\n');

const analyzer = new ChessMoveAnalyzer();

// Test 1: 簡単な除去戦術のテスト
console.log('Test 1: 基本的な守り駒の除去');

// 初期位置から数手進めた局面を作成
const game = new Chess();
game.move('e4');
game.move('e5');
game.move('Nf3');
game.move('Nc6');
game.move('Bc4');
game.move('Nf6');
game.move('d3');
game.move('Bc5');
game.move('Bg5'); // ビショップがf6のナイトをピン

const previousFen = game.fen();
console.log('Position before capture:', previousFen);

// h7のポーンを守っているf6のナイトを取る
const move = { from: 'g5', to: 'f6', piece: 'b', captured: 'n', san: 'Bxf6', color: 'w' };

const result = analyzer.analyzeMoveNaturalLanguage(previousFen, move, previousFen);
console.log('\nMove:', move.san);
console.log('Summary:', result.summary);
console.log('Move types:', result.moveType);
console.log('\nAll details:');
result.details.forEach((d, i) => console.log(`${i+1}. ${d}`));
console.log('\nKey points:', result.keyPoints);

// Test 2: 通常の駒取り（除去ではない）
console.log('\n\nTest 2: 通常の駒取り');
const game2 = new Chess();
game2.move('e4');
game2.move('d5');
const prevFen2 = game2.fen();

const move2 = { from: 'e4', to: 'd5', piece: 'p', captured: 'p', san: 'exd5', color: 'w' };

const result2 = analyzer.analyzeMoveNaturalLanguage(prevFen2, move2, prevFen2);
console.log('\nMove:', move2.san);
console.log('Summary:', result2.summary);
console.log('Has removal:', result2.moveType.includes('removal'));
console.log('Has capture:', result2.moveType.includes('capture'));

console.log('\n=== Test Complete ===');