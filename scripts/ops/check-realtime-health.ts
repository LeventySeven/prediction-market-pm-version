import { collectRealtimeHealthSnapshot } from "../../src/server/ops/realtimeHealth";

const main = async () => {
  const snapshot = await collectRealtimeHealthSnapshot();
  console.log(JSON.stringify(snapshot, null, 2));
};

void main().catch((error) => {
  console.error(
    "[ops] check-realtime-health failed",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
