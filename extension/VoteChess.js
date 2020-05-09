const VOTE_BOT_NAME = 'VoteChess';

const states = {
  NOT_PLAYING: 0,
  WAITING: 0.1,
  VOTING: 0.2,
  VOTE_ENTERED: 0.3,
  VOTE_SUBMITTED: 0.4,
};

class VoteChess {
  constructor(movesElement) {
    if (!movesElement) return;

    this.port = browser.runtime.connect({ name: 'votechess-port' });
    this.port.onMessage.addListener(this.onSocketMessage.bind(this));

    this.createVue();

    browser.storage.local.get('showApp').then(({ showApp }) => { this.vue.showApp = showApp; });

    this.watchArrows();

    this.game = new GameState(movesElement);
    this.clock = new Clock();
  }

  createVue() {
    const container = document.createElement('div');
    container.setAttribute('id', 'votechess');
    document.querySelector('body').appendChild(container);

    const votechess = this;

    const vm = new Vue({
      el: '#votechess',
      template: `
        <div id="votechess">
          <div class="title-bar" @click="onTitleClick">
            VoteChess
          </div>
          <div class="app-wrapper" v-show="showApp">
            <div class="menu-button">
              <span data-icon="u" @click="toggleMenu"></span>
              <div v-if="showMenu" class="menu">
                <button class="button fbt draw" title="Toggle including draw offer with vote" @click="onVoteDraw">
                  <div class="hand-wrapper">
                    <span class="hand-icon" data-icon="2"></span>
                  </div>
                  <span v-if="draw" class="check-icon" data-icon="E"></span>
                </button>
                <button class="button fbt resign" title="Vote to resign" @click="onVoteResign">
                  <span data-icon="b"></span>
                </button>
              </div>
            </div>
            <div class="top">
              <div class="clock" :class="{ faded: fadedClock }">{{ formattedClock }}</div>
              <div class="status">{{ statusText }}</div>
              <div class="buttons">
                <button
                  v-show="showButton"
                  class="submit button button-metal"
                  @click="onSubmitVote"
                >
                  <span class="label">{{ buttonText }}</span>
                </button>
                <button
                  v-for="promotion in promotions"
                  class="submit button button-metal"
                  @click="submitPromotion(promotion)"
                >
                  <span class="label">{{ promotion.san }}</span>
                </button>
              </div>
            </div>
            <div class="vote-results-container">
              <div v-if="drawResults && drawResults.number" class="draw-results">
                Draw votes: {{ drawResults.number }} ({{ (drawResults.percent * 100).toFixed(1) }}%)
              </div>
              <div
                v-for="vote in voteResults"
                class="vote-result"
                :class="{ winner: vote.winner }"
              >
                <span
                  class="bg"
                  :style="{ width: (vote.percent * 100) + '%' }">
                </span>
                <span class="san">{{ vote.move.san }}</span>
                <span class="count">{{ vote.numVotes }}</span>
              </div>
            </div>
          </div>
        </div>
      `,
      data: {
        clock: 0,
        draw: false,
        drawResults: null,
        promotions: null,
        showApp: true,
        showMenu: false,
        state: states.WAITING,
        vote: null,
        voteResults: null,
      },

      computed: {
        buttonText() {
          if (!this.vote) return null;
          if (this.state !== states.VOTE_ENTERED) return null;

          const drawText = this.draw ? ' & offer draw' : '';

          return `Cast vote for ${this.vote.san}${drawText}`;
        },

        fadedClock() {
          return !this.clock || this.clock <= 0 || this.state === states.NOT_PLAYING;
        },

        formattedClock() {
          return (formatTime(this.clock || 0)) || '0:00';
        },

        showButton() {
          return (this.state === states.VOTE_ENTERED) && this.vote;
        },

        statusText() {
          switch (this.state) {
            case states.NOT_PLAYING:
              return 'Waiting for game to start.';
            case states.WAITING:
              return 'Waiting for opponent to move.';
            case states.VOTING:
              return 'Draw an arrow to cast a vote.';
            case states.VOTE_SUBMITTED:
              return `Vote submitted for ${this.vote.san}.`;
            default:
              return '';
          }
        },
      },

      methods: {
        onSubmitVote() {
          this.state = states.VOTE_SUBMITTED;
          votechess.port.postMessage({
            type: 'vote-cast',
            draw: this.draw,
            move: this.vote,
          });
          this.draw = false;
        },

        onTitleClick() {
          this.showApp = !this.showApp;
          browser.storage.local.set({ showApp: this.showApp });
        },

        onVoteDraw() {
          this.showMenu = !this.showMenu;

          this.draw = !this.draw;
        },

        onVoteResign() {
          this.showMenu = false;
          if ([states.WAITING, states.VOTE_SUBMITTED].includes(this.state)) return;

          this.vote = { san: 'resign' };
          this.state = states.VOTE_ENTERED;
        },

        submitPromotion(promotion) {
          this.state = states.VOTE_SUBMITTED;
          this.draw = false;
          this.vote = promotion;
          this.promotions = null;
          votechess.port.postMessage({
            type: 'vote-cast',
            draw: this.draw,
            move: promotion,
          });
        },

        toggleMenu() {
          this.showMenu = !this.showMenu;
        },
      },

    });

    this.vue = vm;
  }

