/** Sector files the browser asks for. Search and routes stay live. The server keeps 50 sectors. */
export const SERVER_SECTOR_LIMIT = 50;

export interface CachedSectorStamp {
  name: string;
  cachedAt: number;
}

/** Remember `name` as just used. Drop the oldest other sectors past the limit. */
export function retainSectors(
  sectors: readonly CachedSectorStamp[],
  name: string,
  now: number,
  limit = SERVER_SECTOR_LIMIT,
): { sectors: CachedSectorStamp[]; evict: string[] } {
  const next = [...sectors.filter((row) => row.name !== name), { name, cachedAt: now }];
  const overflow = next.length - limit;
  if (overflow <= 0) return { sectors: next, evict: [] };
  const evict = next
    .filter((row) => row.name !== name)
    .sort((a, b) => a.cachedAt - b.cachedAt || a.name.localeCompare(b.name))
    .slice(0, overflow)
    .map((row) => row.name);
  const gone = new Set(evict);
  return { sectors: next.filter((row) => !gone.has(row.name)), evict };
}

/** The sector a cache key belongs to. Grid lookups are not sectors. */
export function sectorNameFromKey(key: string): string | null {
  const [kind, name] = key.split("/");
  if (kind !== "sector" || !name) return null;
  try {
    const decoded = decodeURIComponent(name);
    if (decoded === "" || decoded === "." || decoded === "..") return null;
    return decoded;
  } catch {
    return null;
  }
}

/** A sector tab or a four-digit metadata file. Other paths are not cached. */
const SECTOR_FILE = /^(tab|\d{4})$/;

/** Cache key for a sector file request. Search and routes return null. */
export function sectorCacheKey(url: URL): string | null {
  const parts: string[] = [];
  for (const part of url.pathname.split("/").filter(Boolean)) {
    const decoded = safeSegment(part);
    if (decoded === null) return null;
    parts.push(decoded);
  }
  if (parts[0] === "data" && parts.length === 3 && SECTOR_FILE.test(parts[2])) {
    return `sector/${encodeURIComponent(parts[1])}/${parts[2]}`;
  }
  if (parts[0] !== "api" || parts[1] !== "metadata" || parts.length !== 2) return null;
  const sector = url.searchParams.get("sector");
  if (sector !== null && url.searchParams.size === 1) return `sector/${encodeURIComponent(sector)}/metadata`;
  const sx = url.searchParams.get("sx");
  const sy = url.searchParams.get("sy");
  if (sx !== null && sy !== null && url.searchParams.size === 2 && /^-?\d+$/.test(sx) && /^-?\d+$/.test(sy)) {
    return `grid/${sx},${sy}`;
  }
  return null;
}

/** One URL path piece safe to use as a directory name. */
function safeSegment(part: string): string | null {
  try {
    const decoded = decodeURIComponent(part);
    if (decoded === "" || decoded === "." || decoded === "..") return null;
    return decoded;
  } catch {
    return null;
  }
}

/** The file a cache key is stored in. */
function cacheFile(root: URL, key: string): URL {
  const parts = key.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) throw new Error("Sector cache key is not a file path");
  return new URL(parts.map((part) => encodeURIComponent(part)).join("/") + ".json", root);
}

/** The stored body, or null when this key has not been saved. */
export async function readSectorCache(root: URL, key: string): Promise<string | null> {
  try {
    const body = await Deno.readTextFile(cacheFile(root, key));
    await rememberSector(root, key);
    return body;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}

/** Store a sector body and remember the sector in the index. */
export async function writeSectorCache(root: URL, key: string, body: string): Promise<void> {
  await rememberSector(root, key);
  const file = cacheFile(root, key);
  await Deno.mkdir(new URL(".", file), { recursive: true });
  const temp = await Deno.makeTempFile({ dir: await Deno.realPath(new URL(".", file)), prefix: ".sector-" });
  try {
    await Deno.writeTextFile(temp, body);
    await Deno.rename(temp, file);
  } catch (error) {
    await Deno.remove(temp).catch(() => {});
    throw error;
  }
}

/** Index updates run one at a time. */
let sectorIndexQueue: Promise<void> = Promise.resolve();

/** Schedule an index update for the sector this key belongs to. */
function rememberSector(root: URL, key: string): Promise<void> {
  const name = sectorNameFromKey(key);
  if (!name) return Promise.resolve();
  const run = sectorIndexQueue.then(() => noteSector(root, name), () => noteSector(root, name));
  sectorIndexQueue = run.then(() => undefined, () => undefined);
  return run;
}

/** Move this sector to the front of the index and drop sectors past the limit. */
async function noteSector(root: URL, name: string): Promise<void> {
  const sectors = await loadSectorIndex(root);
  const decision = retainSectors(sectors, name, Date.now());
  await writeSectorIndex(root, decision.sectors);
  await Promise.all(decision.evict.map((sector) => Deno.remove(sectorDirectory(root, sector), { recursive: true }).catch(() => undefined)));
}

/** The index file, or a scan of the cache directory when the file is missing. */
async function loadSectorIndex(root: URL): Promise<CachedSectorStamp[]> {
  try {
    const parsed = JSON.parse(await Deno.readTextFile(new URL("index.json", root))) as { sectors?: unknown };
    if (!Array.isArray(parsed.sectors)) return await scanSectorDirectories(root);
    const sectors: CachedSectorStamp[] = [];
    for (const row of parsed.sectors) {
      if (!row || typeof row !== "object") continue;
      const name = (row as { name?: unknown }).name;
      const cachedAt = (row as { cachedAt?: unknown }).cachedAt;
      if (typeof name !== "string" || name === "" || typeof cachedAt !== "number") continue;
      sectors.push({ name, cachedAt });
    }
    return sectors;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound || error instanceof SyntaxError) return await scanSectorDirectories(root);
    throw error;
  }
}

/** Sectors inferred from the cache directory. */
async function scanSectorDirectories(root: URL): Promise<CachedSectorStamp[]> {
  const dir = new URL("sector/", root);
  const sectors: CachedSectorStamp[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isDirectory) continue;
      let name = entry.name;
      try {
        name = decodeURIComponent(entry.name);
      } catch {
        // The directory name is already the sector name.
      }
      const info = await Deno.stat(new URL(`${encodeURIComponent(entry.name)}/`, dir));
      sectors.push({ name, cachedAt: info.mtime?.getTime() ?? 0 });
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }
  return sectors;
}

/** Replace the index file. */
async function writeSectorIndex(root: URL, sectors: readonly CachedSectorStamp[]): Promise<void> {
  await Deno.mkdir(root, { recursive: true });
  const file = new URL("index.json", root);
  const temp = await Deno.makeTempFile({ dir: await Deno.realPath(root), prefix: ".sector-index-" });
  try {
    await Deno.writeTextFile(temp, JSON.stringify({ limit: SERVER_SECTOR_LIMIT, sectors }));
    await Deno.rename(temp, file);
  } catch (error) {
    await Deno.remove(temp).catch(() => {});
    throw error;
  }
}

/** Directory for one sector's cached files. */
function sectorDirectory(root: URL, name: string): URL {
  return new URL(".", cacheFile(root, `sector/${encodeURIComponent(name)}/tab`));
}
