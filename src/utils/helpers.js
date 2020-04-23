function isGoodChallenge(data) {
  return (
    data.challenge.rated === false &&
    SUPPORTED_VARIANTS.includes(data.challenge.variant.key) &&
    data.challenge.timeControl.type === "clock" &&
    data.challenge.timeControl.increment >= VOTE_SECONDS &&
    data.challenge.timeControl.limit >= 60
  );
}
