class VoteState {
  constructor() {
    this.votes = {};
    this.voteTimer = null;
    this.voteStartedAt = null;
    this.voteInterval = null;
    this.results = null;
  }

  init(data) {
    this.votes = {};
    this.voteInterval = data.clock.increment - 10000;
    this.clearVoteTimer();
  }

  recordVote({ vote, ip }) {
    this.votes[ip] = vote;
    this.results = this.calculateVoteResults();
  }

  setVoteTimer() {
    this.clearVoteTimer();
    this.voteStartedAt = Date.now();
    this.votes = {};
    this.results = null;

    return new Promise(resolve => {
      this.voteTimer = setTimeout(
        () => this.onVotingEnded().then((winnerData) => resolve(winnerData)),
        this.voteInterval
      );
    });
  }

  clearVoteTimer() {
    if (this.voteTimer) clearTimeout(this.voteTimer);
    this.voteTimer = null;
    this.voteStartedAt = null;
  }

  getVoteTimeLeft() {
    if (!this.voteStartedAt) return 0;

    return Math.abs(Date.now() - this.voteStartedAt - this.voteInterval);
  }

  onVotingEnded() {
    return new Promise(resolve => {
      this.results = this.calculateVoteResults();

      if (this.results.votes.length === 0) {
        return resolve(null);
      }

      const numDrawVotes = this.numDrawVotes();
      const numVotes = this.numVotes();
      const drawPercent = numDrawVotes / numVotes;
      const draw = drawPercent > 0.5;

      const { winners, winnerVotes } = this.findAllWinners(this.results);
      const finalWinner = this.findFinalWinner(winners);

      this.results.votes.find(vote => vote.move.san === finalWinner.san).winner = true;

      resolve({
        winner: finalWinner,
        draw,
      });
    });
  }

  calculateVoteResults() {
    const moves = Object.values(this.votes);

    if (!moves.length) return { votes: [] };

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

    const numDrawVotes = this.numDrawVotes();
    const numVotes = this.numVotes();
    const drawPercent = numDrawVotes / numVotes;

    return {
      votes: sortedResults,
      drawResults: {
        number: numDrawVotes,
        percent: drawPercent,
      },
    };
  }

  voteResults() {
    return this.results;
  }

  findFinalWinner(winners) {
    if (winners.length === 1) {
      return winners[0];
    }

    // don't allow resigning in a tie
    const finalWinners = winners.filter(move => move.san !== 'resign');
    return finalWinners[0];
  }

  findAllWinners({ votes }) {
    if (votes.length === 0) return [];
    const maxVotes = votes[0].numVotes;
    const winners = votes.filter(vote => vote.numVotes === maxVotes).map(vote => vote.move);
    return { winners, winnerVotes: maxVotes };
  }

  numDrawVotes() {
    return Object.values(this.votes).filter(vote => vote.draw).length;
  }

  numVotes() {
    return Object.values(this.votes).length;
  }

  gameOver() {
    this.clearVoteTimer();
    this.voteStartedAt = null;
  }

}

module.exports = VoteState;
