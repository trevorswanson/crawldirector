// Fractional indexing for intra-floor event order (ADR 0004 — "Event time
// model"). A `rank` is a lexicographically-sortable string; inserting an event
// between two neighbours picks a string strictly between their ranks, so a drag
// is O(1) and never renumbers its siblings. The timeline sorts events by
// `(orderKey, rank)` — `orderKey` is the coarse macro-clock (the floor) and
// `rank` is the within-floor tiebreaker the DM controls directly.
//
// This is a self-contained port of the well-known `fractional-indexing`
// algorithm (David Greenspan, MIT). Keys carry an integer-length prefix so they
// stay bounded across unbounded appends and never collide. We expose the small
// surface this app needs: a "between" generator and a sequential spread.

const BASE_62_DIGITS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const SMALLEST_INTEGER = "A00000000000000000000000000";

// The rank a fresh, single-event floor starts from. Exposed so callers (and the
// backfill) can seed without reaching into the algorithm.
export const FIRST_RANK = "a0";

function getIntegerLength(head: string): number {
  if (head >= "a" && head <= "z") {
    return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
  }
  if (head >= "A" && head <= "Z") {
    return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
  }
  throw new Error(`invalid rank head: ${head}`);
}

function getIntegerPart(key: string): string {
  const length = getIntegerLength(key[0]);
  if (length > key.length) throw new Error(`invalid rank: ${key}`);
  return key.slice(0, length);
}

function validateRank(key: string) {
  if (key === SMALLEST_INTEGER) throw new Error(`invalid rank: ${key}`);
  const integer = getIntegerPart(key);
  const fraction = key.slice(integer.length);
  if (fraction.slice(-1) === BASE_62_DIGITS[0]) {
    throw new Error(`invalid rank: ${key}`);
  }
}

// A string strictly between fractional parts `a` and `b` (b === null means "no
// upper bound"). Callers (`generateRankBetween`) guarantee the precondition:
// `a < b` and neither fractional part ends in a zero digit.
function midpoint(a: string, b: string | null): string {
  const zero = BASE_62_DIGITS[0];
  if (b !== null) {
    // Strip the longest common prefix, padding `a` with zeros as we go.
    let n = 0;
    while ((a[n] || zero) === b[n]) n++;
    if (n > 0) {
      return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
    }
  }
  const digitA = a ? BASE_62_DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? BASE_62_DIGITS.indexOf(b[0]) : BASE_62_DIGITS.length;
  if (digitB - digitA > 1) {
    const midDigit = Math.round(0.5 * (digitA + digitB));
    return BASE_62_DIGITS[midDigit];
  }
  if (b !== null && b.length > 1) {
    return b.slice(0, 1);
  }
  // `b` is null or a single digit; recurse on the remainder of `a`.
  return BASE_62_DIGITS[digitA] + midpoint(a.slice(1), null);
}

function incrementInteger(x: string): string | null {
  const [head, ...digits] = x.split("");
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i--) {
    const d = BASE_62_DIGITS.indexOf(digits[i]) + 1;
    if (d === BASE_62_DIGITS.length) {
      digits[i] = BASE_62_DIGITS[0];
    } else {
      digits[i] = BASE_62_DIGITS[d];
      carry = false;
    }
  }
  if (carry) {
    if (head === "Z") return `a${BASE_62_DIGITS[0]}`;
    if (head === "z") return null;
    const nextHead = String.fromCharCode(head.charCodeAt(0) + 1);
    if (nextHead > "a") digits.push(BASE_62_DIGITS[0]);
    else digits.pop();
    return nextHead + digits.join("");
  }
  return head + digits.join("");
}

function decrementInteger(x: string): string | null {
  const [head, ...digits] = x.split("");
  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i--) {
    const d = BASE_62_DIGITS.indexOf(digits[i]) - 1;
    if (d === -1) {
      digits[i] = BASE_62_DIGITS.slice(-1);
    } else {
      digits[i] = BASE_62_DIGITS[d];
      borrow = false;
    }
  }
  if (borrow) {
    if (head === "a") return `Z${BASE_62_DIGITS.slice(-1)}`;
    if (head === "A") return null;
    const prevHead = String.fromCharCode(head.charCodeAt(0) - 1);
    if (prevHead < "Z") digits.push(BASE_62_DIGITS.slice(-1));
    else digits.pop();
    return prevHead + digits.join("");
  }
  return head + digits.join("");
}

/**
 * A rank strictly between `a` and `b`. Pass `null` for an open end: `(null, x)`
 * ranks before everything, `(x, null)` ranks after everything, `(null, null)`
 * seeds the first rank. Throws if `a >= b`.
 */
export function generateRankBetween(
  a: string | null,
  b: string | null,
): string {
  if (a !== null) validateRank(a);
  if (b !== null) validateRank(b);
  if (a !== null && b !== null && a >= b) throw new Error(`${a} >= ${b}`);

  if (a === null) {
    if (b === null) return FIRST_RANK;
    const ib = getIntegerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) return ib + midpoint("", fb);
    if (ib < b) return ib;
    const decremented = decrementInteger(ib);
    if (decremented === null) throw new Error("rank underflow");
    return decremented;
  }

  if (b === null) {
    const ia = getIntegerPart(a);
    const fa = a.slice(ia.length);
    const incremented = incrementInteger(ia);
    return incremented === null ? ia + midpoint(fa, null) : incremented;
  }

  const ia = getIntegerPart(a);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb);
  const incremented = incrementInteger(ia);
  if (incremented === null) throw new Error("rank overflow");
  if (incremented < b) return incremented;
  return ia + midpoint(fa, null);
}

/**
 * `count` ranks in ascending order, each strictly greater than `after` (or from
 * the start when `after` is null). Used to spread a floor's existing events over
 * fresh ranks during the backfill, leaving room for future inserts.
 */
export function generateRanksAfter(after: string | null, count: number): string[] {
  const ranks: string[] = [];
  let previous = after;
  for (let i = 0; i < count; i++) {
    previous = generateRankBetween(previous, null);
    ranks.push(previous);
  }
  return ranks;
}
