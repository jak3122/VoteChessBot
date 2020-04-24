const { MIN_INCREMENT_SECONDS } = require('./constants');

module.exports.isGoodChallenge = data => (
  data.challenge.rated === false &&
  // SUPPORTED_VARIANTS.includes(data.challenge.variant.key) &&
  data.challenge.timeControl.type === "clock" &&
  data.challenge.timeControl.increment >= MIN_INCREMENT_SECONDS &&
  data.challenge.timeControl.limit >= 60
);
