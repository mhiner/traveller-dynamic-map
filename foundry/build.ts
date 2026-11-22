/** The package root. */
const root = new URL("../", import.meta.url);
/** The foundry directory. */
const here = new URL("./", import.meta.url);
/** The map stylesheet. The build wraps it so it applies on the board and in the dock. */
const styles = await Deno.readTextFile(new URL("styles.css", root));

await Deno.mkdir(new URL("styles/", here), { recursive: true });
await Deno.mkdir(new URL("dist/", here), { recursive: true });
await Deno.writeTextFile(
  new URL("styles/map.css", here),
  `.traveller-astrogation,\n.traveller-astrogation-dock {\n${styles}}\n`,
);

/** Rewrites the Documentation compendium from foundry/docs. */
const documentation = new Deno.Command("node", {
  args: [new URL("scripts/build-documentation.mjs", here).pathname],
  cwd: here.pathname,
  stdout: "inherit",
  stderr: "inherit",
});

/** The compendium result. A failed rewrite stops the build. */
const documentationStatus = await documentation.output();
if (!documentationStatus.success) Deno.exit(documentationStatus.code);

/** Bundler command that writes the Foundry module script. */
const bundle = new Deno.Command(Deno.execPath(), {
  args: [
    "bundle",
    "--config",
    new URL("deno.json", here).pathname,
    "--minify",
    "--platform",
    "browser",
    "--output",
    new URL("dist/module.js", here).pathname,
    new URL("src/module.tsx", here).pathname,
  ],
  cwd: root.pathname,
  stdout: "inherit",
  stderr: "inherit",
});

/** The bundler result. A failed bundle stops the build. */
const status = await bundle.output();
if (!status.success) Deno.exit(status.code);
