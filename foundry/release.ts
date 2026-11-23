/** The foundry directory. */
const here = new URL("./", import.meta.url);
/** module.json for the module Foundry loads. */
const manifestUrl = new URL("module.json", here);

const version = Deno.args[0]?.trim() ?? "";
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Pass a version, for example 0.1.1");
  Deno.exit(1);
}

const manifest = JSON.parse(await Deno.readTextFile(manifestUrl)) as { id?: string };
const moduleId = manifest.id;
if (!moduleId) {
  console.error("module.json has no id.");
  Deno.exit(1);
}

/** Write the release version without rearranging the rest of the manifest. */
const manifestText = await Deno.readTextFile(manifestUrl);
const updated = manifestText.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`);
if (updated === manifestText && !manifestText.includes(`"version": "${version}"`)) {
  console.error("module.json has no version field.");
  Deno.exit(1);
}
await Deno.writeTextFile(manifestUrl, updated);

/** The module build. It writes dist/module.js, styles/map.css, and the Documentation pack. */
const build = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", new URL("build.ts", here).pathname],
  cwd: here.pathname,
  stdout: "inherit",
  stderr: "inherit",
});
const buildStatus = await build.output();
if (!buildStatus.success) Deno.exit(buildStatus.code);

const staging = await Deno.makeTempDir({ prefix: "traveller-astrogation-" });
const moduleDir = `${staging}/${moduleId}`;
await Deno.mkdir(`${moduleDir}/dist`, { recursive: true });
await Deno.mkdir(`${moduleDir}/lang`, { recursive: true });
await Deno.mkdir(`${moduleDir}/styles`, { recursive: true });
await Deno.mkdir(`${moduleDir}/packs/documentation`, { recursive: true });

await copyFile(new URL("module.json", here), `${moduleDir}/module.json`);
await copyFile(new URL("dist/module.js", here), `${moduleDir}/dist/module.js`);
await copyFile(new URL("lang/en.json", here), `${moduleDir}/lang/en.json`);
await copyFile(new URL("styles/host.css", here), `${moduleDir}/styles/host.css`);
await copyFile(new URL("styles/map.css", here), `${moduleDir}/styles/map.css`);
await copyFile(new URL("styles/dock.css", here), `${moduleDir}/styles/dock.css`);

for await (const entry of Deno.readDir(new URL("packs/documentation", here))) {
  if (!entry.isFile || entry.name === "LOCK") continue;
  await copyFile(new URL(`packs/documentation/${entry.name}`, here), `${moduleDir}/packs/documentation/${entry.name}`);
}

const zipUrl = new URL(`${moduleId}-${version}.zip`, here);
await Deno.remove(zipUrl).catch(() => {});
const zip = new Deno.Command("zip", {
  args: ["-r", "-X", zipUrl.pathname, moduleId],
  cwd: staging,
  stdout: "inherit",
  stderr: "inherit",
});
const zipStatus = await zip.output();
await Deno.remove(staging, { recursive: true });
if (!zipStatus.success) Deno.exit(zipStatus.code);
console.log(`Wrote ${zipUrl.pathname}`);

/** Copy one built file into the staging module. */
async function copyFile(from: URL, to: string): Promise<void> {
  await Deno.writeFile(to, await Deno.readFile(from));
}