  watchArrows() {
    this.arrowWatcher = new ArrowWatcher();
    this.arrowWatcher.addArrowListener(vote => this.handleVote(vote));
  }

  reset() {
    this.vue.state = states.WAITING;
  }

  handleVote({ from, to }) {
    if ([states.WAITING, states.VOTE_SUBMITTED].includes(this.vue.state)) return;

    const moveInfo = this.game.moveInfo({ from, to });
    if (moveInfo) {
      this.vue.vote = moveInfo;
      this.vue.promotions = null;
      this.vue.state = states.VOTE_ENTERED;
      return;
    }

    const promotions = this.game.promotionInfo({ from, to });
    if (promotions) {
      this.vue.vote = null;
      this.vue.promotions = promotions;
      this.vue.state = states.VOTE_ENTERED;
    }
  }

  onSocketMessage(message) {
    console.log(message);
    switch (message.type) {
      case 'on-connect':
        this.vue.state = message.data.state;
        if (message.data.vote) {
          this.vue.vote = message.data.vote;
        }
        if (message.data.voteResults) {
          this.vue.voteResults = message.data.voteResults.votes || null;
          this.vue.drawResults = message.data.voteResults.drawResults || null;
        }
        if (message.data.clock)
          this.startClock(message.data.clock);
        this.vue.playing = message.data.playing;
        break;
      case 'vote-timer':
        this.vue.voteResults = null;
        this.vue.vote = null;
        this.vue.draw = false;
        this.vue.drawResults = null;
        this.vue.promotions = null;
        this.vue.state = states.VOTING;
        this.startClock(message.data);
        break;
      case 'vote-results':
        this.vue.voteResults = message.data.votes;
        this.vue.drawResults = message.data.drawResults;
        break;
      case 'game-ended':
        this.vue.state = states.NOT_PLAYING;
        this.clock.stop();
      default:
        break;
    }
  }

  startClock(initialTime) {
    if (this.clock) this.clock.destroy();
    this.clock = new Clock(initialTime);
    this.clock.onTick(time => {
      this.vue.clock = time;
    });
    this.clock.start();
  }
}

function getPlayerNames() {
  if (!document.querySelector('.game__meta__players')) return { white: '', black: '' };

  const whiteHref = document.querySelector('.game__meta__players .white a').getAttribute('href');
  const whiteName = whiteHref && whiteHref.split('/')[2];

  const blackHref = document.querySelector('.game__meta__players .black a').getAttribute('href');
  const blackName = blackHref && blackHref.split('/')[2];

  return { white: whiteName, black: blackName };
}

function setupApp() {
  console.log('setupApp');
  const movesElement = document.querySelector('.round .moves');
  if (!movesElement) return;

  const username = document.querySelector('body').getAttribute('data-user');
  console.log('username:', username);

  const players = getPlayerNames();
  console.log(players);
  // don't load the app if the bot is not a player in this game
  if (
    players.white.toLowerCase() !== VOTE_BOT_NAME.toLowerCase() &&
    players.black.toLowerCase() !== VOTE_BOT_NAME.toLowerCase()
  ) return;
  // don't load the app if the user is a player in this game
  if (
    players.white.toLowerCase() === username ||
    players.black.toLowerCase() === username
  ) return;

  window.votechess = new VoteChess(movesElement);

  const moveFn = exportFunction(onMove, window, { defineAs: 'votechessOnMove' });
  window.wrappedJSObject.lichess.pubsub.on('socket.in.move', moveFn);
}

function onMove(data) {
  window.votechess && window.votechess.game && window.votechess.game.makeMove(data);
}

const loadFn = exportFunction(setupApp, window, { defineAs: 'loadVotechess' });
console.log('loadFn:', loadFn);

window.wrappedJSObject.lichess.pubsub.on('socket.open', loadFn);
