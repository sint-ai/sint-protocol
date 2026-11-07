/**
 * Records one real run of the turbine demo into console.html.
 *
 * The console page is a replay: it never runs the gateway. Decisions, evidence,
 * and terminal output come from the trace written here. Step names, token scope
 * text, and plain-language explanations are static copy in the page.
 *
 *   pnpm run demo:turbine-authority:console
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createTurbineHarness, runTurbineAuthorityDemo } from "../turbine-authority-demo.mjs";

const pageUrl = new URL("./console.html", import.meta.url);
const TRACE_BLOCK = /(<script id="trace" type="application\/json">)[\s\S]*?(<\/script>)/;

const harness = createTurbineHarness();
const steps = [];

function closeStep() {
  const step = steps.at(-1);
  if (step === undefined) return;
  step.ledgerTo = harness.ledger.length;
  step.controllerCalls = harness.controller.calls.length;
}

const outcome = await runTurbineAuthorityDemo({
  harness,
  print: (line) => {
    const step = steps.at(-1);
    if (step !== undefined && line !== `\n${step.title}`) step.lines.push(line);
  },
  pause: async (title) => {
    closeStep();
    steps.push({ title, lines: [], ledgerFrom: harness.ledger.length });
  },
});
closeStep();

if (!outcome.ok) {
  console.error(`Not recorded. Demo stopped at "${outcome.error.step}": ${outcome.error.message}`);
  process.exitCode = 1;
} else {
  const trace = {
    recordedAt: new Date().toISOString(),
    head: harness.ledger.headHash,
    tokenLabels: Object.fromEntries(harness.tokenLabels),
    steps,
    events: harness.ledger.getAll(),
  };
  // Sequence numbers are BigInt in the ledger. "<" is escaped so no value can close the script tag.
  const json = JSON.stringify(trace, (_key, value) => (typeof value === "bigint" ? value.toString() : value))
    .replaceAll("<", "\\u003c");
  const page = readFileSync(pageUrl, "utf8");
  if (TRACE_BLOCK.test(page)) {
    writeFileSync(pageUrl, page.replace(TRACE_BLOCK, (_match, open, close) => `${open}${json}${close}`));
    console.log(`Recorded ${trace.events.length} ledger events into ${fileURLToPath(pageUrl)}`);
  } else {
    console.error(`Not recorded. No trace block found in ${fileURLToPath(pageUrl)}`);
    process.exitCode = 1;
  }
}
