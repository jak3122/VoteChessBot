const api = require('./api');
const { createServer } = require('./sockets/server');
const { isGoodChallenge } = require('./utils/helpers');
const Challenges = require('./Challenges');
const GameState = require('./GameState');
const VoteState = require('./VoteState');

class Controller {
  constructor() {
    this.challenges = new Challenges();
    this.gameState = new GameState();
    this.voteState = new VoteState();
    this.wss = createServer(this);
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
    this.voteState.init(data);
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
    this.broadcastVoteClock();
    const interval = setInterval(() => {
      if (!this.isVotingOpen()) {
        clearInterval(interval);
        return;
      }

      const legalMoves = this.gameState.game.moves({ verbose: true });
      const move = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      const id = `user_${Math.floor(Math.random() * 10000)}`;
      this.recordVote({
        move,
      }, id);
      this.wss.broadcast(this.getVoteResults());
    }, 1000);
  }

  broadcastVoteClock() {
    this.wss.broadcast({
      type: 'vote-timer',
      data: this.voteState.getVoteTimeLeft(),
    });
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
    return this.gameState.playing && this.gameState.isOurMove();
  }

  recordVote(data, ip) {
    const moveInfo = this.gameState.getMoveInfo(data.move);
    this.voteState.recordVote({
      vote: moveInfo,
      ip,
    });
  }

  onConnect(ip) {
    const states = {
      WAITING: 0,
      VOTING: 0.01,
      VOTE_ENTERED: 0.02,
      VOTE_SUBMITTED: 0.03,
    };
    const vote = this.voteState.votes[ip];
    const isVoting = this.isVotingOpen();
    const clock = isVoting && this.voteState.getVoteTimeLeft();
    const voteResults = isVoting && vote && this.voteState.voteResults(ip);
    let state = isVoting ? states.VOTING : states.WAITING;
    if (vote)
      state = states.VOTE_SUBMITTED;

    return {
      type: 'on-connect',
      data: {
        clock,
        state,
        voteResults,
      },
    };
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

  getVoteResults() {
    const msg = {
      type: 'vote-results',
      data: this.voteState.voteResults(),
    };

    return msg;
  }
}

const ctrl = new Controller();
module.exports = ctrl;
