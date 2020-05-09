const express = require('express');
const simpleOauth = require('simple-oauth2');
const axios = require('axios');

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = 'https://votechess.link/callback';

const tokenHost = 'https://oauth.lichess.org';
const authorizePath = '/oauth/authorize';
const tokenPath = '/oauth';

const oauth2 = simpleOauth.create({
  client: {
    id: clientId,
    secret: clientSecret,
  },
  auth: {
    tokenHost,
    tokenPath,
    authorizePath,
  },
});

const state = Math.random().toString(36).substring(2);
const authorizationUri = `${tokenHost}${authorizePath}?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`;

const app = express();

app.get('/auth', (req, res) => {
  console.log(authorizationUri);
  res.redirect(authorizationUri);
});

app.get('/callback', async (req, res) => {
  try {
    const result = await oauth2.authorizationCode.getToken({
      code: req.query.code,
      redirect_uri: redirectUri,
    });
    console.log(result);
    const token = oauth2.accessToken.create(result);
    const userInfo = await getUserInfo(token.token);
    res.send(`<h1>Success!</h1> You can now vote for moves with the lichess user ${JSON.stringify(userInfo.data)}`);
  } catch(error) {
    console.error('Access token error', error.message);
    res.status(500).json('Authentication failed');
  }
});

app.listen(8000, () => console.log('Express server started on port 8000'));

function getUserInfo(token) {
  return axios.get('/api/account', {
    baseURL: 'https://lichess.org/',
    headers: { 'Authorization': 'Bearer ' + token.access_token },
  });
}
