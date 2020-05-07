const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('VoteChess homepage.');
});

app.listen(8181, () => console.log('Web server started on port 8181'));
