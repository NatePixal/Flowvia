import admin from "firebase-admin";
import { forensicFinancialsV2, deepRepairFinancialsV2 } from "./forensic-repair-v2.mjs";

// This script assumes that you have Google Application Default Credentials set up.
// See: https://cloud.google.com/docs/authentication/provide-credentials-adc#local-dev
if (!admin.apps.length) {
  admin.initializeApp();
}

const args = process.argv.slice(2);
const cmd = args[0];

function getArg(key) {
  const index = args.indexOf(key);
  if (index !== -1 && args.length > index + 1) {
    return args[index + 1];
  }
  return null;
}

async function main() {
  if (!cmd) {
    console.error("Please specify a command (e.g., forensic-financials-v2, deep-repair-financials-v2)");
    process.exit(1);
  }

  if (cmd === "forensic-financials-v2") {
    const companyId = getArg("--companyId") || getArg("-c");
    if (!companyId) {
        console.error("Error: --companyId <id> is required.");
        process.exit(1);
    }
    const res = await forensicFinancialsV2({ companyId });
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  }

  if (cmd === "deep-repair-financials-v2") {
    const companyId = getArg("--companyId") || getArg("-c");
    if (!companyId) {
        console.error("Error: --companyId <id> is required.");
        process.exit(1);
    }
    const apply = args.includes("--apply"); // default dry-run unless --apply
    const res = await deepRepairFinancialsV2({ companyId, apply });
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  }

  console.error(`Unknown command: "${cmd}"`);
  process.exit(1);
}

main().catch(error => {
  console.error("--- SCRIPT FAILED ---");
  console.error(error);
  console.error("---------------------");
  process.exit(1);
});
