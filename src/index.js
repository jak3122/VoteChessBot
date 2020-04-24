require('dotenv').config();
require('./sockets/server');

const ctrl = require('./Controller');
ctrl.connect();
