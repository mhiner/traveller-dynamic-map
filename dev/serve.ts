import { travellerMapProxy } from "../src/proxy/handler.ts";

/** Port for the preview. PORT overrides 8788. */
const port = Number(Deno.env.get("PORT") ?? 8788);
/** Bind address. HOST overrides the loopback. */
const hostname = Deno.env.get("HOST")?.trim() || "127.0.0.1";
/** This dev directory. */
const devDir = new URL("./", import.meta.url);
/** The browser bundle the preview serves. */
const bundlePath = new URL("./.bundle/app.js", devDir);
/** Pages waiting for a bundle rebuild. */
const listeners = new Set<(stamp: string) => void>();
/** Traveller Map proxy, with its cache beside this directory. */
const proxy = travellerMapProxy({
  cacheRoot: new URL("./.sector-cache/", devDir),
});

await Deno.mkdir(new URL("./.bundle/", devDir), { recursive: true });
try {
  await Deno.remove(bundlePath);
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
}

// The bundle compiles map JSX through the local forwarder. This
// client then supplies its own Preact when it creates the map.
const bundler = new Deno.Command(Deno.execPath(), {
  args: [
    "bundle",
    "--watch",
    "--config",
    new URL("./bundle.json", devDir).pathname,
    "--platform",
    "browser",
    "--sourcemap=inline",
    "--output",
    bundlePath.pathname,
    new URL("./client.tsx", devDir).pathname,
  ],
  cwd: new URL("../", devDir).pathname,
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

/** Stop the watch bundler. An already-exited bundler is ignored. */
function stopBundler() {
  try {
    bundler.kill("SIGTERM");
  } catch {
    // The bundler has already exited.
  }
}

/** Stop the bundler and leave. */
function stopAndExit() {
  stopBundler();
  Deno.exit(0);
}

Deno.addSignalListener("SIGINT", stopAndExit);
try {
  Deno.addSignalListener("SIGTERM", stopAndExit);
} catch {
  // Windows does not deliver SIGTERM. Docker sends it on stop.
}

/** Resolves when the watch bundler leaves. */
const bundlerExited = bundler.status;
await waitForBundle(bundlePath, bundlerExited);

/** Stamp of the bundle the pages were last told about. */
let published = await stampOf(bundlePath);
void watchBundle();

/** The preview document. */
const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Astrogation</title>
  <link rel="stylesheet" href="/host.css">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="shell">
    <header class="dev-bar">
      <h1>Astrogation</h1>
      <label class="jump">
        Jump
        <select id="jump" aria-label="Jump rating">
          <option>1</option>
          <option selected>2</option>
          <option>3</option>
          <option>4</option>
          <option>5</option>
          <option>6</option>
        </select>
      </label>
      <label class="zoom">
        Min zoom
        <input id="zoom-min" type="number" inputmode="decimal" step="any" value="0.5" aria-label="Minimum zoom">
      </label>
      <label class="zoom">
        Max zoom
        <input id="zoom-max" type="number" inputmode="decimal" step="any" value="3" aria-label="Maximum zoom">
      </label>
      <p id="dev-status" class="meta">Standalone dev instance. Cached sectors stay in this browser.</p>
    </header>
    <div id="map" class="ship-body"></div>
  </div>
  <script type="module" src="/app.js"></script>
  <script>
    const source = new EventSource("/dev/reload");
    source.onmessage = () => location.reload();
  </script>
</body>
</html>
`;

console.log(`Astrogation dev instance at http://${hostname}:${port}`);

Deno.serve({ port, hostname }, (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/") return html(page);
  if (url.pathname === "/host.css") {
    return file(new URL("./host.css", devDir), "text/css");
  }
  if (url.pathname === "/styles.css") {
    return file(new URL("../styles.css", devDir), "text/css");
  }
  if (url.pathname === "/app.js") return file(bundlePath, "text/javascript");
  if (url.pathname === "/dev/reload") return reloadStream();
  if (url.pathname === "/travellermap" || url.pathname.startsWith("/travellermap/")) {
    return proxy(request);
  }
  return new Response("Not found", { status: 404 });
});

/** An HTML response that is not cached. */
function html(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** A file response, or 503 while the bundle is still being written. */
async function file(path: URL, type: string): Promise<Response> {
  try {
    const bytes = await Deno.readFile(path);
    return new Response(bytes, {
      headers: {
        "content-type": `${type}; charset=utf-8`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Not ready", { status: 503 });
  }
}

/** A server-sent stream of bundle stamps. */
function reloadStream(): Response {
  let send: (stamp: string) => void = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      send = (stamp) =>
        controller.enqueue(encoder.encode(`data: ${stamp}\n\n`));
      listeners.add(send);
    },
    cancel() {
      listeners.delete(send);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
    },
  });
}

/** Tell open pages when the bundle file changes. */
async function watchBundle() {
  while (true) {
    const next = await stampOf(bundlePath);
    if (next && next !== published) {
      published = next;
      for (const send of listeners) send(next);
    }
    await delay(200);
  }
}

/** Wait until the bundler has written a non-empty file. */
async function waitForBundle(path: URL, exited: Promise<Deno.CommandStatus>) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    if (await stampOf(path)) return;
    const status = await Promise.race([exited, delay(100).then(() => null)]);
    if (status) {
      throw new Error(
        `Bundler exited with code ${status.code} before writing the client.`,
      );
    }
  }
  throw new Error("Timed out waiting for the browser bundle.");
}

/** Modification time and size of a file, or null when it is missing or empty. */
async function stampOf(path: URL): Promise<string | null> {
  try {
    const info = await Deno.stat(path);
    if (!info.isFile || info.size === 0) return null;
    return `${info.mtime?.getTime() ?? 0}:${info.size}`;
  } catch {
    return null;
  }
}

/** A pause. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
