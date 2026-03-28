type RateState = {
  window15StartMs: number;
  window15Used: number;
  dayStartMs: number;
  dayUsed: number;
};

type RateResult = {
  allowed: boolean;
  retryAfterSec: number;
  remaining15m: number;
  remainingDaily: number;
};

const WINDOW_15M_MS = 15 * 60 * 1000;
const WINDOW_DAY_MS = 24 * 60 * 60 * 1000;

const globalRate = globalThis as unknown as { stravaRateState?: RateState };

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getLimits() {
  return {
    limit15m: readIntEnv("STRAVA_READ_LIMIT_15M", 100),
    limitDaily: readIntEnv("STRAVA_READ_LIMIT_DAILY", 1000),
  };
}

function getState(nowMs: number): RateState {
  if (!globalRate.stravaRateState) {
    globalRate.stravaRateState = {
      window15StartMs: nowMs,
      window15Used: 0,
      dayStartMs: nowMs,
      dayUsed: 0,
    };
  }

  const state = globalRate.stravaRateState;
  if (nowMs - state.window15StartMs >= WINDOW_15M_MS) {
    state.window15StartMs = nowMs;
    state.window15Used = 0;
  }
  if (nowMs - state.dayStartMs >= WINDOW_DAY_MS) {
    state.dayStartMs = nowMs;
    state.dayUsed = 0;
  }

  return state;
}

export function consumeReadBudget(tokens = 1): RateResult {
  const nowMs = Date.now();
  const state = getState(nowMs);
  const { limit15m, limitDaily } = getLimits();

  const would15m = state.window15Used + tokens;
  const wouldDaily = state.dayUsed + tokens;

  if (would15m > limit15m || wouldDaily > limitDaily) {
    const wait15m = Math.max(1, Math.ceil((WINDOW_15M_MS - (nowMs - state.window15StartMs)) / 1000));
    const waitDay = Math.max(1, Math.ceil((WINDOW_DAY_MS - (nowMs - state.dayStartMs)) / 1000));
    return {
      allowed: false,
      retryAfterSec: would15m > limit15m ? wait15m : waitDay,
      remaining15m: Math.max(0, limit15m - state.window15Used),
      remainingDaily: Math.max(0, limitDaily - state.dayUsed),
    };
  }

  state.window15Used = would15m;
  state.dayUsed = wouldDaily;

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining15m: Math.max(0, limit15m - state.window15Used),
    remainingDaily: Math.max(0, limitDaily - state.dayUsed),
  };
}

export function getBudgetSnapshot() {
  const nowMs = Date.now();
  const state = getState(nowMs);
  const { limit15m, limitDaily } = getLimits();
  return {
    used15m: state.window15Used,
    usedDaily: state.dayUsed,
    limit15m,
    limitDaily,
    remaining15m: Math.max(0, limit15m - state.window15Used),
    remainingDaily: Math.max(0, limitDaily - state.dayUsed),
  };
}
