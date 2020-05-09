const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('VoteChess homepage.');
});

const port = 8000;
app.listen(port, () => console.log(`Web server started on port ${port}`));
