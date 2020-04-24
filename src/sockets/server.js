const WebSocket = require('ws');
const ctrl = require('../Controller');

const port = 6379;
const wss = new WebSocket.Server({ port });

wss.broadcast = (data, condition) => {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }

  if (!condition) {
    condition = () => true;
  }

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      if (condition(client, data)) client.send(data);
    }
  });
};

wss.on('connection', (ws, req) => {
  console.log('client connected');

  ws.on('message', message => {
    const data = JSON.parse(message);

    console.log(data);

    if (data.type === 'vote-cast') {
      if (!ctrl.isVotingOpen()) return;
      ctrl.recordVote(data);
      // broadcast vote table to everyone who has already voted
      wss.broadcast(ctrl.getVoteResults(), (client, voteTable) => {
        return true;
      });
    }
  });

  ws.on('close', () => {
    console.log('client disconnected');
  });
});

wss.on('error', err => {
  console.log('websocket error:', err);
});

exports.wss = wss;
