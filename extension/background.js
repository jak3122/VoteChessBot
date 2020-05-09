const url = 'wss://votechess.link/websocket';
browser.runtime.onConnect.addListener(connected);

let port;
let ws;
let reconnectInterval;

function connected(p) {
  port = p;
  console.log('connected to port');
  connectSocket();
}

function connectSocket() {
  ws = new WebSocket(url);

  port.onMessage.addListener(message => {
    console.log('socket send:', message);
    ws.send(JSON.stringify(message));
  });

  port.onDisconnect.addListener(() => {
    console.log('port disconnected');
    ws.close();
    ws = null;
  });

  ws.addEventListener('open', () => {
    console.log('ws connected');
    if (reconnectInterval) clearInterval(reconnectInterval);
    reconnectInterval = null;
  });

  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    console.log(message);
    port.postMessage(message);
  });

  ws.addEventListener('close', event => {
    console.log('ws closed', event.code, event.reason, event.wasClean);
    if (!event.wasClean) {
      reconnectInterval = setInterval(() => {
        console.log('attempting to reconnect to socket');
        connectSocket();
      }, 5000);
    }
  });
}
