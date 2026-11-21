import { readFileSync } from "node:fs";

const dryRun = process.argv.includes("--dry-run");

const env = {};
const missing = [];
for (const key of ["MAKE_API_KEY", "MAKE_ZONE", "MAKE_APP_NAME", "MAKE_APP_VERSION"]) {
  env[key] = process.env[key] || (dryRun ? `<${key}>` : "");
  if (!env[key]) missing.push(key);
}
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const app = JSON.parse(readFileSync("app.json", "utf8"));
const root = `https://${env.MAKE_ZONE}/api/v2/sdk/apps`;
const appPath = `${root}/${env.MAKE_APP_NAME}`;
const versionPath = `${appPath}/${env.MAKE_APP_VERSION}`;

async function request(method, url, { json, file } = {}) {
  console.log(`${method} ${url}${file ? `  <- ${file}` : ""}`);
  if (dryRun) return {};
  const headers = { Authorization: `Token ${env.MAKE_API_KEY}` };
  let body;
  if (file) {
    headers["Content-Type"] = "application/jsonc";
    body = readFileSync(file, "utf8");
  } else if (json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${url} failed with ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

// A dry run calls nothing, so it plans for an app with no connection or modules yet.
const connections = (await request("GET", `${appPath}/connections`)).appConnections ?? [];
let connection = connections.find((item) => item.label === app.connection.label);
if (!connection) {
  const created = await request("POST", `${appPath}/connections`, { json: app.connection });
  connection = created.appConnection ?? { name: "<connection>" };
}
const connectionUrl = `${root}/connections/${connection.name}`;

await request("POST", `${versionPath}/base`, { file: "base.json" });
await request("PUT", `${connectionUrl}/api`, { file: "connection/communication.json" });
await request("PUT", `${connectionUrl}/parameters`, { file: "connection/parameters.json" });

const existing = (await request("GET", `${versionPath}/modules`)).appModules ?? [];
for (const [name, module] of Object.entries(app.modules)) {
  const { label, description, typeId, crud } = module;
  const moduleUrl = `${versionPath}/modules/${name}`;
  if (existing.some((item) => item.name === name)) {
    await request("PATCH", moduleUrl, {
      json: { label, description, connection: connection.name },
    });
  } else {
    await request("POST", `${versionPath}/modules`, {
      json: {
        name,
        typeId,
        label,
        description,
        moduleInitMode: "blank",
        connection: connection.name,
        crud,
      },
    });
  }
  await request("PUT", `${moduleUrl}/api`, { file: `modules/${name}/communication.json` });
  await request("PUT", `${moduleUrl}/expect`, { file: `modules/${name}/expect.json` });
  await request("PUT", `${moduleUrl}/interface`, { file: `modules/${name}/interface.json` });
  await request("POST", `${moduleUrl}/public`);
}

await request("PUT", `${versionPath}/groups`, { file: "groups.json" });
console.log(dryRun ? "Dry run complete." : "Deploy complete.");
