class GameState {
  constructor(movesElement) {
    this.movesElement = movesElement;

    if (!this.movesElement) return;

    const moves = Array.from(movesElement.childNodes).map(node => node.innerText);

    this.chess = new Chess();
    moves.forEach(move => this.chess.move(move));

  }

  makeMove({ san }) {
    const move = this.chess.move(san);
    return move;
  }

  moveInfo({ from, to, promotion }) {
    const move = this.chess.move({ from, to, promotion });
    if (move) {
      const { san } = move;
      this.chess.undo();

      const plies = this.chess.history().length;
      const moveNumber = Math.floor(plies / 2) + 1;
      const isBlack = plies % 2 === 0 ? false : true;
      const dots = isBlack ? '...' : '.';
      const text = `${moveNumber}${dots} ${san}`;

      return { san, moveNumber, text, from, to, promotion };
    }

    return null;
  }

  promotionInfo({ from, to }) {
    const promotionQ = this.moveInfo({ from, to, promotion: 'q' });
    if (!promotionQ) return null;

    const underPromotions = [];
    for (let p of ['n', 'r', 'b']) {
      const move = this.moveInfo({ from, to, promotion: p });
      underPromotions.push(move);
    }

    return [promotionQ, ...underPromotions];
  }

}
