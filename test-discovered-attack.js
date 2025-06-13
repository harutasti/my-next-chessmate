// Test script for discovered attack detection
import ChessMoveAnalyzer from './app/utils/chessMoveAnalyzer.js';
import { Chess } from 'chess.js';

console.log('=== Discovered Attack Detection Test ===\n');

const analyzer = new ChessMoveAnalyzer();

// Test 1: 基本的な開き攻撃
console.log('Test 1: ナイトが動いてビショップの攻撃ラインを開く');
// 白ビショップがa1、白ナイトがd4、黒クイーンがh8にある局面
const previousFen1 = 'r1bqkbnr/pppp1ppp/2n5/4p3/3N4/8/PPPPPPPP/B1BQKRNR w KQkq - 0 1';
const currentFen1 = 'r1bqkbnr/pppp1ppp/2n5/4p3/8/5N2/PPPPPPPP/B1BQKRNR b KQkq - 1 1';
const move1 = {
  from: 'd4',
  to: 'f3',
  piece: 'n',
  san: 'Nf3',
  color: 'w'
};

const result1 = analyzer.analyzeMoveNaturalLanguage(currentFen1, move1, previousFen1);
console.log('Move:', move1.san);
console.log('Summary:', result1.summary);
console.log('Has discovered attack:', result1.moveType.includes('discovered-attack'));
console.log('Details about discovered attack:', result1.details.filter(d => d.includes('開き')));
console.log('');

// Test 2: 開きチェック
console.log('\nTest 2: 開きチェック');
// より明確な開きチェックの局面をセットアップ
const previousFen2 = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 5';
// e4のポーンを動かして、c2のビショップがe8のキングを攻撃
const setupFen2 = 'r1bqk2r/pppp1ppp/2n2n2/2b1pP2/2B5/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 5';
const move2 = {
  from: 'e4',
  to: 'e5',
  piece: 'p',
  san: 'e5',
  color: 'w'
};

const result2 = analyzer.analyzeMoveNaturalLanguage(setupFen2, move2, previousFen2);
console.log('Move:', move2.san);
console.log('Summary:', result2.summary);
console.log('Is discovered check:', result2.details.some(d => d.includes('開きチェック')));
console.log('');

// Test 3: 開き攻撃がない通常の手
console.log('\nTest 3: 開き攻撃がない通常の手');
const fen3 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const move3 = {
  from: 'e2',
  to: 'e4',
  piece: 'p',
  san: 'e4',
  color: 'w'
};

const result3 = analyzer.analyzeMoveNaturalLanguage(fen3, move3);
console.log('Move:', move3.san);
console.log('Has discovered attack:', result3.moveType.includes('discovered-attack'));
console.log('Move types:', result3.moveType);
console.log('');

// Test 4: 複雑な開き攻撃（複数の標的）
console.log('\nTest 4: 複雑な開き攻撃');
// クイーンがルークとビショップの両方を攻撃できる局面
const complexPrevFen = 'r3kb1r/pp1ppppp/2n2n2/q7/3NP3/8/PPP2PPP/R1BQKB1R w KQkq - 0 1';
const complexCurrFen = 'r3kb1r/pp1ppppp/2n2n2/q7/4P3/5N2/PPP2PPP/R1BQKB1R b KQkq - 1 1';
const move4 = {
  from: 'd4',
  to: 'f3',
  piece: 'n',
  san: 'Nf3',
  color: 'w'
};

const result4 = analyzer.analyzeMoveNaturalLanguage(complexCurrFen, move4, complexPrevFen);
console.log('Move:', move4.san);
console.log('Summary:', result4.summary);
console.log('Key points:', result4.keyPoints);

// デバッグ情報
console.log('\n=== Debug Info ===');
console.log('Testing direction calculation:');
const dir = analyzer.getDirectionBetweenSquares('d1', 'd8');
console.log('Direction from d1 to d8:', dir);
const dir2 = analyzer.getDirectionBetweenSquares('a1', 'h8');
console.log('Direction from a1 to h8:', dir2);

console.log('\n=== Test Complete ===');