# HouseCalc — working rules for Claude

- Drive HouseCalc through the `housecalc` MCP tools (`.mcp.json`, or the `housecalc` plugin): `load_project`,
  `fill_from_markdown`, `run_design`, `get_member`, `update_member` / `update_project`, `save_project`. Never open the
  app in a browser or take screenshots to enter data or read results. This overrides step 7 ("run headless,
  Playwright") of the `housecalc-from-drawings` skill; follow `plugin/skills/housecalc-from-drawings/SKILL.md`.
- The browser is only for printing the PDF / Word report from a saved `.housecalc.json`.
- If the `housecalc` tools are missing, say so and stop; do not fall back to the browser.
- After changing `src/engine/**` or `mcp/server.ts`, run `bun run build:plugin` (tests/plugin.test.ts checks it).
