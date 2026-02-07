// functions/src/index.ts

/**
 * This is the main entry point for all Cloud Functions.
 *
 * It should only import and re-export functions from other files.
 * This makes it clear what is being deployed and avoids complex logic in the root file.
 */

// Export functions for creating statements and reports
export { exportStatement } from './exports';

// Export functions for data maintenance and one-off scripts
export * from './maintenance';

// Export functions for core financial recalculations
export * from './financials';
