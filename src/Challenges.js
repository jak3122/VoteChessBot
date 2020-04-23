class Challenges {
  constructor() {
    this.queue = [];
  }

  addChallenge(challenge) {
    this.queue.push(challenge);
  }

  async nextQueueChallenge() {
    while (this.queue.length > 0) {
      const challenge = this.queue.shift();
      const accepted = await api.acceptChallenge(challenge.challenge.id);
      if (accepted) break;
    }
  }
}
