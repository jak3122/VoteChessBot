require('dotenv').config();
const { REQUIRE_LOGIN } = require('./utils/constants');

if (REQUIRE_LOGIN) {
  require('./auth');
}

const ctrl = require('./Controller');
ctrl.connect();

process.on('unhandledRejection', r => console.log(r));
process.on('uncaughtException', e => console.log('uncaught exception:', e));
