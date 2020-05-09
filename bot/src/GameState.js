const Chess = require('chess.js').Chess;
const { BOT_USERNAME } = require('./utils/constants');

class GameState {
  constructor() {
    this.gameId = null;
    this.apiGame = null;
    this.abortTimer = null;
    this.playing = false;
  }

  init(apiGame) {
    this.apiGame = apiGame;
    this.gameId = apiGame.id;
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
    const botId = BOT_USERNAME.toLowerCase();
    if (moves) {
      return (
        (this.apiGame.white.id === botId && moves.length % 2 === 0) ||
        (this.apiGame.black.id === botId && moves.length % 2 !== 0)
      );
    } else {
      return (
        (this.apiGame.white.id === botId && this.game.turn() === "w") ||
        (this.apiGame.black.id === botId && this.game.turn() === "b")
      );
    }
  }

  isGameOver() {
    return this.game.game_over();
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

  getMoveInfo(move) {
    const m = this.game.move(move);
    if (!m) return null;

    const moveInfo = {
      ...m,
      uci: m.from + m.to + (m.promotion || ''),
    };
    this.game.undo();

    return moveInfo;
  }

  setAbortTimer() {
    this.clearAbortTimer();
    return new Promise(resolve => {
      this.abortTimer = setTimeout(() => {
        resolve();
      }, 60000);
    });
  }

  clearAbortTimer() {
    if (this.abortTimer) clearTimeout(this.abortTimer);
    this.abortTimer = null;
  }

}

module.exports = GameState;
