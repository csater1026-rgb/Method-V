// Every database call in the website and the app, checked against the real
// schema: the one Supabase serves (built here from supabase/migrations/).
//
//   npm run test:queries
//
// The other tests run the site in demo mode or talk to the database with
// plain SQL, so they never go through PostgREST, the layer Supabase puts in
// front of the database. Mistakes there only show on the live site, quietly:
// a list comes back empty, or a page says "not found" (like the Q&A embed
// that was ambiguous). This reads the code with the TypeScript parser, finds
// every .from(...).select/insert/update/upsert/filter and every .rpc(...), and
// checks, for a signed-in person (or the server's secret key where the code
// uses the admin client):
//   - tables and columns exist, and the role may read/write those columns
//     (an upsert also rewrites every column it sends, conflict key included);
//   - "select *" isn't used on a table with private columns (profiles);
//   - every embed resolves to exactly one relationship (or names it);
//   - filters and ordering use real columns the role may read (embedded
//     ones too);
//   - row-level security has a rule for what's being done, so a read isn't
//     always empty and a write isn't always refused;
//   - an upsert's conflict columns have a unique index;
//   - every function exists, gets arguments by their real names, has all
//     the ones without defaults, and the role may call it.
// A value picked by a condition ("kind === 'question' ? a : b") is followed
// consistently: the table and column picked by the same condition go together.
// Expressions it can't work out are listed so a person can check them.

import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const root = new URL("..", import.meta.url).pathname;
const migrationsDir = join(root, "supabase/migrations");

// ---------------------------------------------------------------------------
// The schema, from the migrations (same stand-ins for Supabase as the DB tests)
// ---------------------------------------------------------------------------

const db = new PGlite();
const bootstrap = readFileSync(join(root, "tests/db.test.mjs"), "utf8").match(/await db\.exec\(`\n(  create role anon[\s\S]*?)`\);/)[1];
await db.exec(bootstrap);
for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(migrationsDir, f), "utf8"));
}

const columns = new Map(); // table -> Set(columns)
for (const r of (await db.query(`select table_name t, column_name c from information_schema.columns where table_schema = 'public'`)).rows) {
  if (!columns.has(r.t)) columns.set(r.t, new Set());
  columns.get(r.t).add(r.c);
}

const ROLES = ["anon", "authenticated"];
const privileges = new Map(); // `${role}|${priv}|${table}.${column}` -> boolean
for (const role of ROLES) {
  for (const priv of ["SELECT", "INSERT", "UPDATE"]) {
    const rows = (
      await db.query(
        `select c.table_name t, c.column_name c, has_column_privilege($1, format('public.%I', c.table_name), c.column_name, $2) ok
         from information_schema.columns c join pg_class k on k.relname = c.table_name and k.relnamespace = 'public'::regnamespace
         where c.table_schema = 'public' and k.relkind in ('r', 'v', 'p')`,
        [role, priv],
      )
    ).rows;
    for (const r of rows) privileges.set(`${role}|${priv}|${r.t}.${r.c}`, r.ok);
  }
}
const tableDelete = new Map();
for (const role of ROLES) {
  for (const r of (await db.query(`select tablename t, has_table_privilege($1, format('public.%I', tablename), 'DELETE') ok from pg_tables where schemaname = 'public'`, [role])).rows) {
    tableDelete.set(`${role}|${r.t}`, r.ok);
  }
}

const fks = (
  await db.query(`
    select c.conname name, cl.relname from_table, cf.relname to_table,
      (select array_agg(a.attname order by k.i) from unnest(c.conkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n) from_cols,
      (select array_agg(a.attname order by k.i) from unnest(c.confkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n) to_cols
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_class cf on cf.oid = c.confrelid
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and cf.relnamespace = 'public'::regnamespace`)
).rows;
const primaryKeys = new Map();
for (const r of (
  await db.query(`
    select cl.relname t, (select array_agg(a.attname) from unnest(c.conkey) k(n) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n) cols
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid where c.contype = 'p' and c.connamespace = 'public'::regnamespace`)
).rows) {
  primaryKeys.set(r.t, new Set(r.cols));
}

// Unique indexes an upsert's ON CONFLICT can use (not partial, no expressions).
const uniqueIndexes = new Map(); // table -> [Set(columns)]
for (const r of (
  await db.query(`
    select t.relname t, (select array_agg(a.attname) from unnest(i.indkey::int2[]) k(n) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n) cols
    from pg_index i join pg_class t on t.oid = i.indrelid
    where t.relnamespace = 'public'::regnamespace and i.indisunique and i.indpred is null and not (0 = any(i.indkey::int2[]))`)
).rows) {
  if (!uniqueIndexes.has(r.t)) uniqueIndexes.set(r.t, []);
  uniqueIndexes.get(r.t).push(new Set(r.cols));
}

