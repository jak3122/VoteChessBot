const api = require("./api");
const ctrl = require('./Controller');
require('./sockets/server');

function connect() {
  api.connect(
    ctrl.onStreamEvent,
    connect,
  );
}

connect();
