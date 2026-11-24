/**
 * HouseCalc MCP server (stdio). Lets Claude open, edit, design and save HouseCalc
 * projects through the engine directly — no browser, no screenshots. One project is
 * held in memory; every edit is validated against the project schema before it is
 * kept, so the saved *.housecalc.json opens in the app exactly as the UI would write it.
 * Run: bun mcp/server.ts   (stdout is the protocol channel — log to stderr only)
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  applyMarkdown,
  deckExampleProject,
  designProject,
  eastLincolnTrussProject,
  exampleProject,
  newMemberSpec,
  newProject,
  parseProject,
  projectSchema,
  projectToMarkdown,
  sanMiguelProject,
  serializeProject,
  type MemberSpec,
  type NewMemberKind,
  type Project,
} from "../src/engine/project";
import { packageChecks, validationItems } from "../src/components/report/package";

const EXAMPLES = {
  new: () => newProject(),
  example: exampleProject,
  sanMiguel: sanMiguelProject,
  eastLincoln: eastLincolnTrussProject,
  deck: deckExampleProject,
};

let project: Project = exampleProject();
let filePath: string | undefined;

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (msg: string) => ({ content: [{ type: "text" as const, text: msg }], isError: true });

/** Objects merge key by key; arrays and scalars replace; null deletes the key. */
function merge(base: unknown, patch: unknown): unknown {
  if (patch === null) return undefined;
  if (
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    typeof base !== "object" ||
    base === null ||
    Array.isArray(base)
  )
    return patch;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    const m = merge(out[k], v);
    if (m === undefined) delete out[k];
    else out[k] = m;
  }
  return out;
}

/** Keep the candidate only if the whole project still validates. */
function commit(candidate: unknown): string[] | undefined {
  const r = projectSchema.safeParse(candidate);
  if (!r.success) return r.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  project = r.data;
  return undefined;
}

