//---------------
//Randomness — injectable + seedable (Design Pattern #4)
//---------------
//
// The engine funnels ALL randomness through `getRandomNumber` / `random`.
// By default they use Math.random (non-deterministic). For deterministic
// replay / tests / save-scum-proof match results, inject a seeded PRNG via
// `seedRandom(seed)` or a custom source via `setRandomSource(fn)`.
//
// The engine is internally synchronous (async API, no awaits), so a seeded
// source yields a fully reproducible match given the same seed + inputs.

// mulberry32 — small, fast, good-quality 32-bit PRNG. Returns float in [0, 1).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _randomSource = Math.random;

/** Float in [0, 1). Respects the injected random source. */
export function random() {
  return _randomSource();
}

/** Integer in [min, max] inclusive. The engine's single random choke point. */
export function getRandomNumber(min, max) {
  return Math.floor(_randomSource() * (max - min + 1)) + min
}

/** Inject a custom random source. Must return a float in [0, 1). */
export function setRandomSource(fn) {
  if (typeof fn !== 'function') throw new TypeError('setRandomSource expects a function')
  _randomSource = fn
  return _randomSource
}

/** Seed the RNG with a deterministic PRNG (mulberry32). Returns the source fn. */
export function seedRandom(seed) {
  const prng = mulberry32(seed >>> 0);
  _randomSource = prng;
  return prng;
}

/** Return the current random source (for snapshot/restore by EngineSession). */
export function getRandomSource() {
  return _randomSource;
}

/** Restore the default non-deterministic Math.random source. */
export function resetRandomSource() {
  _randomSource = Math.random;
}

export function round(value, decimals) {
  return Number(`${Math.round(`${value}e${decimals}`)}e-${decimals}`)
}

export function isBetween(num, low, high) {
  return num > low && num < high
}

export function upToMax(num, max) {
  if (num > max) return max
  return num
}

export function upToMin(num, min) {
  if (num < min) return min
  return num
}

export function getBallTrajectory(thisPOS, newPOS, power, type, pitchHeight) {
  const dx = newPOS[0] - thisPOS[0]
  const dy = newPOS[1] - thisPOS[1]
  const maxPower = pitchHeight * 0.40
  const powerRatio = Math.min(1, power / maxPower)
  const minSteps = 50
  const maxSteps = 100
  const steps = Math.round(minSteps + (maxSteps - minSteps) * powerRatio)
  let maxLoftPercent = 0.03
  if (type === 'pass') maxLoftPercent = 0.01
  if (type === 'through') maxLoftPercent = 0.02
  if (type === 'shot') maxLoftPercent = 0.04
  if (type === 'cross') maxLoftPercent = 0.08
  if (type === 'kick') maxLoftPercent = 0.12
  const maxLoftHeight = pitchHeight * maxLoftPercent
  const maxHeight = maxLoftHeight * powerRatio
  const trajectory = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = thisPOS[0] + dx * t
    const y = thisPOS[1] + dy * t
    const z = 4 * maxHeight * t * (1 - t)
    trajectory.push([round(x, 0), round(y, 0), round(z, 0)])
  }
  return trajectory
}

export function calculatePower(strength, pitchHeight) {
  const maxPercent = 0.40
  const maxPower = pitchHeight * maxPercent
  const strengthFactor = Math.sqrt(Math.max(0, strength) / 100)
  const variance = getRandomNumber(85, 100) / 100
  const power = maxPower * strengthFactor * variance
  return Math.min(power, maxPower)
}

export function aTimesbDividedByC(a, b, c) {
  return (a * (b / sumFrom1toX(c)))
}

export function sumFrom1toX(x) {
  return (x * (x + 1)) / 2
}

export function inTopPenalty(matchDetails, item) {
  const [matchWidth, matchHeight] = matchDetails.pitchSize
  let ballInPenalyBoxX = isBetween(item[0], (matchWidth / 4) + 5, matchWidth - (matchWidth / 4) - 5)
  let ballInTopPenalyBoxY = isBetween(item[1], -1, (matchHeight / 6) + 7)
  if (ballInPenalyBoxX && ballInTopPenalyBoxY) return true
  return false
}

export function inBottomPenalty(matchDetails, item) {
  const [matchWidth, matchHeight] = matchDetails.pitchSize
  let ballInPenalyBoxX = isBetween(item[0], (matchWidth / 4) + 5, matchWidth - (matchWidth / 4) - 5)
  let ballInBottomPenalyBoxY = isBetween(item[1], matchHeight - (matchHeight / 6) - 7, matchHeight + 1)
  if (ballInPenalyBoxX && ballInBottomPenalyBoxY) return true
  return false
}

export function getRandomTopPenaltyPosition(matchDetails) {
  const [pitchWidth, pitchHeight] = matchDetails.pitchSize
  let boundaryX = [(pitchWidth / 4) + 6, (pitchWidth - (pitchWidth / 4) - 6)]
  let boundaryY = [0, (pitchHeight / 6) + 6]
  return [getRandomNumber(boundaryX[0], boundaryX[1]), getRandomNumber(boundaryY[0], boundaryY[1])]
}

export function getRandomBottomPenaltyPosition(matchDetails) {
  const [pitchWidth, pitchHeight] = matchDetails.pitchSize
  let boundaryX = [(pitchWidth / 4) + 6, (pitchWidth - (pitchWidth / 4) - 6)]
  let boundaryY = [pitchHeight - (pitchHeight / 6) + 6, pitchHeight]
  return [getRandomNumber(boundaryX[0], boundaryX[1]), getRandomNumber(boundaryY[0], boundaryY[1])]
}

export function removeBallFromAllPlayers(matchDetails) {
  matchDetails.ball.withPlayer = false
  matchDetails.ball.withTeam = ''
  matchDetails.ball.Player = ''
  for (let player of matchDetails.kickOffTeam.players) {
    player.hasBall = false
  }
  for (let player of matchDetails.secondTeam.players) {
    player.hasBall = false
  }
}

//---------------
//Injury Functions
//---------------
export function isInjured(x) {
  if (x == 23) return true
  return getRandomNumber(0, x) == 23
}

export function matchInjury(matchDetails, team) {
  const player = team.players[getRandomNumber(0, 10)]

  if (isInjured(40000)) {
    player.injured = true
    matchDetails.iterationLog.push(`Player Injured - ${player.name}`)
  }
}

export function isEven(n) {
  return n % 2 == 0
}

export function isOdd(n) {
  return Math.abs(n % 2) == 1
}

export function distance(pos1, pos2) {
  const dx = pos1[0] - pos2[0]
  const dy = pos1[1] - pos2[1]
  return Math.sqrt(dx * dx + dy * dy)
}
