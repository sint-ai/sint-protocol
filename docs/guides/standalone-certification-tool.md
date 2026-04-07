# Standalone Conformance Certification Tool

SINT ships a standalone certification command via `sintctl`:

```bash
node apps/sintctl/dist/cli.js certify run
```

This command executes:

```bash
pnpm --filter @sint/conformance-tests test:fixtures
```

and writes a machine-readable summary report to:

- `docs/reports/standalone-conformance-certification.json` (default)

You can override output location:

```bash
node apps/sintctl/dist/cli.js certify run --output /tmp/sint-cert-report.json
```

## Output Summary

The summary includes:

- tool/mode metadata
- UTC generation timestamp
- pass/fail status
- executed command
- report path
- exit code evidence

Use this artifact in buyer certification packets and CI evidence bundles.
