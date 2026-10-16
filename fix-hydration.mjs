// One-off: add suppressHydrationWarning to every <form>, <input>, <textarea> and <select>
// in app/ and components/, skipping tags that already have it. Run: node fix-hydration.mjs
import fs from "node:fs";
import path from "node:path";

const roots = ["app", "components"];
let files = 0,
  added = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) fix(p);
  }
}

function fix(file) {
  const src = fs.readFileSync(file, "utf8");
  // the tag name, then a space, newline or ">" (so <Input>, <inputMode> etc. are not touched)
  const out = src.replace(
    /<(form|input|textarea|select)(?=[\s>/])/g,
    (match, tag, offset) => {
      // look at the rest of this opening tag; skip if it already has the attribute
      const rest = src.slice(offset, src.indexOf(">", offset) + 1);
      if (rest.includes("suppressHydrationWarning")) return match;
      added++;
      return `<${tag} suppressHydrationWarning`;
    },
  );
  if (out !== src) {
    fs.writeFileSync(file, out);
    files++;
  }
}

for (const r of roots) if (fs.existsSync(r)) walk(r);
console.log(
  `Added suppressHydrationWarning to ${added} tags in ${files} files.`,
);
