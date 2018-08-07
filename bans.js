const fs = require("fs");
const path = require("path");

const BANNED_FILENAME = path.join(__dirname, "banned.txt");

const MODS_FILENAME = path.join(__dirname, "mods.txt");

let modUsernames = [];

let bannedUsernames = [];

exports.banUsername = username => {
  fs.appendFile(BANNED_FILENAME, username.toLowerCase() + "\n", err => {
    if (err) throw err;
    console.log("wrote username to banned.txt:", username);
    bannedUsernames.push(username.toLowerCase());
    chatSpectator(`Banned ${username}.`);
  });
};

exports.unbanUsername = username => {
  bannedUsernames = bannedUsernames.filter(
    name => name !== username.toLowerCase()
  );
  fs.writeFile(BANNED_FILENAME, bannedUsernames.join("\n") + "\n", err => {
    if (err) throw err;
    console.log("unbanned:", username);
    chatSpectator(`Unbanned ${username}.`);
  });
};

exports.makeMod = username => {
  fs.appendFile(MODS_FILENAME, username.toLowerCase() + "\n", err => {
    if (err) throw err;
    console.log("made mod:", username);
    modUsernames.push(username.toLowerCase());
    chatSpectator(`Promoted ${username} to mod.`);
  });
};

exports.usernameIsBanned = username => {
  return bannedUsernames.includes(username.toLowerCase());
};

exports.usernameIsMod = username => {
  return modUsernames.includes(username.toLowerCase());
};

function cacheModUsernames() {
  fs.readFile(MODS_FILENAME, (err, data) => {
    if (err) throw err;
    modUsernames = data
      .toString()
      .split("\n")
      .filter(line => !!line.trim());
    console.log("cached mods.txt:", modUsernames);
  });
}

function cacheBannedUsernames() {
  fs.readFile(BANNED_FILENAME, (err, data) => {
    if (err) throw err;
    bannedUsernames = data
      .toString()
      .split("\n")
      .filter(line => !!line.trim());
    console.log("cached banned.txt:", bannedUsernames);
  });
}

cacheModUsernames();
cacheBannedUsernames();

setInterval(() => {
  cacheModUsernames();
  cacheBannedUsernames();
}, 60000);
