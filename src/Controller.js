const api = require('./api');
const { createServer } = require('./sockets/server');
const Challenges = require('./Challenges');
const GameState = require('./GameState');
const VoteState = require('./VoteState');

class Controller {
  constructor() {
    this.challenges = new Challenges({ isPlaying: this.isPlaying });
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
    this.challenges.nextQueueChallenge();
  }

  handleChallengeEvent(data) {
    this.challenges.addChallenge(data.challenge);
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
      this.setVoteTimer();
    }

    const moves = data.state.moves.split(" ");
    if (moves.length < 2) {
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
      this.wss.broadcast(this.getVoteResults(), client => !!this.voteState.votes[client.ip]);
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

  isPlaying() {
    return this.gameState.playing;
  }

  isVotingOpen() {
    return this.gameState.playing && this.gameState.isOurMove();
  }

  recordVote(data, ip) {
    const moveInfo = this.gameState.getMoveInfo(data.move);
    if (!moveInfo) return;

    this.voteState.recordVote({
      vote: moveInfo,
      ip,
    });

    this.gameState.clearAbortTimer();
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
    const clock = (isVoting && this.voteState.getVoteTimeLeft()) || undefined;
    let voteResults;
    if ((isVoting && vote) || !isVoting) {
      voteResults = this.voteState.voteResults(ip);
    }
    let state = isVoting ? states.VOTING : states.WAITING;
    if (vote && isVoting)
      state = states.VOTE_SUBMITTED;

    return {
      type: 'on-connect',
      data: {
        clock,
        state,
        vote,
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
