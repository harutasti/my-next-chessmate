// app/components/ChessBoard.jsx
import React from "react";
import { Chessboard } from "react-chessboard";

const ChessBoard = ({
  position,
  onPieceDrop,
  boardWidth,
  onSquareClick,
  customSquareStyles,
  arePiecesDraggable,
  ...props
}) => {
  return (
    <div className="mx-auto" style={{ width: boardWidth || "400px" }}>
      <Chessboard
        id="MyCustomChessboard"
        position={position}
        onPieceDrop={onPieceDrop}
        onSquareClick={onSquareClick}
        customSquareStyles={customSquareStyles}
        boardWidth={boardWidth || 400}
        arePiecesDraggable={arePiecesDraggable}
        {...props}
      />
    </div>
  );
};

export default ChessBoard;