// Row-level security: which tables have it on, and their rules.
const rlsOn = new Map();
for (const r of (await db.query(`select relname t, relrowsecurity rls from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')`)).rows) {
  rlsOn.set(r.t, r.rls);
}
const policies = (await db.query(`select tablename t, cmd, roles, permissive from pg_policies where schemaname = 'public'`)).rows;
// Does some rule let the role being checked do `cmd` on `table` at all?
function hasPolicy(table, cmd) {
  if (!rlsOn.get(table)) return true;
  return policies.some(
    (p) => p.t === table && p.permissive === "PERMISSIVE" && (p.cmd === "ALL" || p.cmd === cmd) && (p.roles.includes(ROLE) || p.roles.includes("public")),
  );
}

const functions = new Map(); // name -> [{ args: [names], required: n, anon, auth, service }]
for (const r of (
  await db.query(`
    select p.proname n, coalesce(p.proargnames, '{}') names, p.pronargs nargs, p.pronargdefaults ndefaults,
      has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') auth,
      has_function_privilege('service_role', p.oid, 'execute') service
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype`)
).rows) {
  if (!functions.has(r.n)) functions.set(r.n, []);
  functions.get(r.n).push({ args: r.names.slice(0, r.nargs), required: r.nargs - r.ndefaults, anon: r.anon, auth: r.auth, service: r.service });
}

// ---------------------------------------------------------------------------
// The code
// ---------------------------------------------------------------------------

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}
const files = [...walk(join(root, "src")), ...walk(join(root, "mobile/src"))];
const sources = files.map((f) => ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS));

// Top-level constants and functions, per file and across files (for imports).
const globalDecls = new Map();
const fileDecls = new Map();
for (const sf of sources) {
  const decls = new Map();
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) decls.set(d.name.text, d.initializer);
    } else if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
  }
  fileDecls.set(sf, decls);
  for (const [k, v] of decls) if (!globalDecls.has(k)) globalDecls.set(k, v);
}

// Type aliases and interfaces, so a typed parameter's keys are known
// ("kinds: PushKinds" spread into an insert).
const globalTypes = new Map();
const fileTypes = new Map();
for (const sf of sources) {
  const decls = new Map();
  for (const st of sf.statements) {
    if (ts.isTypeAliasDeclaration(st)) decls.set(st.name.text, st.type);
    else if (ts.isInterfaceDeclaration(st)) decls.set(st.name.text, st);
  }
  fileTypes.set(sf, decls);
  for (const [k, v] of decls) if (!globalTypes.has(k)) globalTypes.set(k, v);
}

const where = (node) => {
  const sf = node.getSourceFile();
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
  return `${relative(root, sf.fileName)}:${line + 1}`;
};

// Finds what an identifier refers to: a local const in an enclosing function,
// a parameter bound by a call we're evaluating, or a top-level declaration.
function lookup(name, node, bindings) {
  if (bindings && name in bindings) return { value: bindings[name] };
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isBlock(n) || ts.isSourceFile(n)) {
      for (const st of n.statements) {
        if (!ts.isVariableStatement(st)) continue;
        for (const d of st.declarationList.declarations) {
          if (!d.initializer) continue;
          if (ts.isIdentifier(d.name) && d.name.text === name) return { node: d.initializer };
          // const [mine, theirs] = cond ? [a, b] : [c, d]
          if (ts.isArrayBindingPattern(d.name)) {
            const index = d.name.elements.findIndex((e) => ts.isBindingElement(e) && ts.isIdentifier(e.name) && e.name.text === name);
            if (index >= 0) return { node: d.initializer, index };
          }
        }
      }
    }
    if (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      const decl = n.parameters.find((p) => ts.isIdentifier(p.name) && p.name.text === name);
      if (decl) return { param: true, decl };
    }
  }
  const sf = node.getSourceFile();
  const local = fileDecls.get(sf).get(name) ?? globalDecls.get(name);
  return local ? { node: local } : null;
}

const UNKNOWN = Symbol("unknown");
const MAX = 16;

