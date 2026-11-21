import { readFileSync, readdirSync } from "node:fs";

const errors = [];

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

function sorted(values) {
  return [...values].sort().join(", ");
}

const groups = readJson("groups.json");
const base = readJson("base.json");
for (const file of ["connection/communication.json", "connection/parameters.json"]) {
  readJson(file);
}

const directories = readdirSync("modules", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
for (const name of directories) {
  for (const section of ["communication", "expect", "interface"]) {
    readJson(`modules/${name}/${section}.json`);
  }
}

if (groups) {
  const grouped = groups.flatMap((group) => group.modules);
  if (sorted(grouped) !== sorted(directories)) {
    errors.push(`modules/ has [${sorted(directories)}] but groups.json has [${sorted(grouped)}]`);
  }
}

if (base) {
  if (base.baseUrl !== "https://api.magichour.ai/v1") {
    errors.push("base.json: baseUrl must stay https://api.magichour.ai/v1");
  }
  if (!base.log?.sanitize?.includes("request.headers.authorization")) {
    errors.push("base.json: log.sanitize must redact request.headers.authorization");
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`OK: ${directories.length} modules`);
