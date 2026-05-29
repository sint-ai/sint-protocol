# Industrial Example Cells

Example cells show how SINT packages intent, cell graph, simulation evidence,
approval, adapter translation, receipt chain, and settlement attribution.

Each example must stay honest about status:

- `active-fixture-backed` examples have executable fixture or conformance tests
- `planned` examples describe the target shape without claiming deployment

Before an example becomes active:

1. Add fixture data under `packages/conformance-tests/fixtures/industrial`.
2. Add conformance coverage for deny, approval, and receipt-chain behavior.
3. Include at least one simulator profile.
4. Include at least two adapter or export profiles.