// Conditions: each chain is checked once with every condition both ways (to
// find them all), then once per combination, holding each condition to one
// answer everywhere it appears. So "kind === 'question'" can't pick
// question_votes for the table and answer_id for the column.
let ASSUME = new Map(); // condition text -> true/false
let SEEN = new Set();
function branches(node, bindings) {
  // A flag passed in by the call being evaluated (questionSelect(true)) decides it.
  let cond = unwrap(node.condition);
  let negate = false;
  while (ts.isPrefixUnaryExpression(cond) && cond.operator === ts.SyntaxKind.ExclamationToken) {
    negate = !negate;
    cond = unwrap(cond.operand);
  }
  const bound = ts.isIdentifier(cond) && bindings && cond.text in bindings ? bindings[cond.text] : null;
  if (bound?.length === 1 && (bound[0] === "true" || bound[0] === "false")) return [(bound[0] === "true") !== negate ? node.whenTrue : node.whenFalse];
  const key = node.condition.getText().replace(/\s+/g, " ");
  if (ASSUME.has(key)) return [ASSUME.get(key) ? node.whenTrue : node.whenFalse];
  SEEN.add(key);
  return [node.whenTrue, node.whenFalse];
}

// In a filter string, a value we can't work out (an id, a search) doesn't
// matter: only the column names do. HOLE stands in for the value.
const HOLE = "\u0001";
let LENIENT = false;

const unwrap = (node) =>
  node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isNonNullExpression(node)) ? unwrap(node.expression) : node;

// The strings element `index` of an array expression can be.
function elementStrings(node, index, depth) {
  node = unwrap(node);
  if (!node || depth > 12) return UNKNOWN;
  if (ts.isArrayLiteralExpression(node)) return strings(node.elements[index], undefined, depth + 1);
  if (ts.isConditionalExpression(node)) {
    const outs = branches(node).map((b) => elementStrings(b, index, depth + 1));
    return outs.includes(UNKNOWN) ? UNKNOWN : outs.flat().slice(0, MAX);
  }
  if (ts.isIdentifier(node)) {
    const found = lookup(node.text, node);
    return found?.node && found.index === undefined ? elementStrings(found.node, index, depth + 1) : UNKNOWN;
  }
  return UNKNOWN;
}

// Every string an expression can produce (flags like qaColumns count as both
// true and false), or UNKNOWN.
function strings(node, bindings, depth = 0) {
  if (!node || depth > 12) return UNKNOWN;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node) || ts.isTypeAssertionExpression?.(node) || ts.isNonNullExpression(node)) {
    return strings(node.expression, bindings, depth + 1);
  }
  if (ts.isTemplateExpression(node)) {
    let acc = [node.head.text];
    for (const span of node.templateSpans) {
      let parts = strings(span.expression, bindings, depth + 1);
      if (parts === UNKNOWN && LENIENT) parts = [HOLE];
      if (parts === UNKNOWN) return UNKNOWN;
      acc = acc.flatMap((a) => parts.map((p) => a + p + span.literal.text)).slice(0, MAX);
    }
    return acc;
  }
  if (ts.isConditionalExpression(node)) {
    const outs = branches(node, bindings).map((b) => strings(b, bindings, depth + 1));
    return outs.includes(UNKNOWN) ? UNKNOWN : outs.flat().slice(0, MAX);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = strings(node.left, bindings, depth + 1);
    const b = strings(node.right, bindings, depth + 1);
    if (a === UNKNOWN || b === UNKNOWN) return UNKNOWN;
    return a.flatMap((x) => b.map((y) => x + y)).slice(0, MAX);
  }
  if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
    const a = strings(node.left, bindings, depth + 1);
    const b = strings(node.right, bindings, depth + 1);
    if (a === UNKNOWN && b === UNKNOWN) return UNKNOWN;
    return [...(a === UNKNOWN ? [] : a), ...(b === UNKNOWN ? [] : b)];
  }
  if (ts.isIdentifier(node)) {
    const found = lookup(node.text, node, bindings);
    if (!found || found.param) return UNKNOWN;
    if ("value" in found) return found.value;
    if (found.index !== undefined) return elementStrings(found.node, found.index, depth + 1);
    if (ts.isArrowFunction(found.node) || ts.isFunctionDeclaration(found.node)) return UNKNOWN;
    return strings(found.node, undefined, depth + 1);
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const found = lookup(node.expression.text, node, bindings);
    const fn = found?.node;
    if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn))) return UNKNOWN;
    const bound = {};
    fn.parameters.forEach((p, i) => {
      if (!ts.isIdentifier(p.name)) return;
      const arg = node.arguments[i];
      const v = arg ? strings(arg, bindings, depth + 1) : UNKNOWN;
      bound[p.name.text] = v === UNKNOWN ? ["true", "false"] : v; // booleans: both branches
    });
    const body = fn.body;
    if (!body) return UNKNOWN;
    if (!ts.isBlock(body)) return strings(body, bound, depth + 1);
    const ret = body.statements.find((s) => ts.isReturnStatement(s));
    return ret?.expression ? strings(ret.expression, bound, depth + 1) : UNKNOWN;
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return ["true"];
  if (node.kind === ts.SyntaxKind.FalseKeyword) return ["false"];
  return UNKNOWN;
}

