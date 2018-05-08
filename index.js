const api = require("./api");
const Chess = require("chess.js").Chess;

const VOTE_SECONDS = process.env.VOTE_SECONDS || 15;

let playing = false;

let challengeQueue = [];

let votes = {};

let game;

let currentGameFull;

let voteTimer = null;

let abortTimer = null;

let waitingForVotes = false;

api.connect(onEvent, onEventStreamEnd);

clearVoteTimer();

function onEvent(data) {
  if (data.type === "challenge") {
    // console.log("received challenge:", data);
    if (isGoodChallenge(data)) {
      if (playing) {
        challengeQueue.push(data);
      } else {
        const challengeId = data.challenge.id;
        api.acceptChallenge(challengeId);
      }
    } else {
      const challengeId = data.challenge.id;
      // console.log("decline challenge:", data);
      api.declineChallenge(challengeId);
    }
  } else if (data.type === "gameStart") {
    playing = true;
    votes = {};
    const gameId = data.game.id;
    // console.log("new game", gameId);
    api.sendChat(
      gameId,
      "spectator",
      "Use !<move> to vote for a move, e.g. !e4 or !O-O, or !resign to vote for resignation."
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
    data.challenge.speed === "rapid"
  );
}

function watchGame(gameId) {
  game = new Chess();
  api.listenGame(gameId, onGameEvent, onGameEnd);
}

function onGameEvent(data) {
  if (data.type === "gameFull") {
    currentGameFull = data;
    clearVoteTimer();
    // console.log("new game:", data);
    // if we restarted the bot and connected to a game in progress,
    // we need to reload the game moves
    const playedMoves = currentGameFull.state.moves.split(" ");
    console.log("restoring moves:", playedMoves);
    for (let move of playedMoves) {
      game.move(move, { sloppy: true });
    }
    if (isOurMove()) {
      api.sendChat(
        currentGameFull.id,
        "spectator",
        `Voting ends in ${VOTE_SECONDS} seconds.`
      );
      setVoteTimer();
    } else {
      setAbortTimer();
    }
  } else if (data.type == "gameState") {
    // console.log("new move:", data);
    const moves = data.moves.split(" ");
    if (!isOurMove(moves)) {
      return;
    }
    clearAbortTimer();
    if (moves.length < 2) {
      setAbortTimer();
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
    setVoteTimer();
  } else if (data.type == "chatLine" && data.room === "spectator") {
    recordVote(data.username, data.text);
  }
}

function onGameEnd() {
  playing = false;
  api.sendChat(currentGameFull.id, "player", "Good game!");
  console.log("game ended");
  clearVoteTimer();
  clearAbortTimer();
  nextQueueChallenge();
}

function isOurMove(moves) {
  if (moves) {
    return (
      (currentGameFull.white.id === "votechess" && moves.length % 2 === 0) ||
      (currentGameFull.black.id === "votechess" && moves.length % 2 !== 0)
    );
  } else {
    return (
      (currentGameFull.white.id === "votechess" && game.turn() === "w") ||
      (currentGameFull.black.id === "votechess" && game.turn() === "b")
    );
  }
}

function setVoteTimer() {
  if (voteTimer) {
    clearTimeout(voteTimer);
  }
  voteTimer = setTimeout(() => {
    let moves = Object.values(votes);
    console.log("moves values:", moves);
    if (moves.length === 0) {
      console.log("No votes received");
      if (!waitingForVotes) {
        api.sendChat(
          currentGameFull.id,
          "spectator",
          `No votes received, waiting for votes.`
        );
      }
      waitingForVotes = true;
      votes = {};
      setVoteTimer();
      return;
    }
    // convert to SAN so different move forms are counted as the same move
    moves = moves.map(move => {
      if (move === "resign") return "resign";
      const moveObj = game.move(move);
      if (moveObj && moveObj.san) {
        game.undo();
        return moveObj.san;
      } else {
        return move;
      }
    });
    console.log("moves to SAN:", moves);
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
      console.log("sortedVotes empty");
      if (!waitingForVotes) {
        api.sendChat(
          currentGameFull.id,
          "spectator",
          `No votes received, waiting for votes.`
        );
      }
      waitingForVotes = true;
      votes = {};
      setVoteTimer();
      return;
    }
    console.log("sortedVotes:", sortedVotes);
    // find winning move(s)
    // ties are broken by a random choice
    let { winners, winnerVotes } = findAllWinners(sortedVotes);
    console.log("winners:", winners.map(w => (w.san ? w.san : w)));
    if (winners.length === 0) {
      if (!waitingForVotes) {
        api.sendChat(
          currentGameFull.id,
          "spectator",
          `No votes received, waiting for votes.`
        );
        waitingForVotes = true;
      }
      console.log("no legal votes");
      setVoteTimer();
      return;
    }
    waitingForVotes = false;
    if (winners.length === 1) {
      const winnerObj = winners[0];
      if (winnerObj === "resign") {
        api.sendChat(
          currentGameFull.id,
          "spectator",
          `Resignation won with ${winnerVotes} votes.`
        );
        api.resignGame(currentGameFull.id);
        votes = {};
        return;
      }
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
      if (randWinner === "resign") {
        api.sendChat(
          currentGameFull.id,
          "spectator",
          `Resignation won with ${winnerVotes} votes.`
        );
        api.resignGame(currentGameFull.id);
        votes = {};
        return;
      }
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

function findAllWinners(sortedVotes) {
  if (sortedVotes.length === 0) return [];
  const maxVotes = sortedVotes[0][1];
  const winners = sortedVotes.filter(vote => vote[1] === maxVotes);
  const finalWinners = [];
  winners.forEach(winner => {
    const san = winner[0];
    if (san === "resign") {
      finalWinners.push("resign");
      return;
    }
    const moveObj = game.move(san, { sloppy: true });
    if (moveObj) {
      game.undo();
      finalWinners.push(moveObj);
    }
  });
  return { winners: finalWinners, winnerVotes: maxVotes };
}

function clearVoteTimer() {
  if (voteTimer) clearTimeout(voteTimer);
  console.log("cleared vote timer");
}

function setAbortTimer() {
  if (abortTimer) clearTimeout(abortTimer);
  // console.log("setting abort timer");
  abortTimer = setTimeout(() => {
    console.log("aborting game");
    api.abortGame(currentGameFull.id);
  }, 60000);
}

function clearAbortTimer() {
  if (abortTimer) clearTimeout(abortTimer);
  // console.log("cleared abort timer");
}

function recordVote(username, command) {
  if (!command.startsWith("!")) {
    return;
  }
  if (
    (currentGameFull.white.id === "votechess" && game.turn() === "w") ||
    (currentGameFull.black.id === "votechess" && game.turn() === "b")
  ) {
    const move = command
      .slice(1)
      .trim()
      .split(" ")[0];
    console.log("recording vote:", move);
    votes[username] = move;
  } else {
    console.log(
      "Not recording vote. game.white.id:",
      currentGameFull.white.id,
      "game.turn():",
      game.turn()
    );
    console.log(
      " game.black.id:",
      currentGameFull.black.id,
      "game.turn():",
      game.turn()
    );
  }
}

async function nextQueueChallenge() {
  while (challengeQueue.length > 0) {
    const challenge = challengeQueue.shift();
    const accepted = await api.acceptChallenge(challenge.challenge.id);
    if (accepted) {
      break;
    }
  }
}
