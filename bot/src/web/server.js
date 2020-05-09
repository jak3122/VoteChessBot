const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>VoteChess</title>
        <style>
          body {
            align-items: center;
            display: flex;
            height: 90vh;
            flex-direction: column;
            justify-content: center;
          }
          body a {
            margin: 10px;
          }
        </style>
       </head>
      <body>
        <a href="/firefox/votechess.xpi">VoteChess Firefox extension</a>
        <a href="/chrome/votechess.xpi">VoteChess Chrome extension</a>
      </body>
    </html>
  `);
});

const port = 8000;
app.listen(port, () => console.log(`Web server started on port ${port}`));
