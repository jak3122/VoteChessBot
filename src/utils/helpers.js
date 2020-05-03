const { MIN_LIMIT_SECONDS, MIN_INCREMENT_SECONDS } = require('./constants');

module.exports.validateChallenge = challenge => {
  if (challenge.rated === true) {
    return {
      valid: false,
      reason: 'Challenge must be unrated.',
    };
  }

  if (challenge.variant.key !== 'standard') {
    return {
      valid: false,
      reason: 'Challenge must be standard chess.',
    };
  }

  if (challenge.timeControl.type !== 'clock') {
    return {
      valid: false,
      reason: 'Challenge must use a clock.',
    };
  }

  if (challenge.timeControl.increment < MIN_INCREMENT_SECONDS) {
    return {
      valid: false,
      reason: `Challenge increment must be at least ${MIN_INCREMENT_SECONDS} seconds.`,
    };
  }

  if (challenge.timeControl.limit < 60) {
    return {
      valid: false,
      reason: `Challenge time limit must be at least ${MIN_LIMIT_SECONDS} seconds.`,
    };
  }

  return { valid: true };
};
