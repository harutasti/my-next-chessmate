// Test script for removal/deflection tactics detection
import ChessMoveAnalyzer from './app/utils/chessMoveAnalyzer.js';
import { Chess } from 'chess.js';

console.log('=== Removal/Deflection Tactics Test ===\n');

const analyzer = new ChessMoveAnalyzer();

// Test 1: 基本的な除去戦術
console.log('Test 1: 守り駒の除去');
// セットアップ：白のナイトがe5でクイーンを守っている、黒がナイトを取る
const setupChess1 = new Chess();
setupChess1.load('rnb1kb1r/pppp1ppp/5n2/4N3/3QP3/8/PPP2PPP/RNB1KB1R b KQkq - 1 5');
const previousFen1 = setupChess1.fen();

// 黒がe5のナイトを取る
const move1 = { from: 'f6', to: 'e4', piece: 'n', captured: 'n', san: 'Nxe4' };
setupChess1.move('Nxe4');
const currentFen1 = setupChess1.fen();

const result1 = analyzer.analyzeMoveNaturalLanguage(previousFen1, move1, previousFen1);
console.log('Move:', move1.san);
console.log('Summary:', result1.summary);
console.log('Has removal tactic:', result1.moveType.includes('removal'));
console.log('Details:', result1.details.filter(d => d.includes('除去') || d.includes('守り')));
console.log('');

// Test 2: より複雑な除去戦術
console.log('\nTest 2: 複雑な守り駒の除去');
// セットアップ：複数の駒が絡む防御構造
const setupChess2 = new Chess();
setupChess2.load('r1bqk2r/pp1n1ppp/2pb1n2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 0 7');
const previousFen2 = setupChess2.fen();

// c6のビショップを取る（d5のポーンの守りを除去）
const move2 = { from: 'd4', to: 'c5', piece: 'p', captured: 'b', san: 'dxc5' };
setupChess2.move('dxc5');
const currentFen2 = setupChess2.fen();

const result2 = analyzer.analyzeMoveNaturalLanguage(previousFen2, move2, previousFen2);
console.log('Move:', move2.san);
console.log('Summary:', result2.summary);
console.log('Tactical types found:', result2.moveType.filter(t => t.includes('removal') || t.includes('deflection')));
console.log('Key points:', result2.keyPoints);
console.log('');

// Test 3: 守り駒がない駒取り（除去戦術ではない）
console.log('\nTest 3: 通常の駒取り（除去戦術ではない）');
const setupChess3 = new Chess();
setupChess3.load('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2');
const previousFen3 = setupChess3.fen();

// 守られていないポーンを取る
const move3 = { from: 'e4', to: 'd5', piece: 'p', captured: 'p', san: 'exd5' };
setupChess3.move('exd5');
const currentFen3 = setupChess3.fen();

const result3 = analyzer.analyzeMoveNaturalLanguage(previousFen3, move3, previousFen3);
console.log('Move:', move3.san);
console.log('Summary:', result3.summary);
console.log('Has removal tactic:', result3.moveType.includes('removal'));
console.log('Is normal capture:', result3.moveType.includes('capture'));
console.log('');

// Test 4: メイト狙いの守り駒除去
console.log('\nTest 4: メイトを狙う守り駒の除去');
// h7のメイトを防いでいるf6のナイトを除去
const setupChess4 = new Chess();
setupChess4.load('r1bq1rk1/ppp2ppp/2n2n2/3p4/2PP4/2N5/PP2QPPP/R1B1KB1R w KQ - 0 8');
// クイーンをh5に配置してh7への脅威を作る
setupChess4.move('Qh5');
const previousFen4 = setupChess4.fen();

// Bxf6でナイトを取り、h7へのメイトの脅威を作る
const testChess4 = new Chess(previousFen4);
// まずビショップをc1からg5に移動する必要がある
testChess4.move('Bg5');
const setupFen4 = testChess4.fen();
const move4 = { from: 'g5', to: 'f6', piece: 'b', captured: 'n', san: 'Bxf6' };

const result4 = analyzer.analyzeMoveNaturalLanguage(setupFen4, move4, setupFen4);
console.log('Move:', move4.san);
console.log('Summary:', result4.summary);
console.log('Details about removal:', result4.details.filter(d => d.includes('除去') || d.includes('メイト')));

console.log('\n=== Test Complete ===');