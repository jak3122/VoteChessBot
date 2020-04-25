const { VOTE_SECONDS } = require('./utils/constants');

class VoteState {
  constructor() {
    this.votes = {};
    this.voteTimer = null;
    this.voteStartedAt = null;
  }

  recordVote({ vote, username }) {
    this.votes[username] = vote;
  }

  setVoteTimer() {
    this.clearVoteTimer();
    this.voteStartedAt = Date.now();

    return new Promise(resolve => {
      this.voteTimer = setTimeout(
        () => this.onVotingEnded().then(winner => resolve(winner)),
        VOTE_SECONDS * 1000
      );
    });
  }

  clearVoteTimer() {
    if (this.voteTimer) clearTimeout(this.voteTimer);
    this.voteTimer = null;
    this.voteStartedAt = null;
  }

  getVoteTimeLeft() {
    return Math.abs(Date.now() - this.voteStartedAt - (VOTE_SECONDS * 1000));
  }

  onVotingEnded() {
    return new Promise(resolve => {
      const results = this.voteResults();

      if (results.length === 0) {
        return resolve(null);
      }

      const { winners, winnerVotes } = this.findAllWinners(results);
      const finalWinner = this.findFinalWinner(winners);

      this.votes = {};

      resolve(finalWinner);
    });
  }

  voteResults() {
    const moves = Object.values(this.votes);

    // tally the votes
    const counts = {};
    const moveObjs = {};
    moves.forEach(move => {
      counts[move.san] = counts[move.san] ? counts[move.san] + 1 : 1;
      moveObjs[move.san] = move;
    });

    // sort with highest votes first into [ { move, numVotes }, ... ] format
    let sortedResults = [];
    for (let san in counts) {
      sortedResults.push({
        move: moveObjs[san],
        numVotes: counts[san],
      });
    }
    sortedResults.sort((a, b) => b.numVotes - a.numVotes);

    const highestCount = sortedResults[0].numVotes;
    sortedResults = sortedResults.map(vote => ({
      ...vote,
      percent: vote.numVotes / highestCount,
    }));

    return sortedResults;
  }

  findFinalWinner(winners) {
    if (winners.length === 1) {
      return winners[0];
    }

    // don't allow resigning in a tie
    const finalWinners = winners.filter(move => move !== 'resign');
    return finalWinners[0];
  }

  findAllWinners(sortedVotes) {
    if (sortedVotes.length === 0) return [];
    const maxVotes = sortedVotes[0].numVotes;
    const winners = sortedVotes.filter(vote => vote.numVotes === maxVotes).map(vote => vote.move);
    return { winners, winnerVotes: maxVotes };
  }

  gameOver() {
    this.clearVoteTimer();
  }

}

module.exports = VoteState;