// The property names of a type ({ a: x; b: y }, an alias or interface of one,
// Partial<...>, A & B), or UNKNOWN.
function typeKeys(t, sf, depth = 0) {
  if (!t || depth > 8) return UNKNOWN;
  if (ts.isParenthesizedTypeNode(t)) return typeKeys(t.type, sf, depth + 1);
  if (ts.isTypeLiteralNode(t) || ts.isInterfaceDeclaration(t)) {
    const keys = [];
    for (const m of t.members) {
      if (ts.isPropertySignature(m) && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) keys.push(m.name.text);
      else return UNKNOWN;
    }
    return keys;
  }
  if (ts.isIntersectionTypeNode(t)) {
    const all = t.types.map((x) => typeKeys(x, sf, depth + 1));
    return all.includes(UNKNOWN) ? UNKNOWN : [...new Set(all.flat())];
  }
  if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName)) {
    const name = t.typeName.text;
    if (["Partial", "Readonly", "Required"].includes(name) && t.typeArguments?.length === 1) return typeKeys(t.typeArguments[0], sf, depth + 1);
    const d = fileTypes.get(sf)?.get(name) ?? globalTypes.get(name);
    return d ? typeKeys(d, d.getSourceFile(), depth + 1) : UNKNOWN;
  }
  return UNKNOWN;
}

// Keys of an object literal (following spreads of local objects), or UNKNOWN.
function objectKeys(node, depth = 0) {
  if (!node || depth > 8) return UNKNOWN;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return objectKeys(node.expression, depth + 1);
  if (ts.isArrayLiteralExpression(node)) {
    const all = node.elements.map((e) => objectKeys(e, depth + 1));
    if (all.some((k) => k === UNKNOWN)) return UNKNOWN;
    return [...new Set(all.flat())];
  }
  if (ts.isConditionalExpression(node)) {
    const outs = branches(node).map((b) => objectKeys(b, depth + 1));
    return outs.includes(UNKNOWN) ? UNKNOWN : [...new Set(outs.flat())];
  }
  if (ts.isIdentifier(node)) {
    const found = lookup(node.text, node);
    if (found?.param && found.decl.type) return typeKeys(found.decl.type, node.getSourceFile());
    if (!found?.node || found.index !== undefined) return UNKNOWN;
    return objectKeys(found.node, depth + 1);
  }
  if (!ts.isObjectLiteralExpression(node)) return UNKNOWN;
  const keys = [];
  for (const p of node.properties) {
    if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
      if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) keys.push(p.name.text);
      else if (ts.isComputedPropertyName(p.name)) {
        const k = strings(p.name.expression);
        if (k === UNKNOWN) return UNKNOWN;
        keys.push(...k);
      } else return UNKNOWN;
    } else if (ts.isSpreadAssignment(p)) {
      const k = objectKeys(p.expression, depth + 1);
      if (k === UNKNOWN) return UNKNOWN;
      keys.push(...k);
    } else return UNKNOWN;
  }
  return keys;
}

// ---------------------------------------------------------------------------
// PostgREST select strings
// ---------------------------------------------------------------------------

function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function parseSelect(s) {
  return splitTop(s.replace(/\s+/g, " ")).map((item) => {
    if (item === "*") return { kind: "star" };
    const paren = item.indexOf("(");
    if (paren >= 0 && item.endsWith(")")) {
      let head = item.slice(0, paren).trim().replace(/^\.\.\./, "");
      const inner = item.slice(paren + 1, -1);
      let alias = null;
      if (head.includes(":")) [alias, head] = head.split(":").map((x) => x.trim());
      const [target, ...hints] = head.split("!");
      if (target === "count" && inner === "") return { kind: "count" };
      return { kind: "embed", alias, target, hints, children: parseSelect(inner) };
    }
    let col = item;
    if (col.includes(":") && !col.includes("::")) col = col.split(":")[1].trim();
    else if (/^\w+:\w/.test(col)) col = col.split(":")[1];
    col = col.split("::")[0].split("->")[0].trim();
    return { kind: "col", name: col };
  });
}

