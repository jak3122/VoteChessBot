class ArrowWatcher {
  constructor() {
    this.observer = null;
    this.arrowsContainer = null;
    this.listeners = [];
    this.start();

    // when the board is resized, the arrow container will be destroyed
    // and rebuilt, so we have to reattach the arrow observer
    const resizeObserver = new MutationObserver(mutationsList => {
      for (let mutation of mutationsList) {
        if (mutation.attributeName === 'class') {
          setTimeout(() => {
            this.stop();
            this.start();
          }, 100);
        }
      }
    });

    resizeObserver.observe(document.body, { attributes: true, childList: false, subtree: false });
  }

  start() {
    this.arrowsContainer = document.querySelector('cg-container svg');

    this.observer = new MutationObserver(mutationsList => {
      for (let mutation of mutationsList) {
        const nodes = Array.from(mutation.addedNodes);
        nodes.forEach(node => {
          const arrow = node.getAttribute('cgHash');
          const regex = /^[a-h][1-8][a-h][1-8]green/;
          if (regex.test(arrow)) {
            const from = arrow.slice(0, 2);
            const to = arrow.slice(2, 4);
            this.onVoteArrow({ from, to }, node);
          }
        });
      }
    });

    this.observer.observe(this.arrowsContainer, { attributes: false, childList: true, subtree: true });
  }

  stop() {
    if (this.observer) this.observer.disconnect();
  }

  onVoteArrow({ from, to }, arrowNode) {
    this.listeners.forEach(f => f({ from, to }));
    this.stop();
    this.start();
  }

  addArrowListener(listener) {
    this.listeners.push(listener);
  }
}
