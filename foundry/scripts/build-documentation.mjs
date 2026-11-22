/**
 * Write the Documentation journal pack.
 * Foundry reads packs/documentation as a LevelDB compendium.
 *
 *   deno task build
 *   node scripts/build-documentation.mjs
 *
 * classic-level is taken from FOUNDRY_VTT, or from a sibling Foundry install.
 */
import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = path.dirname(new URL(import.meta.url).pathname);
const foundryDir = path.resolve(here, "..");
const packDir = path.join(foundryDir, "packs", "documentation");
const journalId = "taDocJournal0001";
const writtenAt = Date.UTC(2026, 10, 21);

const pages = [
  { id: "taDocPageIntro01", name: "Introduction", file: "introduction.html", sort: 0 },
  { id: "taDocPageConfig1", name: "Configuration", file: "configuration.html", sort: 100000 },
  { id: "taDocPageChat001", name: "Chat Commands", file: "chat-commands.html", sort: 200000 },
];

const { ClassicLevel } = await import(pathToFileURL(resolveClassicLevel()).href);

const stats = {
  coreVersion: "14.370",
  systemId: null,
  systemVersion: null,
  createdTime: writtenAt,
  modifiedTime: writtenAt,
  lastModifiedBy: null,
  compendiumSource: null,
  duplicateSource: null,
};

await rm(packDir, { recursive: true, force: true });
const db = new ClassicLevel(packDir, { keyEncoding: "utf8", valueEncoding: "json" });
await db.open();
await db.put(`!journal!${journalId}`, {
  name: "Traveller Astrogation",
  _id: journalId,
  folder: null,
  pages: pages.map((page) => page.id),
  sort: 100000,
  ownership: { default: 2 },
  flags: {},
  _stats: stats,
});
for (const page of pages) {
  const content = await readFile(path.join(foundryDir, "docs", page.file), "utf8");
  await db.put(`!journal.pages!${journalId}.${page.id}`, {
    name: page.name,
    type: "text",
    _id: page.id,
    sort: page.sort,
    title: { show: true, level: 1 },
    image: {},
    text: { format: 1, content: content.trim() },
    ownership: { default: -1 },
    flags: {},
    _stats: stats,
  });
}
await db.close();
console.log(`Wrote ${pages.length} pages to ${packDir}`);

/** The classic-level entry that can write a Foundry compendium. */
function resolveClassicLevel() {
  const candidates = [
    process.env.FOUNDRY_VTT,
    path.resolve(foundryDir, "../../../foundry/foundryvtt"),
  ].filter(Boolean);
  for (const root of candidates) {
    const entry = path.join(root, "node_modules", "classic-level", "index.js");
    if (existsSync(entry)) return entry;
  }
  throw new Error("Set FOUNDRY_VTT to a Foundry install so classic-level can build the pack.");
}
