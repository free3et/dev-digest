import type { SkillCase } from "../../src/index.js";

// Quality cases run with no tools (skillTask injects SKILL.md as the system prompt), so each
// prompt carries the code under review inline. Practices are binary and citable, taken from the
// skill's own rule names (parse-use-safeparse, type-use-z-infer, schema-use-unknown-not-any,
// schema-coercion-for-form-data, object-strict-vs-strip, error-use-flatten, ...).

const ROUTE = `// server/src/routes/users.ts
import { z } from "zod";

const CreateUser = z.object({
  email: z.string(),
  age: z.any(),
  role: z.string(),
});

type CreateUserInput = { email: string; age: any; role: string };

export async function createUser(req, reply) {
  const input = CreateUser.parse(req.body);          // req.body is user input
  const page = Number(req.query.page);               // query strings arrive as strings
  const saved = JSON.parse(req.headers["x-meta"]);   // trusted as-is
  return reply.send({ input, page, saved });
}`;

export const cases: SkillCase[] = [
  {
    name: "reviews a route handler and flags parse vs safeParse, any, and a hand-written type",
    kind: "quality",
    prompt: `Review this Zod usage in a Fastify route and list what should change, most important first.\n\n${ROUTE}`,
    practices: [
      "the answer says user input (req.body) should be validated with safeParse() (or the framework's validation) instead of parse(), because parse() throws on bad input",
      "the answer says z.any() should be replaced with z.unknown() or a concrete schema for the age field",
      "the answer says the hand-written CreateUserInput type should be replaced with z.infer<typeof CreateUser> so the type cannot drift from the schema",
      "the answer says the JSON.parse(req.headers[...]) output must not be trusted and should be validated against a schema",
      "the answer proposes validations on the string fields (for example email() and an enum for role) rather than leaving them as bare z.string()",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    name: "recommends coercion for query/form strings and a strict object for unknown keys",
    kind: "quality",
    prompt: `Our search endpoint reads ?page=2&limit=20 from the query string and a PATCH body that must reject unknown fields (mass-assignment worry). Show the Zod schemas.\n\nCurrent code:\n  const Query = z.object({ page: z.number(), limit: z.number() });\n  const Patch = z.object({ name: z.string().optional() });`,
    grounding: ["coerce"],
    practices: [
      "the answer uses z.coerce.number() (or an equivalent preprocess/coercion) for page and limit because query-string values arrive as strings",
      "the answer makes the PATCH schema reject unknown keys with .strict() (or explains strict vs strip) instead of silently stripping them",
      "the answer keeps name optional for the partial update and does not make every field required",
    ],
    threshold: 0.6,
    maxTurns: 8,
  },
  {
    name: "does not over-apply: a plain internal helper needs no schema",
    kind: "quality",
    prompt: `Is Zod needed here? Answer briefly.\n\n  // utils/math.ts - internal, only called by our own code with numbers\n  export function clamp(n: number, min: number, max: number) { return Math.min(Math.max(n, min), max); }`,
    practices: [
      "the answer says a Zod schema is not needed for this internal, already-typed helper (validation belongs at system boundaries)",
      "the answer does not add a z.object schema or parse call around clamp()",
    ],
    threshold: 0.6,
    maxTurns: 4,
  },
];