// Every relationship PostgREST could use to embed `target` in `from`.
function relationships(from, target) {
  const out = [];
  for (const fk of fks) {
    if (fk.from_table === from && fk.to_table === target) out.push({ via: fk.name, cols: fk.from_cols, kind: "many-to-one" });
    if (fk.from_table === target && fk.to_table === from && !(from === target)) out.push({ via: fk.name, cols: fk.from_cols, kind: "one-to-many" });
    if (from === target && fk.from_table === from && fk.to_table === from) out.push({ via: fk.name, cols: fk.from_cols, kind: "self" });
  }
  // Many-to-many through a junction table whose primary key holds both keys.
  for (const a of fks) {
    for (const b of fks) {
      if (a === b || a.from_table !== b.from_table) continue;
      const j = a.from_table;
      if (j === from || j === target) continue;
      if (a.to_table !== from || b.to_table !== target) continue;
      const pk = primaryKeys.get(j) ?? new Set();
      if ([...a.from_cols, ...b.from_cols].every((c) => pk.has(c))) out.push({ via: `${j} (${a.name}, ${b.name})`, junction: j, fks: [a.name, b.name], cols: [], kind: "many-to-many" });
    }
  }
  return out;
}

const problems = [];
const unresolved = [];
const checked = { selects: 0, writes: 0, filters: 0, rpcs: 0 };

function problem(node, msg) {
  problems.push(`${where(node)}  ${msg}`);
}

// Checked as a signed-in person, then again as a signed-out visitor for the
// code the open pages run (embeds, badges, Try it links, the public API).
let ROLE = "authenticated";
const who = () => (ROLE === "anon" ? "a signed-out visitor" : "a signed-in person");

function canRead(role, table, col) {
  return privileges.get(`${role}|SELECT|${table}.${col}`) === true;
}

// Checks a parsed select against a table; returns the embeds by alias/name.
function checkSelect(items, table, node, admin, path = table) {
  const embeds = new Map();
  const cols = columns.get(table);
  if (!cols) {
    problem(node, `unknown table "${table}"`);
    return embeds;
  }
  if (!admin && !hasPolicy(table, "SELECT")) problem(node, `no row-level security rule lets ${who()} read ${table} (${path}): it always comes back empty`);
  for (const it of items) {
    if (it.kind === "star") {
      if (!admin) {
        const hidden = [...cols].filter((c) => !canRead(ROLE, table, c));
        if (hidden.length) problem(node, `select * on ${path} includes columns ${who()} can't read (${hidden.join(", ")}): the whole read fails`);
      }
    } else if (it.kind === "count") {
      // aggregate: fine
    } else if (it.kind === "col") {
      if (!cols.has(it.name)) problem(node, `${path} has no column "${it.name}"`);
      else if (!admin && !canRead(ROLE, table, it.name)) problem(node, `${who()} can't read ${path}.${it.name}`);
    } else {
      const target = it.target;
      if (!columns.has(target)) {
        problem(node, `embed "${target}" in ${path} is not a table`);
        continue;
      }
      const hints = it.hints.filter((h) => h !== "inner" && h !== "left");
      let rels = relationships(table, target);
      for (const h of hints) {
        rels = rels.filter((r) => r.via === h || r.fks?.includes(h) || r.junction === h || r.cols.includes(h));
      }
      if (rels.length === 0) problem(node, `no relationship between ${path} and ${target}${hints.length ? ` named ${hints.join("!")}` : ""}`);
      else if (rels.length > 1) problem(node, `embedding ${target} in ${path} is ambiguous (${rels.map((r) => `${r.kind} via ${r.via}`).join(" | ")}): name one, e.g. ${target}!${rels[0].fks?.[0] ?? rels[0].via}(...)`);
      embeds.set(it.alias ?? target, { table: target, items: it.children });
      checkSelect(it.children, target, node, admin, `${path}.${it.alias ?? target}`);
    }
  }
  return embeds;
}

// A filter or ordering column (maybe on an embed, "app.slug"). The database
// also needs read access to any column a filter looks at.
function checkColumnRef(ref, table, embeds, node, what, admin) {
  checked.filters++;
  const parts = ref.split(".");
  let t = table;
  let em = embeds;
  while (parts.length > 1) {
    const hop = parts.shift();
    const e = em?.get(hop);
    if (!e) {
      problem(node, `${what} "${ref}": "${hop}" isn't embedded in this select`);
      return;
    }
    t = e.table;
    em = new Map();
  }
  const col = parts[0].split("->")[0];
  if (!columns.get(t)?.has(col)) problem(node, `${what} "${ref}": ${t} has no column "${col}"`);
  else if (!admin && !canRead(ROLE, t, col)) problem(node, `${what} "${ref}": ${who()} can't read ${t}.${col}, so the query fails`);
}

