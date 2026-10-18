// 今晚看什么 hand restore flag. The last hand is restored from sessionStorage
// only when the user comes BACK from a card they opened on the page (detail /
// person / player); any other entry — the home hero button included — starts
// with an empty table so the user draws for themselves. Kept tiny so the home
// hero can import it without pulling in the recommend page.

const RETURN_KEY = "kubby-recommend-return";

/** Leaving the page via a card — the next visit should restore the hand. */
export function markRecommendReturn() {
  try {
    sessionStorage.setItem(RETURN_KEY, "1");
  } catch {
    // storage disabled — the next visit just starts fresh
  }
}

/** Whether the current visit is a return trip (read-only; see clearRecommendReturn). */
export function isRecommendReturn(): boolean {
  try {
    return sessionStorage.getItem(RETURN_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearRecommendReturn() {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // ignore
  }
}
