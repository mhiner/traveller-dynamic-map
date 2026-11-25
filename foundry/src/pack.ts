import { MODULE_ID } from "./constants.ts";
import "./types.ts";

/** Compendium sidebar folder for this module's packs. */
export const COMPENDIUM_FOLDER = "Koko's Traveller Astrogation";

/** Folder name from before the module title gained the Koko prefix. */
const PREVIOUS_COMPENDIUM_FOLDER = "Traveller Astrogation";

/** Ownership applied to a compendium this module creates. Players can read it. The GM owns it. */
const READERS = { GAMEMASTER: "OWNER", ASSISTANT: "OWNER", TRUSTED: "OBSERVER", PLAYER: "OBSERVER" };

/** Turn a compendium index into a list. Foundry returns either a collection or an iterable. */
export function indexEntries(index: { contents?: FoundryIndexEntry[] } | Iterable<FoundryIndexEntry>): FoundryIndexEntry[] {
  if (index && typeof index === "object" && "contents" in index && Array.isArray(index.contents)) return index.contents;
  if (typeof index !== "object" || index === null || !(Symbol.iterator in index)) return [];
  return [...index];
}

/** The compendium whose label matches. Worlds matching ignores case. Sector Data does not. */
export function findPack(label: string, options?: { ignoreCase?: boolean }): FoundryPack | null {
  const wanted = options?.ignoreCase ? label.trim().toLowerCase() : label;
  return game.packs?.contents?.find((pack) => {
    const current = pack.metadata.label;
    return options?.ignoreCase ? current.trim().toLowerCase() === wanted : current === label;
  }) ?? null;
}

/** The named compendium, created when it is missing. Players can read it. */
export async function ensurePack(label: string, type: string, options?: { ignoreCase?: boolean }): Promise<FoundryPack | null> {
  const existing = findPack(label, options);
  if (existing) {
    await fileAstrogationPacks();
    return existing;
  }
  const created = await CompendiumCollection.createCompendium({ label, type });
  const pack = created ?? findPack(label, options);
  if (!pack) return null;
  try {
    await pack.configure({ ownership: READERS });
  } catch {
    // The pack still works for the GM when ownership cannot be set.
  }
  await fileAstrogationPacks();
  return pack;
}

/** Move Documentation, Sector Data, and worlds into the module folder. A player cannot do this. */
export async function fileAstrogationPacks(): Promise<void> {
  if (!game.user?.isGM) return;
  const folder = await astrogationFolder();
  if (!folder) return;
  const packs = [
    game.packs?.contents?.find((pack) => pack.collection === `${MODULE_ID}.documentation`),
    findPack("Sector Data"),
    findPack("worlds", { ignoreCase: true }),
  ];
  for (const pack of packs) {
    if (pack) await filePack(pack, folder);
  }
}

/** The sidebar folder, created when this world does not have one yet. An older folder is renamed in place. */
async function astrogationFolder(): Promise<FoundryFolder | null> {
  const existing = compendiumFolder(COMPENDIUM_FOLDER);
  if (existing) return existing;
  const previous = compendiumFolder(PREVIOUS_COMPENDIUM_FOLDER);
  if (previous?.update) {
    try {
      await previous.update({ name: COMPENDIUM_FOLDER });
      return previous;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not rename the ${PREVIOUS_COMPENDIUM_FOLDER} compendium folder.`, error);
    }
  }
  try {
    const created = await Folder.create({ name: COMPENDIUM_FOLDER, type: "Compendium", sorting: "a" });
    const folder = Array.isArray(created) ? created[0] : created;
    return folder ?? null;
  } catch (error) {
    console.error(`${MODULE_ID} | Could not create the ${COMPENDIUM_FOLDER} compendium folder.`, error);
    return null;
  }
}

/** Put one pack in the folder. A pack already there is left alone. */
async function filePack(pack: FoundryPack, folder: FoundryFolder): Promise<void> {
  if (pack.folder?.id === folder.id || !pack.setFolder) return;
  try {
    await pack.setFolder(folder);
  } catch (error) {
    console.error(`${MODULE_ID} | Could not move ${pack.metadata.label} into ${COMPENDIUM_FOLDER}.`, error);
  }
}

/** A top-level compendium folder with this name. */
function compendiumFolder(name: string): FoundryFolder | undefined {
  return (game.folders?.contents ?? []).find((folder) =>
    folder.type === "Compendium" && folder.name === name && !folderParent(folder)
  );
}

/** The parent id of a folder, or nothing when the folder is at the top. */
function folderParent(folder: FoundryFolder): string | null {
  const parent = folder.folder;
  if (!parent) return null;
  return typeof parent === "string" ? parent : parent.id ?? null;
}

/** Index rows, with the requested fields when Foundry accepts them. */
export async function readPackIndex(pack: FoundryPack, fields?: readonly string[]): Promise<FoundryIndexEntry[]> {
  try {
    return indexEntries(await pack.getIndex(fields ? { fields: [...fields] } : undefined));
  } catch {
    return indexEntries(await pack.getIndex());
  }
}

/** Every document in the pack. Import uses this. The map opens one document at a time. */
export async function documentsIn(pack: FoundryPack): Promise<FoundryDocument[]> {
  const entries = await readPackIndex(pack);
  const documents: FoundryDocument[] = [];
  for (const entry of entries) documents.push(await pack.getDocument(entry._id));
  return documents;
}
