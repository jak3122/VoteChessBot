require('dotenv').config();
const { REQUIRE_LOGIN } = require('./utils/constants');

if (REQUIRE_LOGIN) {
  require('./auth');
}

const ctrl = require('./Controller');
ctrl.connect();
