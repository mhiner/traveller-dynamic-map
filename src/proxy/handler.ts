import { readSectorCache, sectorCacheKey, writeSectorCache } from "./cache.ts";

export interface TravellerMapProxyOptions {
  /**
   * Directory for cached sector files.
   * `SECTOR_CACHE_DIR` overrides this. When neither is set, the cache is
   * `.sector-cache` in the process working directory.
   */
  cacheRoot?: URL;
  /** Request path prefix that is forwarded to Traveller Map. */
  mountPath?: string;
  /** Sent as the User-Agent on the upstream request. */
  userAgent?: string;
  /** Upstream origin. */
  origin?: string;
}

interface StoredBody {
  status: number;
  body: string;
}

/** Forward `/travellermap/...` to travellermap.com, caching sector files on disk. */
export function travellerMapProxy(options: TravellerMapProxyOptions = {}): (request: Request) => Promise<Response> {
  const cacheRoot = resolveCacheRoot(options.cacheRoot);
  const mountPath = options.mountPath ?? "/travellermap";
  const userAgent = options.userAgent ?? "traveller-dynamic-map";
  const origin = (options.origin ?? "https://travellermap.com").replace(/\/$/, "");
  const pending = new Map<string, Promise<StoredBody>>();

  return async function handle(request: Request): Promise<Response> {
    const incoming = new URL(request.url);
    const suffix = stripMount(incoming.pathname, mountPath);
    const url = new URL(`${origin}/${suffix}`);
    url.search = incoming.search;
    if (url.pathname === "/api/jumpmap") return new Response(null, { status: 404 });
    return await sectorResponse(url, cacheRoot, pending, userAgent);
  };
}

/** SECTOR_CACHE_DIR, when the process is allowed to read the environment. */
function configuredCacheDir(): string | undefined {
  try {
    return Deno.env.get("SECTOR_CACHE_DIR")?.trim() || undefined;
  } catch (error) {
    if (error instanceof Deno.errors.NotCapable) return undefined;
    throw error;
  }
}

/** Where sector files are stored. The environment wins, then the option, then the working directory. */
function resolveCacheRoot(given: URL | undefined): URL {
  const configured = configuredCacheDir();
  if (configured) {
    const path = configured.endsWith("/") ? configured : `${configured}/`;
    return new URL(path, "file://");
  }
  if (given) return given;
  const cwd = Deno.cwd().endsWith("/") ? Deno.cwd() : `${Deno.cwd()}/`;
  return new URL(".sector-cache/", `file://${cwd}`);
}

/** The path after the proxy prefix. */
function stripMount(pathname: string, mountPath: string): string {
  const prefix = mountPath.endsWith("/") ? mountPath.slice(0, -1) : mountPath;
  if (pathname === prefix) return "";
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length + 1);
  return pathname.replace(/^\//, "");
}

/** A cached sector file, or one shared fetch when several requests ask at once. */
async function sectorResponse(
  url: URL,
  cacheRoot: URL,
  pending: Map<string, Promise<StoredBody>>,
  userAgent: string,
): Promise<Response> {
  const key = sectorCacheKey(url);
  if (!key) return await fetchTravellerMap(url, userAgent);
  const stored = await readSectorCache(cacheRoot, key);
  if (stored !== null) return jsonBody(stored);
  const current = pending.get(key);
  if (current) {
    const shared = await current;
    return jsonBody(shared.body, shared.status);
  }
  const fetching = fetchAndStore(url, cacheRoot, key, userAgent);
  pending.set(key, fetching);
  try {
    const result = await fetching;
    return jsonBody(result.body, result.status);
  } finally {
    pending.delete(key);
  }
}

/** Fetch a sector file and store a successful body. */
async function fetchAndStore(url: URL, cacheRoot: URL, key: string, userAgent: string): Promise<StoredBody> {
  const response = await fetchTravellerMap(url, userAgent);
  const body = await response.text();
  if (response.status === 200 && body) await writeSectorCache(cacheRoot, key, body);
  return { status: response.status, body };
}

/** A JSON response with the status Traveller Map returned. */
function jsonBody(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

/** GET the upstream URL. Curl follows redirects and sends the module's user agent. */
async function fetchTravellerMap(url: URL, userAgent: string): Promise<Response> {
  const command = new Deno.Command("curl", {
    args: [
      "--silent",
      "--show-error",
      "--location",
      "--max-time",
      "20",
      "--header",
      "Accept: application/json",
      "--header",
      `User-Agent: ${userAgent}`,
      "--write-out",
      "\n__STATUS__%{http_code}",
      url.href,
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  const stdout = new TextDecoder().decode(output.stdout);
  const marker = "\n__STATUS__";
  const splitAt = stdout.lastIndexOf(marker);
  if (!output.success || splitAt === -1) {
    const stderr = new TextDecoder().decode(output.stderr).trim();
    return Response.json({ error: stderr || "Traveller Map request failed" }, { status: 502 });
  }
  return new Response(stdout.slice(0, splitAt), {
    status: Number(stdout.slice(splitAt + marker.length).trim()) || 502,
    headers: { "content-type": "application/json" },
  });
}
