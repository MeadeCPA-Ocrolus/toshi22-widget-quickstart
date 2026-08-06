"use strict";
/**
 * Tax year default logic — single source of truth
 *
 * The plan doc flagged this rule as easy to accidentally duplicate
 * (once in the API, once in the frontend). Keeping it here, server-side
 * only, means the frontend never computes its own guess — it just sends
 * whatever the staff member picked, or omits tax_year entirely and lets
 * the API fill in this default.
 *
 * Rule: Jan–Mar defaults to the prior calendar year (still filing season
 * for last year's return); Apr–Dec defaults to the current calendar year.
 * Staff can always override in the UI regardless of this default.
 *
 * @module shared/tax-year
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultTaxYear = getDefaultTaxYear;
function getDefaultTaxYear(now = new Date()) {
    const month = now.getMonth() + 1; // JS months are 0-indexed
    const year = now.getFullYear();
    return month <= 3 ? year - 1 : year;
}
//# sourceMappingURL=tax-year.js.map