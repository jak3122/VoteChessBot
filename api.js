const https = require("https");
const querystring = require("querystring");

const apiToken = process.env.API_TOKEN;

const optionsBase = {
  hostname: "lichess.org",
  headers: { Authorization: "Bearer " + apiToken }
};

const optionsPost = {
  ...optionsBase,
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: "Bearer " + apiToken
  }
};

exports.connect = (onData, onEnd) => {
  const options = { ...optionsBase, path: "/api/stream/event" };
  https
    .get(options, res => {
      res.on("data", raw => {
        let data;
        try {
          data = JSON.parse(raw.toString());
        } catch (err) {
          return;
        }
        onData(data);
      });
      res.on("end", onEnd);
    })
    .on("error", e => {
      console.error("event stream error:", e);
    });
};

exports.listenGame = (gameId, onData, onEnd) => {
  const options = { ...optionsBase, path: `/api/bot/game/stream/${gameId}` };
  https.get(options, res => {
    if (res.statusCode === 200) {
      console.log("bot connected");
    } else {
      console.log("problem connecting", res.statusCode);
    }
    res.on("data", raw => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch (err) {
        return;
      }
      onData(data);
    });
    res.on("end", onEnd);
  });
};

exports.sendChat = (gameId, room, text) => {
  const options = {
    ...optionsPost,
    path: `/api/bot/game/${gameId}/chat`
  };
  const req = https.request(options, res => {});
  req.on("error", e => {
    console.error("chat error:", e.message);
  });
  req.write(
    querystring.stringify({
      room: room,
      text: text
    })
  );
  req.end();
};

exports.acceptChallenge = challengeId => {
  return new Promise((resolve, reject) => {
    const options = {
      ...optionsPost,
      path: `/api/challenge/${challengeId}/accept`
    };
    const req = https.request(options, res => {
      if (res.statusCode === 200) {
        console.log("accepted challenge:", challengeId);
        resolve(true);
      } else {
        console.log("failed to accept challenge:", challengeId);
        resolve(false);
      }
    });
    req.end();
  });
};

exports.declineChallenge = challengeId => {
  const options = {
    ...optionsPost,
    path: `/api/challenge/${challengeId}/decline`
  };
  const req = https.request(options, res => {});
  req.end();
};

exports.makeMove = (gameId, move) => {
  const options = {
    ...optionsPost,
    path: `/api/bot/game/${gameId}/move/${move}`
  };
  const req = https.request(options, res => {});
  req.end();
};

exports.abortGame = gameId => {
  const options = {
    ...optionsPost,
    path: `/api/bot/game/${gameId}/abort`
  };
  const req = https.request(options, res => {});
  req.end();
};
