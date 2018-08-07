const Chess = require("chess.js").Chess;
const Crazyhouse = require("crazyhouse.js").Crazyhouse;
const api = require("./api");
const {
  banUsername,
  unbanUsername,
  makeMod,
  usernameIsBanned,
  usernameIsMod
} = require("./bans");

const VOTE_SECONDS = process.env.VOTE_SECONDS || 30;
console.log(`vote time: ${VOTE_SECONDS} seconds`);

const SUPPORTED_VARIANTS = ["standard", "crazyhouse"];

const mapVariantToGameObj = variant =>
  ({
    standard: new Chess(),
    crazyhouse: new Crazyhouse()
  }[variant]);

let playing = false;

let challengeQueue = [];

let votes = {};

let game;

let currentGameFull;

let voteTimer = null;

let abortTimer = null;

let waitingForVotes = false;

api.connect(
  onEvent,
  onEventStreamEnd
);

clearVoteTimer();

function onEvent(data) {
  if (data.type === "challenge") {
    if (isGoodChallenge(data)) {
      if (playing) {
        challengeQueue.push(data);
      } else {
        const challengeId = data.challenge.id;
        api.acceptChallenge(challengeId);
      }
    } else {
      const challengeId = data.challenge.id;
      api.declineChallenge(challengeId);
    }
  } else if (data.type === "gameStart") {
    playing = true;
    votes = {};
    const gameId = data.game.id;
    chatSpectator(
      "Use /<move> to vote for a move, e.g. /e4 or /O-O, or /resign to vote for resignation.",
      gameId
    );
    chatPlayer("You're playing against the crowd - good luck!", gameId);
    api.listenGame(gameId, onGameEvent, onGameEnd);
  }
}

function onEventStreamEnd() {
  console.log("event stream closed");
}

function isGoodChallenge(data) {
  return (
    data.challenge.rated === false &&
    SUPPORTED_VARIANTS.includes(data.challenge.variant.key) &&
    data.challenge.timeControl.type === "clock" &&
    data.challenge.timeControl.increment >= VOTE_SECONDS &&
    data.challenge.timeControl.limit >= 60
  );
}

function createNewGameObject() {
  game = mapVariantToGameObj(currentGameFull.variant.key);
}

function onGameEvent(data) {
  console.log(data.type);
  if (data.type === "gameFull") {
    currentGameFull = data;
    createNewGameObject();
    clearVoteTimer();
    // if we restarted the bot and connected to a game in progress,
    // we need to reload the game moves
    const playedMoves = currentGameFull.state.moves.split(" ");
    for (let move of playedMoves) {
      game.move(move, { sloppy: true });
    }
    if (isOurMove()) {
      chatSpectator(`Voting ends in ${VOTE_SECONDS} seconds.`);
      setVoteTimer();
    } else {
      setAbortTimer();
    }
  } else if (data.type == "gameState") {
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
    chatSpectator(`Voting ends in ${VOTE_SECONDS} seconds.`);
    setVoteTimer();
  } else if (data.type == "chatLine" && data.room === "spectator") {
    if (usernameIsBanned(data.username)) {
      console.log("ignoring chat from banned user", data.username, data.text);
      return;
    }
    if (data.text.startsWith("/ban") && usernameIsMod(data.username)) {
      banUsername(data.text.split(" ")[1]);
    } else if (data.text.startsWith("/unban") && usernameIsMod(data.username)) {
      unbanUsername(data.text.split(" ")[1]);
    } else if (data.text.startsWith("/mod") && usernameIsMod(data.username)) {
      makeMod(data.text.split(" ")[1]);
    } else {
      recordVote(data.username, data.text);
    }
  }
}

function onGameEnd() {
  playing = false;
  chatPlayer("Good game!");
  console.log("game ended");
  clearVoteTimer();
  clearAbortTimer();
  nextQueueChallenge();
}

function isOurMove(moves) {
  if (!currentGameFull) return false;
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
    if (moves.length === 0) {
      if (!waitingForVotes) {
        chatSpectator("No votes received, waiting for votes.");
      }
      waitingForVotes = true;
      votes = {};
      setVoteTimer();
      return;
    }
    // filter out illegal moves and convert to SAN so
    // different move forms are counted as the same move
    moves = moves
      .filter(move => {
        if (move === "resign") return true;
        const moveObj = game.move(move, { sloppy: true });
        if (moveObj) {
          game.undo();
        }
        return !!moveObj;
      })
      .map(move => {
        if (move === "resign") return "resign";
        const moveObj = game.move(move, { sloppy: true });
        if (moveObj && moveObj.san) {
          game.undo();
          return moveObj.san;
        } else {
          return move;
        }
      });
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
      if (!waitingForVotes) {
        chatSpectator("No votes received, waiting for votes.");
      }
      waitingForVotes = true;
      votes = {};
      setVoteTimer();
      return;
    }
    // find winning move(s)
    // ties are broken by a random choice
    let { winners, winnerVotes } = findAllWinners(sortedVotes);
    if (winners.length === 0) {
      if (!waitingForVotes) {
        chatSpectator("No votes received, waiting for votes.");
        waitingForVotes = true;
      }
      setVoteTimer();
      return;
    }
    waitingForVotes = false;
    if (winners.length === 1) {
      const winnerObj = winners[0];
      if (winnerObj === "resign") {
        chatSpectator(`Resignation won with ${winnerVotes} votes.`);
        api.resignGame(currentGameFull.id);
        votes = {};
        return;
      }
      let winnerUci;
      if (winnerObj.from === "@") {
        winnerUci = winnerObj.piece.toUpperCase() + "@" + winnerObj.to;
      } else {
        winnerUci = winnerObj.from + winnerObj.to;
      }
      if (winnerObj.promotion) winnerUci += winnerObj.promotion;
      chatSpectator(`${winnerObj.san} won with ${winnerVotes} votes.`);
      game.move(winnerObj.san);
      api.makeMove(currentGameFull.id, winnerUci);
    } else {
      // don't allow resigning in a tie
      winners = winners.filter(m => m !== "resign");
      const winnerObj = winners[Math.floor(Math.random() * winners.length)];
      chatSpectator(
        `The following moves tied with ${winnerVotes} votes: ${winners
          .map(m => m.san)
          .join(", ")}`
      );
      chatSpectator(`Randomly chosen winner: ${winnerObj.san}`);
      let winnerUci;
      if (winnerObj.from === "@") {
        winnerUci = winnerObj.piece.toUpperCase() + "@" + winnerObj.to;
      } else {
        winnerUci = winnerObj.from + winnerObj.to;
      }
      if (winnerObj.promotion) winnerUci += winnerObj.promotion;
      game.move(winnerObj.san);
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
}

function setAbortTimer() {
  if (abortTimer) clearTimeout(abortTimer);
  abortTimer = setTimeout(() => {
    api.abortGame(currentGameFull.id);
  }, 60000);
}

function clearAbortTimer() {
  if (abortTimer) clearTimeout(abortTimer);
}

function recordVote(username, command) {
  if (!command.startsWith("/")) {
    return;
  }
  if (isOurMove()) {
    const move = command
      .slice(1)
      .trim()
      .split(" ")[0];
    votes[username] = move;
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

function chatPlayer(text, id) {
  const gameId = id === undefined ? currentGameFull.id : id;
  api.sendChat(gameId, "player", text);
}

function chatSpectator(text, id) {
  const gameId = id === undefined ? currentGameFull.id : id;
  api.sendChat(gameId, "spectator", text);
}
