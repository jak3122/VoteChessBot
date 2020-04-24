const api = require('./api');
const Challenges = require('./Challenges');
const GameState = require('./GameState');
const VoteState = require('./VoteState');
const { isGoodChallenge } = require('./utils/helpers');

class Controller {
  constructor() {
    this.challenges = new Challenges();
    this.gameState = new GameState();
    this.voteState = new VoteState();
  }

  connect() {
    api.connect(
      this.onStreamEvent.bind(this),
      this.connect.bind(this),
    );
  }

  onStreamEvent(data) {
    switch (data.type) {
      case "challenge":
        this.handleChallengeEvent(data);
        break;
      case "gameStart":
        this.handleGameStartEvent(data);
        break;
      default:
        break;
    }
  }

  onStreamEnd() {
    console.log("event stream closed");
  }

  onGameEvent(data) {
    console.log(data.type);
    switch (data.type) {
      case "gameFull":
        this.handleGameFullEvent(data);
        break;
      case "gameState":
        this.handleGameStateEvent(data);
        break;
      case "chatLine":
        break;
      default:
        break;
    }
  }

  onGameEnd() {
    this.chatPlayer('Good game!');
    this.gameState.gameOver();
    this.voteState.gameOver();
    setTimeout(() => this.challenges.nextQueueChallenge(), 1000);
  }

  handleChallengeEvent(data) {
    const challengeId = data.challenge.id;
    if (!isGoodChallenge(data)) {
      api.declineChallenge(challengeId);
      return;
    }

    if (this.gameState.playing) {
      this.challenges.addChallenge(data.challenge);
    } else {
      api.acceptChallenge(challengeId);
    }
  }

  handleGameStartEvent(data) {
    this.gameState.setId(data.game.id);
    // this.chatSpectator("Install the Firefox or Chrome extension to play - links in profile");
    this.chatPlayer("You're playing against the crowd - good luck!");
    api.listenGame(
      this.gameState.gameId,
      this.onGameEvent.bind(this),
      this.onGameEnd.bind(this)
    );
  }

  handleGameFullEvent(data) {
    this.gameState.init(data);
    this.voteState.clearVoteTimer();
    if (this.gameState.isOurMove()) {
      // this.chatSpectator(`Voting ends in ${this.voteState.voteTime()} seconds.`);
      this.setVoteTimer();
    } else {
      this.setAbortTimer();
    }
  }

  handleGameStateEvent(data) {
    const moves = data.moves.split(" ");
    this.gameState.handleNewMove(moves);

    if (!this.gameState.isOurMove(moves)) {
      return;
    }

    if (this.gameState.isGameOver()) {
      return;
    }

    if (moves.length < 2) {
      this.setAbortTimer();
    }

    this.setVoteTimer();
  }

  setVoteTimer() {
    this.voteState.setVoteTimer().then(winningMove => this.handleVoteWinner(winningMove));
  }

  setAbortTimer() {
    this.gameState.setAbortTimer().then(() => api.abortGame(this.gameState.gameId));
  }

  handleVoteWinner(winningMove) {
    if (!winningMove) {
      this.setVoteTimer();
      return;
    }

    if (winningMove === 'resign') {
      api.resignGame(this.gameState.gameId);
    } else {
      this.gameState.game.move(winningMove.san);
      api.makeMove(this.gameState.gameId, winningMove.uci);
    }
  }

  isVotingOpen() {
    return this.gameState.playing;
  }

  recordVote(data) {
    const moveInfo = this.gameState.getMoveInfo(data.move);
    this.voteState.recordVote({
      vote: moveInfo,
      username: data.username,
    });
  }

  getVoteResults() {
    return this.voteState.voteResults();
  }

  chat(text, room) {
    const gameId = this.gameState.gameId;
    api.sendChat(gameId, room, text);
  }

  chatPlayer(text) {
    this.chat(text, "player");
  }

  chatSpectator(text) {
    this.chat(text, "spectator");
  }
}

const ctrl = new Controller();
module.exports = ctrl;
