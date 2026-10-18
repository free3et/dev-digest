import type { SkillCase } from "../../src/index.js";

// Quality cases (no tools): the code under review is inline. The skill's core philosophy is
// confidence-based review: trace the data flow, report only attacker-controlled input, and do NOT
// flag server-controlled values or framework-mitigated patterns — so the set includes a
// vulnerable case AND a clean case that must stay quiet.

const VULNERABLE = `// routes/posts.ts (Express + MongoDB + JWT)
router.get("/proxy", async (req, res) => {
  const r = await fetch(req.query.url);              // (1)
  res.send(await r.text());
});

router.put("/posts/:id", auth, async (req, res) => {
  const post = await Post.findByIdAndUpdate(req.params.id, { ...req.body }, { new: true }); // (2)
  res.json(post);
});

const payload = jwt.decode(req.headers.authorization.split(" ")[1]);  // (3)`;

const SAFE = `// config.ts
const API_URL = process.env.API_URL;                 // server-controlled
export async function health() {
  const r = await fetch(API_URL);                    // value is not attacker-controlled
  return r.ok;
}
// Profile.tsx
export const Profile = ({ name }) => <h1>{name}</h1>; // React JSX escapes by default`;

export const cases: SkillCase[] = [
  {
    name: "reports attacker-controlled SSRF, mass assignment and jwt.decode with file-level specifics",
    kind: "quality",
    prompt: `Security-review this code. Report real vulnerabilities only.\n\n${VULNERABLE}`,
    practices: [
      "the answer flags fetch(req.query.url) as server-side request forgery (SSRF) because the URL is attacker-controlled",
      "the answer flags spreading req.body into findByIdAndUpdate as mass assignment (an integrity failure) and recommends allow-listing fields",
      "the answer flags the missing ownership check on PUT /posts/:id (any authenticated user can edit any post / IDOR)",
      "the answer flags jwt.decode() used instead of jwt.verify() as an authentication failure",
      "each reported issue names the vulnerable line or expression and gives a concrete fix, not generic advice",
    ],
    threshold: 0.7,
    maxTurns: 8,
  },
  {
    name: "stays quiet on server-controlled values and framework-mitigated patterns",
    kind: "quality",
    prompt: `Security-review this code. Report real vulnerabilities only; say so if there are none.\n\n${SAFE}`,
    practices: [
      "the answer does not report fetch(API_URL) as SSRF, because API_URL comes from an environment variable and is not attacker-controlled",
      "the answer does not report an XSS issue for the JSX {name} expression, because React escapes it by default",
      "the answer states that no confirmed high-confidence vulnerabilities were found (or equivalent) rather than inventing findings",
    ],
    threshold: 0.6,
    maxTurns: 6,
  },
];
