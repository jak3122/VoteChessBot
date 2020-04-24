const Chess = require('chess.js').Chess;

class GameState {
  constructor() {
    this.gameId = null;
    this.apiGame = null;
    this.abortTimer = null;
    this.playing = false;
  }

  init(apiGame) {
    this.apiGame = apiGame;
    this.gameId = apiGame.game.id;
    this.game = new Chess();
    this.playing = true;
    this.loadGameMoves()
  }

  setId(gameId) {
    this.gameId = gameId;
  }

  loadGameMoves() {
    // if we restarted the bot and connected to a game in progress,
    // we need to reload the game moves
    if (!this.apiGame.state) return;

    const playedMoves = this.apiGame.state.moves.split(" ");
    for (let move of playedMoves) {
      this.game.move(move, { sloppy: true });
    }
  }

  isOurMove(moves) {
    if (!this.apiGame) return false;
    if (moves) {
      return (
        (this.apiGame.white.id === "votechess" && moves.length % 2 === 0) ||
        (this.apiGame.black.id === "votechess" && moves.length % 2 !== 0)
      );
    } else {
      return (
        (this.apiGame.white.id === "votechess" && this.game.turn() === "w") ||
        (this.apiGame.black.id === "votechess" && this.game.turn() === "b")
      );
    }
  }

  handleNewMove(moves) {
    const newMove = moves[moves.length - 1];
    this.game.move(newMove, { sloppy: true });
    this.clearAbortTimer();
  }

  gameOver() {
    this.playing = false;
    this.clearAbortTimer();
  }

  setAbortTimer() {
    this.clearAbortTimer();
    return new Promise(resolve => {
      this.abortTimer = setTimeout(() => {
        resolve();
      }, 60000);
    });
  }

  getMoveInfo(move) {
    const m = this.game.move(move);
    if (!m) return null;

    const moveInfo = {
      ...m,
      uci: m.from + m.to,
    };
    this.game.undo();

    return moveInfo;
  }

  clearAbortTimer() {
    if (this.abortTimer) clearTimeout(this.abortTimer);
    this.abortTimer = null;
  }

}

module.exports = GameState;