// The columns a PostgREST logic string looks at: "a.eq.1,and(b.gt.2,c.is.null)".
function logicColumns(cond) {
  const out = [];
  for (const part of splitTop(cond)) {
    const m = /^(?:not\.)?(?:and|or)\((.*)\)$/s.exec(part);
    if (m) out.push(...logicColumns(m[1]));
    else out.push(part.split(".")[0]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Walk every .from("table") chain and every .rpc(...)
// ---------------------------------------------------------------------------

const NOT_DB = /^(Buffer|Array|Object|Promise|Set|Map|crypto|Uint8Array)$|storage|bucket/i;

// The calls chained onto `n`: supabase.from("x") -> [select, eq, order, ...].
function chainFrom(n) {
  const chain = [];
  while (n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n && n.parent.parent && ts.isCallExpression(n.parent.parent)) {
    chain.push({ method: n.parent.name.text, args: n.parent.parent.arguments, node: n.parent.parent });
    n = n.parent.parent;
  }
  return chain;
}

// "let query = supabase.from(...)...; if (x) query = query.eq(...)": the calls
// added later, through the variable. Also "const base = () => supabase.from(...)
// ...; base().gt(...)": the calls added to each base().
function laterCalls(call) {
  let top = call;
  while (top.parent && ts.isPropertyAccessExpression(top.parent) && top.parent.expression === top && top.parent.parent && ts.isCallExpression(top.parent.parent)) top = top.parent.parent;
  let holder = top.parent;
  const viaFunction = holder && ts.isArrowFunction(holder) && holder.body === top;
  if (viaFunction) holder = holder.parent;
  if (!holder || !ts.isVariableDeclaration(holder) || !ts.isIdentifier(holder.name)) return [];
  const name = holder.name.text;
  const out = [];
  const visit = (n) => {
    if (ts.isIdentifier(n) && n.text === name && n !== holder.name) {
      if (!viaFunction) out.push(...chainFrom(n));
      else if (ts.isCallExpression(n.parent) && n.parent.expression === n) out.push(...chainFrom(n.parent));
    }
    ts.forEachChild(n, visit);
  };
  visit(enclosingFunction(holder) ?? holder.getSourceFile());
  return out;
}

// Callers of a function whose parameter feeds .rpc(name, args): evaluate at each call site.
function callSites(fnName) {
  const out = [];
  for (const sf of sources) {
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === fnName) out.push(n);
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

function enclosingFunction(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)) return n;
  }
  return null;
}

function functionName(fn) {
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
  if (fn.parent && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) return fn.parent.name.text;
  return null;
}

// An option in a call's options object: .upsert(row, { onConflict: "user_id" }).
function option(arg, name) {
  const o = unwrap(arg);
  if (!o || !ts.isObjectLiteralExpression(o)) return null;
  const p = o.properties.find((x) => ts.isPropertyAssignment(x) && x.name.getText() === name);
  return p ? p.initializer : null;
}

function checkRpc(node, nameNode, argsNode, admin, via = null) {
  // A helper passing its parameters through: check every caller instead.
  const fn = enclosingFunction(node);
  const paramIndex = (expr) => (expr && ts.isIdentifier(expr) && fn ? fn.parameters.findIndex((p) => ts.isIdentifier(p.name) && p.name.text === expr.text) : -1);
  const ni = paramIndex(nameNode);
  const ai = paramIndex(argsNode);
  if ((ni >= 0 || ai >= 0) && !via) {
    const name = functionName(fn);
    const sites = name ? callSites(name) : [];
    if (sites.length === 0) unresolved.push(`${where(node)}  rpc through a helper with no callers found`);
    for (const site of sites) checkRpc(site, ni >= 0 ? site.arguments[ni] : nameNode, ai >= 0 ? site.arguments[ai] : argsNode, admin, node);
    return;
  }
  const names = strings(nameNode);
  if (names === UNKNOWN) {
    unresolved.push(`${where(node)}  rpc name ${nameNode?.getText()}`);
    return;
  }
  for (const name of names) {
    checked.rpcs++;
    const defs = functions.get(name);
    if (!defs) {
      problem(node, `no function public.${name}()`);
      continue;
    }
    const keys = argsNode ? objectKeys(argsNode) : [];
    if (keys === UNKNOWN) {
      unresolved.push(`${where(node)}  arguments of ${name}(): ${argsNode.getText().slice(0, 60)}`);
      continue;
    }
    const match = defs.find((d) => keys.every((k) => d.args.includes(k)) && d.args.slice(0, d.required).every((a) => keys.includes(a)));
    if (!match) {
      problem(node, `${name}(${keys.join(", ")}) matches no version of the function (it takes ${defs.map((d) => `(${d.args.join(", ")})`).join(" or ")})`);
      continue;
    }
    if (admin ? !match.service : !(ROLE === "anon" ? match.anon : match.auth)) problem(node, `${admin ? "the server's key" : who()} can't call ${name}()`);
  }
}

// One .from(...) chain against one table.
function checkChain(table, chain, node, admin) {
  if (!columns.has(table)) {
    problem(node, `unknown table "${table}"`);
    return;
  }
  let embeds = new Map();
  const select = chain.find((c) => c.method === "select");
  if (select) {
    // .select() with nothing in it is "select *".
    const sels = select.args[0] ? strings(select.args[0]) : ["*"];
    if (sels === UNKNOWN) unresolved.push(`${where(select.node)}  select ${select.args[0].getText().slice(0, 60)}`);
    else {
      for (const s of sels) {
        checked.selects++;
        embeds = new Map([...embeds, ...checkSelect(parseSelect(s), table, select.node, admin)]);
      }
    }
  }
  for (const c of chain) {
    if (["insert", "update", "upsert"].includes(c.method)) {
      checked.writes++;
      const keys = objectKeys(c.args[0]);
      if (keys === UNKNOWN) {
        unresolved.push(`${where(c.node)}  ${c.method} values ${c.args[0]?.getText().slice(0, 60)}`);
        continue;
      }
      // An upsert is INSERT ... ON CONFLICT DO UPDATE SET <every column sent>,
      // conflict key included, unless it only skips duplicates.
      const skipsDuplicates = c.method === "upsert" && option(c.args[1], "ignoreDuplicates")?.kind === ts.SyntaxKind.TrueKeyword;
      const privs = c.method === "upsert" ? (skipsDuplicates ? ["INSERT"] : ["INSERT", "UPDATE"]) : [c.method.toUpperCase()];
      for (const k of keys) {
        if (!columns.get(table).has(k)) problem(c.node, `${c.method} into ${table}: no column "${k}"`);
        else if (!admin) {
          for (const p of privs) {
            if (privileges.get(`${ROLE}|${p}|${table}.${k}`) !== true) problem(c.node, `${c.method} into ${table}: ${who()} can't ${p.toLowerCase()} "${k}"`);
          }
        }
      }
      if (!admin) {
        for (const p of privs) {
          if (!hasPolicy(table, p)) problem(c.node, `${c.method} into ${table}: no row-level security rule lets ${who()} ${p.toLowerCase()} there`);
        }
      }
      if (c.method === "upsert") {
        const target = option(c.args[1], "onConflict");
        const names = target ? strings(target) : null;
        if (names === UNKNOWN) unresolved.push(`${where(c.node)}  upsert onConflict ${target.getText()}`);
        else {
          const want = names ? new Set(names[0].split(",").map((x) => x.trim())) : primaryKeys.get(table);
          const ok = want && (uniqueIndexes.get(table) ?? []).some((u) => u.size === want.size && [...want].every((x) => u.has(x)));
          if (!ok) problem(c.node, `upsert into ${table}: no unique index on (${[...(want ?? [])].join(", ")}) for it to match on`);
        }
      }
    }
    if (c.method === "delete" && !admin) {
      if (tableDelete.get(`${ROLE}|${table}`) !== true) problem(c.node, `${who()} can't delete from ${table}`);
      else if (!hasPolicy(table, "DELETE")) problem(c.node, `delete from ${table}: no row-level security rule lets ${who()} delete there`);
    }
    if (["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "containedBy", "not", "filter", "textSearch", "order"].includes(c.method)) {
      const refs = strings(c.args[0]);
      if (refs === UNKNOWN) {
        unresolved.push(`${where(c.node)}  ${c.method} column ${c.args[0]?.getText()}`);
        continue;
      }
      let t = table;
      let em = embeds;
      // .order("created_at", { referencedTable: "drops" }) / .limit(1, { referencedTable })
      const refTable = option(c.args[1], "referencedTable") ?? option(c.args[1], "foreignTable");
      if (refTable) {
        const alias = strings(refTable);
        const e = alias !== UNKNOWN ? embeds.get(alias[0]) : null;
        if (!e) problem(c.node, `${c.method}: referencedTable ${refTable.getText()} isn't embedded`);
        else {
          t = e.table;
          em = new Map();
        }
      }
      for (const ref of refs) checkColumnRef(ref, t, em, c.node, c.method, admin);
    }
    if (c.method === "or") {
      LENIENT = true;
      const conds = strings(c.args[0]);
      LENIENT = false;
      if (conds === UNKNOWN) {
        unresolved.push(`${where(c.node)}  or ${c.args[0]?.getText().slice(0, 60)}`);
        continue;
      }
      let t = table;
      let em = embeds;
      const refTable = option(c.args[1], "referencedTable") ?? option(c.args[1], "foreignTable");
      if (refTable) {
        const alias = strings(refTable);
        const e = alias !== UNKNOWN ? embeds.get(alias[0]) : null;
        if (!e) problem(c.node, `or: referencedTable ${refTable.getText()} isn't embedded`);
        else {
          t = e.table;
          em = new Map();
        }
      }
      for (const cond of conds) {
        for (const col of logicColumns(cond)) {
          if (col.includes(HOLE)) unresolved.push(`${where(c.node)}  or column in ${c.args[0]?.getText().slice(0, 60)}`);
          else checkColumnRef(col, t, em, c.node, "or", admin);
        }
      }
    }
  }
}

function checkFrom(node, admin) {
  const tables = strings(node.arguments[0]);
  if (tables === UNKNOWN) {
    unresolved.push(`${where(node)}  table ${node.arguments[0].getText()}`);
    return;
  }
  const chain = [...chainFrom(node), ...laterCalls(node)];
  for (const table of tables) checkChain(table, chain, node, admin);
}

// Runs a check with every condition both ways to find them, then (if there
// are any) again for each combination of answers, keeping only what those
// consistent runs find.
function consistently(run) {
  ASSUME = new Map();
  SEEN = new Set();
  const start = problems.length;
  run();
  const conds = [...SEEN];
  if (conds.length > 0 && conds.length <= 8) {
    const counts = { ...checked };
    problems.length = start;
    for (let mask = 0; mask < 1 << conds.length; mask++) {
      ASSUME = new Map(conds.map((cond, i) => [cond, ((mask >> i) & 1) === 1]));
      run();
    }
    Object.assign(checked, counts);
  }
  ASSUME = new Map();
  SEEN = new Set();
}

for (const sf of sources) {
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression.getText();
      const admin = /admin/i.test(receiver);
      if (method === "rpc" && !NOT_DB.test(receiver)) consistently(() => checkRpc(node, node.arguments[0], node.arguments[1], admin));
      if (method === "from" && !NOT_DB.test(receiver) && node.arguments[0]) consistently(() => checkFrom(node, admin));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Signed out: the open routes, and every function they call (followed through
// the code). getViewer() only reads anything once someone is signed in.
const OPEN_ROUTES = /^src\/app\/(embed|badge|try|go)\/|^src\/app\/api\/v1\//;
const SIGNED_IN_ONLY = new Set(["getViewer"]);
// A function that starts with "if (!viewer ...) return" does nothing signed out.
const needsViewer = (fn) => {
  const first = fn.body && ts.isBlock(fn.body) ? fn.body.statements[0] : null;
  return !!first && ts.isIfStatement(first) && /^!viewer\b/.test(first.expression.getText()) && ts.isReturnStatement(first.thenStatement);
};
const anonCalls = new Set();
const followed = new Set();
function collectAnon(scope) {
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      if (ts.isPropertyAccessExpression(n.expression)) {
        const method = n.expression.name.text;
        const receiver = n.expression.expression.getText();
        if ((method === "from" || method === "rpc") && !NOT_DB.test(receiver)) anonCalls.add(n);
      } else if (ts.isIdentifier(n.expression) && !SIGNED_IN_ONLY.has(n.expression.text)) {
        const fn = lookup(n.expression.text, n)?.node;
        const body = fn && unwrap(fn);
        const target = body && ts.isCallExpression(body) && body.arguments[0] && (ts.isArrowFunction(body.arguments[0]) || ts.isFunctionExpression(body.arguments[0])) ? body.arguments[0] : body; // cache(async () => ...)
        if (target && (ts.isArrowFunction(target) || ts.isFunctionDeclaration(target) || ts.isFunctionExpression(target)) && !followed.has(target) && !needsViewer(target)) {
          followed.add(target);
          collectAnon(target);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
}
for (const sf of sources) if (OPEN_ROUTES.test(relative(root, sf.fileName))) collectAnon(sf);
ROLE = "anon";
for (const node of anonCalls) {
  const receiver = node.expression.expression.getText();
  const admin = /admin/i.test(receiver);
  if (node.expression.name.text === "rpc") consistently(() => checkRpc(node, node.arguments[0], node.arguments[1], admin));
  else if (node.arguments[0]) consistently(() => checkFrom(node, admin));
}
ROLE = "authenticated";

console.log(`checked ${checked.selects} selects, ${checked.writes} writes, ${checked.filters} filters and ${checked.rpcs} function calls in ${files.length} files (${anonCalls.size} of them also signed out)`);
const unsure = [...new Set(unresolved)];
if (unsure.length) {
  console.log(`\n${unsure.length} expressions this couldn't work out (check by hand):`);
  for (const u of unsure) console.log(`  ${u}`);
}
const found = [...new Set(problems)];
if (found.length) {
  console.log(`\nFAIL ${found.length} problems:`);
  for (const p of found) console.log(`  ${p}`);
  process.exit(1);
}
console.log("\nall passed");
