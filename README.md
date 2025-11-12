# Next ChessMate

A powerful chess analysis application built with Next.js and Stockfish engine integration. This application provides comprehensive chess game analysis with detailed move evaluation, tactical pattern detection, and positional assessment.

## Features

### 🎮 Game Play
- Interactive chess board with drag-and-drop pieces
- Play against Stockfish AI with adjustable difficulty
- Full game history and move navigation
- Real-time position evaluation

### 📊 Advanced Analysis
- **Stockfish Integration**: Deep position analysis powered by Stockfish 16 NNUE
- **Evaluation Graph**: Visual representation of game evaluation over time
- **Multi-depth Analysis**: Analyze positions at different search depths (10, 15, 20, 25 moves)

### 🎯 Tactical Analysis
#### Level 1 - Basic Tactics
- Fork detection (especially knight forks)
- Check patterns
- Material capture opportunities
- Threat creation analysis

#### Level 2 - Positional Elements
- Center control evaluation
- Piece activity analysis
  - Open and semi-open files
  - Good vs bad bishops
  - Piece mobility metrics
- Pawn structure analysis
  - Isolated pawns
  - Doubled pawns
- Outpost detection
- Weak square identification

#### Level 3 - Advanced Patterns (In Development)
- Concrete variation generation with explanations
- Advanced tactical patterns:
  - Skewers
  - Discovered attacks
  - Pins
  - Double attacks
- Strategic planning evaluation

## Tech Stack

- **Frontend**: Next.js 15, React 19
- **Chess Logic**: chess.js
- **Chess Board**: react-chessboard
- **Chess Engine**: Stockfish 16 NNUE (WebAssembly)
- **Styling**: Tailwind CSS

## Getting Started

### Prerequisites
- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/mnwdykn/next-chessmate.git
cd next-chessmate
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
next-chessmate/
├── app/
│   ├── game/              # Game play interface
│   ├── analysis/           # Analysis dashboard
│   ├── components/         # Reusable components
│   │   ├── ChessBoard.jsx
│   │   └── EvaluationGraph.jsx
│   ├── hooks/              # Custom React hooks
│   │   ├── useChess.js
│   │   └── useStockfish.js
│   └── utils/              # Utility functions
│       ├── chessMoveAnalyzer.js
│       ├── chessErrorHandler.js
│       └── stockfishWorkerPool.js
├── public/
│   └── stockfish/          # Stockfish WASM files
└── docs/                   # Documentation

```

## Usage

### Playing a Game
Navigate to `/game` to start playing chess. You can:
- Make moves by dragging pieces
- Play against the Stockfish AI
- Undo/redo moves
- Reset the board

### Analyzing Positions
Go to `/analysis` for deep position analysis:
- Load any position using FEN notation
- Get multi-depth Stockfish evaluations
- View detailed tactical and positional assessments
- Explore suggested variations

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- [Stockfish](https://stockfishchess.org/) - The world's strongest open-source chess engine
- [chess.js](https://github.com/jhlywa/chess.js) - Chess logic implementation
- [react-chessboard](https://github.com/Clariity/react-chessboard) - React chess board component