function findMember(key: string): MemberSpec | undefined {
  return (
    project.members.find((m) => m.id === key) ?? project.members.find((m) => m.mark.toLowerCase() === key.toLowerCase())
  );
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

function memberRows() {
  const d = designProject(project);
  return {
    d,
    rows: project.members.map((m) => {
      const o = d.outcomes.get(m.id);
      const res = o?.result;
      return {
        id: m.id,
        mark: m.mark,
        kind: m.kind,
        level: "levelId" in m ? m.levelId : undefined,
        callout: res?.callout,
        status: o?.error ? "ERROR" : !res ? "NOT DESIGNED" : res.pass ? "OK" : "FAIL",
        governing: res ? `${res.governing.name}: D/C = ${r3(res.governing.ratio)} (${res.governing.combo})` : undefined,
        error: o?.error,
      };
    }),
  };
}

const server = new McpServer({ name: "housecalc", version: "1.0.0" });

type ToolOut = { content: { type: "text"; text: string }[]; isError?: boolean };
/** registerTool with the handler typed from the zod shape here: the SDK's own generics over
 *  zod v3 shapes overflow tsc (TS2589). The SDK still validates arguments against inputSchema. */
function tool<S extends z.ZodRawShape>(
  name: string,
  config: { description: string; inputSchema: S },
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<ToolOut>,
) {
  const register = server.registerTool.bind(server) as unknown as (n: string, c: object, h: typeof handler) => void;
  register(name, config, handler);
}

tool(
  "load_project",
  {
    description:
      "Open a HouseCalc project: a *.housecalc.json file (path) or a built-in project (example: new | example | sanMiguel | eastLincoln | deck). Replaces the project in memory.",
    inputSchema: {
      path: z.string().optional(),
      example: z.enum(["new", "example", "sanMiguel", "eastLincoln", "deck"]).optional(),
    },
  },
  async ({ path, example }) => {
    if (path) {
      const r = parseProject(await readFile(resolve(path), "utf8"));
      if (!r.ok) return fail(`Not a valid HouseCalc project:\n${r.errors.join("\n")}`);
      project = r.project;
      filePath = resolve(path);
      return ok({ loaded: filePath, warnings: r.warnings, members: project.members.length });
    }
    project = EXAMPLES[example ?? "new"]();
    filePath = undefined;
    return ok({ loaded: example ?? "new", members: project.members.length });
  },
);

tool(
  "save_project",
  {
    description:
      "Write the project in memory to a *.housecalc.json file (default: the file it was opened from). Open it in the HouseCalc app to print the PDF/DOCX package.",
    inputSchema: { path: z.string().optional() },
  },
  async ({ path }) => {
    const target = path ? resolve(path) : filePath;
    if (!target) return fail("No file path — pass path (e.g. ./my-job.housecalc.json).");
    await writeFile(target, serializeProject(project));
    filePath = target;
    return ok({ saved: target });
  },
);

tool(
  "project_summary",
  {
    description:
      "Project info, criteria, structures/levels, marks and every member with its callout, status and governing D/C.",
    inputSchema: {},
  },
  async () => {
    const { rows } = memberRows();
    return ok({
      file: filePath,
      info: project.info,
      criteria: project.criteria,
      structures: project.structures,
      marks: project.marks,
      assemblies: project.assemblies.map((a) => ({ id: a.id, name: a.name })),
      members: rows,
    });
  },
);

tool(
  "get_member",
  {
    description:
      "Full input spec of one member (by id or mark) plus its design result: callout, governing check, all checks, reactions, flags, assumptions (verify items flagged).",
    inputSchema: { member: z.string() },
  },
  async ({ member }) => {
    const m = findMember(member);
    if (!m) return fail(`No member '${member}'.`);
    const o = designProject(project).outcomes.get(m.id);
    const res = o?.result;
    return ok({
      spec: m,
      error: o?.error,
      dependsOn: o?.dependsOn,
      result: res && {
        callout: res.callout,
        pass: res.pass,
        governing: res.governing,
        checks: res.checks,
        reactions: res.reactions,
        flags: res.flags,
        assumptions: res.assumptions,
        alternatives: res.alternatives,
      },
    });
  },
);

tool(
  "add_member",
  {
    description:
      "Add a member from the app's template for kind (joist, rafter, ceilingJoist, ijoist, beam, header, ridge, truss, wall, post, connector, footing, pad, shearWall, ftaoWall, roofDiaphragm, floorDiaphragm, transfer, uplift, ledger, steelBeam, steelColumn, basePlate, cmuWall, concreteWall, holdownFooting, tieIn, woodTruss, retainingWall, guardPost, cfsWall). Mark is assigned from the project's mark scheme; optional patch is merged onto the template (objects merge, arrays replace).",
    inputSchema: {
      kind: z.string(),
      structureId: z.string().optional(),
      levelId: z.string().optional(),
      patch: z.record(z.string(), z.unknown()).optional(),
    },
  },
  async ({ kind, structureId, levelId, patch }) => {
    const s = project.structures.find((x) => x.id === structureId) ?? project.structures[0];
    const lvl = levelId ?? s.levels[0].id;
    let spec: MemberSpec;
    try {
      spec = newMemberSpec(project, kind as NewMemberKind, s.id, lvl);
    } catch (e) {
      return fail(`Cannot create '${kind}': ${e instanceof Error ? e.message : String(e)}`);
    }
    const merged = merge(spec, patch ?? {}) as MemberSpec;
    const errs = commit({ ...project, members: [...project.members, merged] });
    if (errs) return fail(`Rejected:\n${errs.join("\n")}`);
    return ok({ added: findMember(merged.id) });
  },
);

tool(
  "update_member",
  {
    description:
      "Change a member (by id or mark): patch is merged onto its spec (objects merge, arrays replace, null deletes). Rejected if the project no longer validates.",
    inputSchema: { member: z.string(), patch: z.record(z.string(), z.unknown()) },
  },
  async ({ member, patch }) => {
    const m = findMember(member);
    if (!m) return fail(`No member '${member}'.`);
    const next = merge(m, { ...patch, id: m.id, kind: m.kind });
    const errs = commit({ ...project, members: project.members.map((x) => (x.id === m.id ? next : x)) });
    if (errs) return fail(`Rejected:\n${errs.join("\n")}`);
    return ok({ updated: findMember(m.id) });
  },
);

tool(
  "delete_member",
  {
    description: "Remove a member (by id or mark). Load-path links from other members to it are reported, not removed.",
    inputSchema: { member: z.string() },
  },
  async ({ member }) => {
    const m = findMember(member);
    if (!m) return fail(`No member '${member}'.`);
    project = { ...project, members: project.members.filter((x) => x.id !== m.id) };
    const linkedFrom = project.members.filter((x) => x.links.some((l) => l.sourceId === m.id)).map((x) => x.mark);
    return ok({ deleted: m.mark, stillLinkedFrom: linkedFrom });
  },
);

tool(
  "update_project",
  {
    description:
      "Change project-level data (info, criteria, assemblies, structures, marks, hardware, lateral, notes, slab, ...): patch merged onto the project (objects merge, arrays replace). Use add/update_member for members.",
    inputSchema: { patch: z.record(z.string(), z.unknown()) },
  },
  async ({ patch }) => {
    const { members: _ignored, ...rest } = patch;
    const errs = commit(merge(project, rest));
    if (errs) return fail(`Rejected:\n${errs.join("\n")}`);
    return ok({ info: project.info, criteria: project.criteria });
  },
);

tool(
  "fill_from_markdown",
  {
    description:
      "Fill the project from a HouseCalc Markdown input sheet (same as the app's 'Fill from .md…'). Give text or a path. mode 'fill' updates the current project, 'new' starts a fresh one. Use export_markdown on the example for the format.",
    inputSchema: {
      text: z.string().optional(),
      path: z.string().optional(),
      mode: z.enum(["fill", "new"]).default("fill"),
    },
  },
  async ({ text, path, mode }) => {
    const md = text ?? (path ? await readFile(resolve(path), "utf8") : undefined);
    if (!md) return fail("Pass text or path.");
    const r = applyMarkdown(project, md, { mode });
    if (!r.ok) return fail(`Nothing applied:\n${JSON.stringify(r.report, null, 2)}`);
    project = r.project;
    return ok({ ...r.report, members: project.members.length });
  },
);

tool(
  "export_markdown",
  {
    description:
      "The project as a HouseCalc Markdown input sheet (same as the app's 'Export .md'); written to path if given, else returned.",
    inputSchema: { path: z.string().optional() },
  },
  async ({ path }) => {
    const md = projectToMarkdown(project);
    if (!path) return { content: [{ type: "text" as const, text: md }] };
    await writeFile(resolve(path), md);
    return ok({ saved: resolve(path) });
  },
);

tool(
  "run_design",
  {
    description:
      "Design every member through the load path and return the package checks (marks, errors, failures, uncarried reactions, untied uplift, verify items), lateral status and each member's callout, status and governing D/C.",
    inputSchema: {},
  },
  async () => {
    const { d, rows } = memberRows();
    return ok({
      packageChecks: packageChecks(project, d),
      /** open items to resolve before the final issue (the app's Validation panel) */
      validation: validationItems(project, d),
      circular: d.circular.map((id) => findMember(id)?.mark ?? id),
      lateralError: d.lateralError,
      members: rows,
    });
  },
);

await server.connect(new StdioServerTransport());
console.error("housecalc MCP server ready");
