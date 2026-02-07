"use strict";
// functions/src/index.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportStatement = void 0;
/**
 * This is the main entry point for all Cloud Functions.
 *
 * It should only import and re-export functions from other files.
 * This makes it clear what is being deployed and avoids complex logic in the root file.
 */
// Export functions for creating statements and reports
var exports_1 = require("./exports");
Object.defineProperty(exports, "exportStatement", { enumerable: true, get: function () { return exports_1.exportStatement; } });
// Export functions for data maintenance and one-off scripts
__exportStar(require("./maintenance"), exports);
// Export functions for core financial recalculations
__exportStar(require("./financials"), exports);
//# sourceMappingURL=index.js.map