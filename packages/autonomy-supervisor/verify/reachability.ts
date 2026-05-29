import { ALL_STATES, AutonomyState, GuardState, TRANSITIONS, outputAllowed } from "../src/autonomy-states.js";

const BOOLS = [false, true];
function allGuards(): GuardState[] {
  const out: GuardState[] = [];
  for (const invalid of BOOLS) for (const unsafeUnrecoverable of BOOLS)
  for (const disagree of BOOLS) for (const assistAvailable of BOOLS)
  for (const timeoutM of BOOLS) for (const timeoutA of BOOLS)
  for (const extAuth of BOOLS)
    out.push({ invalid, unsafeUnrecoverable, disagree, assistAvailable, timeoutM, timeoutA, extAuth });
  return out;
}
const GUARDS = allGuards();
function enabledFrom(state: AutonomyState, g: GuardState) {
  return TRANSITIONS.filter((t) => t.from === state && t.guard(g));
}
let failures = 0;
const fail = (msg: string) => { console.error("  ✗ FAIL:", msg); failures++; };

// P2: output reachable only from S
for (const s of ALL_STATES) for (const g of GUARDS)
  if (outputAllowed(s, g) && s !== AutonomyState.STABLE) fail(`output enabled outside S in ${s}`);
console.log("P2  output-gating ........................................... checked");

// P4 / Lemma 10: governance reachable from every mode under persistent UR
for (const s of ALL_STATES) {
  if (s === AutonomyState.REGULATED) continue;
  const gUR: GuardState = { invalid: true, unsafeUnrecoverable: true, disagree: true,
    assistAvailable: true, timeoutM: true, timeoutA: true, extAuth: false };
  const seen = new Set<AutonomyState>([s]); const stack = [s]; let reached = false;
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === AutonomyState.REGULATED) { reached = true; break; }
    for (const t of enabledFrom(cur, gUR)) {
      if (!t.strongTimed) continue;
      if (!seen.has(t.to)) { seen.add(t.to); stack.push(t.to); }
    }
  }
  if (!reached) fail(`Rt not reachable from ${s} under persistent UR`);
}
console.log("P4  governance reachability ................................. checked");

// I-A6 / Lemma 11: Rt absorbing without clean external authorization
for (const g of GUARDS) {
  const exits = enabledFrom(AutonomyState.REGULATED, g);
  if (exits.length > 0 && (!g.extAuth || g.unsafeUnrecoverable))
    fail(`Rt exit enabled without clean extAuth (extAuth=${g.extAuth}, UR=${g.unsafeUnrecoverable})`);
}
console.log("ABS Rt absorption (I-A6) ................................... checked");

// Prop 3 / Lemma 8-9: no permanent residence in M or A
for (const s of [AutonomyState.METACOGNITIVE, AutonomyState.ASSISTED])
  for (const assistAvailable of BOOLS) for (const disagree of BOOLS) {
    const g: GuardState = { invalid: true, unsafeUnrecoverable: false, disagree,
      assistAvailable, timeoutM: true, timeoutA: true, extAuth: false };
    if (enabledFrom(s, g).filter((t) => t.strongTimed && t.to !== s).length === 0)
      fail(`no strong-timed exit from ${s} (assist=${assistAvailable},disagree=${disagree})`);
  }
console.log("LIVE no-stuck in M/A ....................................... checked");

// Prop 5 / B.3: disagreement blocks A->S
for (const g of GUARDS) {
  if (!g.disagree) continue;
  if (enabledFrom(AutonomyState.ASSISTED, g).some((t) => t.to === AutonomyState.STABLE))
    fail(`A->S enabled while disagree=1`);
}
console.log("P5  distributed soundness .................................. checked");

// EXCL: at most one strong-timed successor per config
for (const s of ALL_STATES) for (const g of GUARDS)
  if (enabledFrom(s, g).filter((t) => t.strongTimed).length > 1) fail(`ambiguous strong-timed escalation from ${s}`);
console.log("EXCL mode-exclusivity ..................................... checked");

console.log(failures === 0
  ? "\n✅ ALL MACRO-NET PROPERTIES HOLD over the full 4×128 configuration space."
  : `\n❌ ${failures} property violation(s).`);
process.exit(failures === 0 ? 0 : 1);
