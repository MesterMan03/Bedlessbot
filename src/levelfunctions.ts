interface LevelInfo {
    userid: string;
    xp: number;
}

const a = 5 / 6;
const c = 91;
const b = 27;

function LevelToXP(level: number) {
    return Math.round(a * level * (2 * Math.pow(level, 2) + b * level + c));
}

function XPToLevel(xp: number) {
    // Define a tolerance level for comparing f(x) and fx
    const tolerance = 0.0001;

    // Perform a binary search to find the approximate value of x
    let lowerBound = 0;
    let upperBound = xp / a; // Rough estimation of upper bound
    let mid = (lowerBound + upperBound) / 2;
    while (upperBound - lowerBound > tolerance) {
        if (LevelToXP(mid) > xp) {
            upperBound = mid;
        } else if (LevelToXP(mid) < xp) {
            lowerBound = mid;
        } else {
            return Math.floor(mid);
        }
        mid = (lowerBound + upperBound) / 2;
    }

    // Return the approximate value of x
    return Math.floor(mid);
}

/**
 * A function for calculating the required XP to level up.
 * @param {number} level The current level
 * @returns The total xp required to get the next level
 */
function XPToLevelUp(level: number) {
    return LevelToXP(level + 1) - LevelToXP(level);
}

export { LevelToXP, XPToLevel, XPToLevelUp, type LevelInfo };
