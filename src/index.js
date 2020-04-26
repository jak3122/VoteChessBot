require('dotenv').config();
require('./auth');

const ctrl = require('./Controller');
ctrl.connect();
