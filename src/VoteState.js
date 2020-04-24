const { VOTE_SECONDS } = require('./utils/constants');

class VoteState {
  constructor() {
    this.votes = {};
    this.voteTimer = null;
  }

  recordVote({ vote, username }) {
    this.votes[username] = vote;
  }

  setVoteTimer() {
    this.clearVoteTimer();
    return new Promise(resolve => {
      this.voteTimer = setTimeout(
        () => this.onVotingEnded().then(winner => resolve(winner)),
        VOTE_SECONDS * 1000
      );
    })
  }

  clearVoteTimer() {
    if (this.voteTimer) clearTimeout(voteTimer);
    this.voteTimer = null;
  }

  onVotingEnded() {
    return new Promise(resolve => {
      const results = this.voteResults();

      if (results.length === 0) {
        this.setVoteTimer();
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
    moves.forEach(move => {
      counts[move] = counts[move] ? counts[move] + 1 : 1;
    });

    // sort with highest votes first into [ { move, numVotes }, ... ] format
    const sortedResults = [];
    for (let move in counts) {
      sortedResults.push({ move, numVotes: counts[move] });
    }
    sortedResults.sort((a, b) => b.numVotes - a.numVotes);

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
