"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toMinor = toMinor;
exports.fromMinor = fromMinor;
exports.clampNonNegative = clampNonNegative;
exports.convertMinorToBase = convertMinorToBase;
exports.convertBaseToMinor = convertBaseToMinor;
const currency_config_1 = require("./currency-config");
/**
 * A map specifying the number of decimal places for each currency's minor unit.
 * E.g., USD is 100 cents in a dollar, so it has 2 decimal places.
 * JPY has no minor unit, so it has 0.
 */
const SUBUNIT_MAP = currency_config_1.CURRENCY_DECIMALS;
/**
 * Converts a major currency unit (e.g., dollars as a float/number) to a minor unit (e.g., cents as an integer).
 * @param amount The amount in major units.
 * @param currency The currency code.
 * @returns The amount in minor units as an integer.
 */
function toMinor(amount, currency) {
    var _a;
    if (isNaN(amount))
        return 0;
    const factor = 10 ** ((_a = SUBUNIT_MAP[currency]) !== null && _a !== void 0 ? _a : 2); // Default to 2 decimals if currency not in map
    return Math.round(amount * factor);
}
/**
 * Converts a minor currency unit (e.g., cents as an integer) to a major unit (e.g., dollars as a float/number).
 * @param amount The amount in minor units.
 * @param currency The currency code.
 * @returns The amount in major units as a number.
 */
function fromMinor(amount, currency) {
    var _a;
    if (isNaN(amount))
        return 0;
    const factor = 10 ** ((_a = SUBUNIT_MAP[currency]) !== null && _a !== void 0 ? _a : 2); // Default to 2 decimals if currency not in map
    if (factor === 0)
        return amount;
    return amount / factor;
}
/**
 * Clamps a number to be non-negative.
 * @param n The number to clamp.
 * @returns The number if it's > 0, otherwise 0.
 */
function clampNonNegative(n) {
    if (isNaN(n))
        return 0;
    return Math.max(0, n);
}
function convertMinorToBase(minorAmount, fxRate, localCurrency, baseCurrency) {
    const localMajor = fromMinor(minorAmount, localCurrency);
    const baseMajor = localMajor / fxRate;
    return toMinor(baseMajor, baseCurrency);
}
function convertBaseToMinor(baseMinorAmount, fxRate, localCurrency, baseCurrency) {
    const baseMajor = fromMinor(baseMinorAmount, baseCurrency);
    const localMajor = baseMajor * fxRate;
    return toMinor(localMajor, localCurrency);
}
//# sourceMappingURL=money.js.map