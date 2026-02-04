"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.currencyDecimals = currencyDecimals;
exports.minorToMajor = minorToMajor;
exports.excelNumFmtForCurrency = excelNumFmtForCurrency;
// IMPORTANT: match your real app config here.
// UZS should be 0 in practice for your business.
const DECIMALS = {
    USD: 2,
    AED: 2,
    CNY: 2,
    UZS: 0,
};
function currencyDecimals(currency) {
    var _a;
    return (_a = DECIMALS[currency]) !== null && _a !== void 0 ? _a : 2;
}
function minorToMajor(minor, currency) {
    const d = currencyDecimals(currency);
    const div = Math.pow(10, d);
    return Number(minor || 0) / div;
}
// Excel number format: "#,##0" or "#,##0.00"
function excelNumFmtForCurrency(currency) {
    if (currency === 'QTY')
        return '#,##0';
    const d = currencyDecimals(currency);
    if (d <= 0)
        return '#,##0';
    return '#,##0.' + '0'.repeat(d);
}
//# sourceMappingURL=money.js.map