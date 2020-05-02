const api = require('./api');
const { validateChallenge } = require('./utils/helpers');

class Challenges {
  constructor({ isPlaying }) {
    this.queue = [];
    this.nextChallengeTimer = null;
    this.isPlaying = isPlaying;
  }

  addChallenge(challenge) {
    const validChallenge = validateChallenge(challenge);
    if (!validChallenge.valid) {
      console.log(
        'Declined challenge',
        challenge.id,
        challenge.challenger.name,
        challenge.timeControl.show,
        `(Reason: ${validChallenge.reason})`,
      );
      api.declineChallenge(challenge.id);
      return;
    }

    this.queue.push(challenge);
    this.nextQueueChallenge();
  }

   nextQueueChallenge() {
    if (this.isPlaying()) return;

    if (this.nextChallengeTimer) {
      clearTimeout(this.nextChallengeTimer);
      this.nextChallengeTimer = null;
    }

    this.nextChallengeTimer = setTimeout(async () => {
      if (this.isPlaying()) return;

      while (this.queue.length > 0) {
        const challenge = this.queue.shift();
        const accepted = await api.acceptChallenge(challenge.id);
        if (accepted) break;
      }
    }, 1000);
  }
}

module.exports = Challenges;
