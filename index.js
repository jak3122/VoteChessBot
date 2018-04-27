const api = require("./api");
const Chess = require("chess.js").Chess;

const VOTE_SECONDS = 10;

let playing = false;

let challengeQueue = [];

let votes = {};

let game;

let currentGameFull;

let voteTimer = null;

api.connect(onEvent, onEventStreamEnd);

function onEvent(data) {
  if (data.type === "challenge") {
    console.log("received challenge:", data);
    if (isGoodChallenge(data)) {
      if (playing) {
        challengeQueue.push(data);
      } else {
        const challengeId = data.challenge.id;
        api.acceptChallenge(challengeId);
      }
    } else {
      const challengeId = data.challenge.id;
      console.log("decline challenge:", data);
      api.declineChallenge(challengeId);
    }
  } else if (data.type === "gameStart") {
    playing = true;
    votes = {};
    const gameId = data.game.id;
    console.log("new game", gameId);
    api.sendChat(
      gameId,
      "spectator",
      "Use !<move> to vote for a move, e.g. !e4 or !O-O"
    );
    api.sendChat(
      gameId,
      "player",
      "You're playing against the crowd - good luck!"
    );
    watchGame(gameId);
  }
}

function onEventStreamEnd() {
  console.log("event stream closed");
}

function isGoodChallenge(data) {
  return (
    data.challenge.variant.key === "standard" &&
    data.challenge.timeControl.type === "clock" &&
    data.challenge.perf.name === "Rapid"
  );
}

function watchGame(gameId) {
  game = new Chess();
  api.listenGame(gameId, onGameEvent, onGameEnd);
}

function onGameEvent(data) {
  if (data.type === "gameFull") {
    currentGameFull = data;
    console.log("new game:", data);
    if (currentGameFull.white.id === "votechess") {
      api.sendChat(
        currentGameFull.id,
        "spectator",
        `Voting ends in ${VOTE_SECONDS} seconds.`
      );
      setMoveTimer();
    }
  } else if (data.type == "gameState") {
    console.log("new move:", data);
    const moves = data.moves.split(" ");
    if (!isOurMove(moves)) {
      return;
    }
    const newMove = moves[moves.length - 1];
    game.move(newMove, { sloppy: true });
    if (game.game_over()) {
      return;
    }
    api.sendChat(
      currentGameFull.id,
      "spectator",
      `Voting ends in ${VOTE_SECONDS} seconds.`
    );
    setMoveTimer();
  } else if (data.type == "chatLine" && data.room === "spectator") {
    recordVote(data.username, data.text);
  }
}

function onGameEnd() {
  playing = false;
  api.sendChat(currentGameFull.id, "player", "Good game!");
  console.log("game ended");
  nextQueueChallenge();
}

function isOurMove(moves) {
  return (
    (currentGameFull.white.id === "votechess" && moves.length % 2 === 0) ||
    (currentGameFull.black.id === "votechess" && moves.length % 2 !== 0)
  );
}

function setMoveTimer() {
  if (voteTimer) {
    clearTimeout(voteTimer);
  }
  voteTimer = setTimeout(() => {
    const moves = Object.values(votes);
    if (moves.length === 0) {
      api.sendChat(
        currentGameFull.id,
        "spectator",
        `No votes received, voting extended another ${VOTE_SECONDS} seconds.`
      );
      setMoveTimer();
      return;
    }
    // tally the votes
    const counts = [];
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      counts[move] = counts[move] ? counts[move] + 1 : 1;
    }
    // sort with highest votes first into [ [move, numVotes], ... ] format
    const sortedVotes = [];
    for (let move in counts) {
      sortedVotes.push([move, counts[move]]);
    }
    sortedVotes.sort((a, b) => b[1] - a[1]);
    if (sortedVotes.length === 0) {
      return;
    }
    let winnerVotes;
    let winners = [];
    // find winning move(s)
    // ties are broken by a random choice
    for (let i = 0; i < sortedVotes.length; i++) {
      const thisSAN = sortedVotes[i][0];
      const thisVotes = sortedVotes[i][1];
      if (winnerVotes && thisVotes === winnerVotes) {
        const thisObj = game.move(thisSAN, { sloppy: true });
        game.undo();
        if (thisObj) {
          winners.push(thisObj);
        }
      } else {
        const thisObj = game.move(thisSAN, { sloppy: true });
        game.undo();
        if (thisObj) {
          winners.push(thisObj);
          winnerVotes = thisVotes;
        }
      }
    }
    if (winners.length === 0) {
      api.sendChat(
        currentGameFull.id,
        "spectator",
        `No votes received, voting extended another ${VOTE_SECONDS} seconds.`
      );
      setMoveTimer();
      return;
    }
    if (winners.length === 1) {
      const winnerObj = winners[0];
      const winnerUci = winnerObj.from + winnerObj.to;
      api.sendChat(
        currentGameFull.id,
        "spectator",
        `${winnerObj.san} won with ${winnerVotes} votes.`
      );
      game.move(winnerObj.san);
      api.makeMove(currentGameFull.id, winnerUci);
    } else {
      const randWinner = winners[Math.floor(Math.random() * winners.length)];
      api.sendChat(
        currentGameFull.id,
        "spectator",
        `The following moves tied with ${winnerVotes} votes: ${winners
          .map(m => m.san)
          .join(", ")}`
      );
      api.sendChat(
        currentGameFull.id,
        "spectator",
        `Randomly chosen winner: ${randWinner.san}`
      );
      const winnerUci = randWinner.from + randWinner.to;
      game.move(randWinner.san);
      api.makeMove(currentGameFull.id, winnerUci);
    }
    votes = {};
  }, VOTE_SECONDS * 1000);
}

function recordVote(username, command) {
  if (!command.startsWith("!")) {
    return;
  }
  if (
    (currentGameFull.white.id === "votechess" && game.turn() === "w") ||
    (currentGameFull.black.id === "votechess" && game.turn() === "b")
  ) {
    const move = command.slice(1);
    console.log("recording vote:", move);
    votes[username] = move;
  }
}

async function nextQueueChallenge() {
  while (challengeQueue.length > 0) {
    const challenge = challengeQueue.shift();
    const accepted = await acceptChallenge(challenge.challenge.id);
    if (accepted) {
      break;
    }
  }
}
