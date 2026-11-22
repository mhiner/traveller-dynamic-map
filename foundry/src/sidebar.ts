import { MODULE_ID } from "./constants.ts";
import "./types.ts";

/** Sidebar tab id for the World sheet. */
export const TAB_NAME = "travellerWorld";

/** On the document while the Astrogation scene is open. The tab button and the tool palette key off it. */
const BODY_CLASS = "traveller-astrogation-open";

/** One element for the life of the page, so a sidebar re-render does not drop the portaled controls. */
export const toolsElement = document.createElement("div");
toolsElement.className = "traveller-astrogation-tools";

type TabDescriptor = { tooltip?: string; icon?: string };

/** True after the World tab application exists. */
let installed = false;
/** Bumped when the scene opens or closes, so a late render from the previous visit is ignored. */
let visit = 0;
/** True after this visit has selected the World tab once. */
let armed = false;

/** Create the World tab once and register it with the sidebar. */
export function installWorldTab(): void {
  registerDescriptor();
  if (installed) return;
  const Base = foundry.applications?.sidebar?.AbstractSidebarTab;
  if (!Base) {
    console.error(`${MODULE_ID} | AbstractSidebarTab is missing. The world tab was not registered.`);
    return;
  }
  /** Sidebar tab. Its body is the same element for the life of the page. */
  class WorldTab extends Base {
    static tabName = TAB_NAME;
    static DEFAULT_OPTIONS = {
      classes: ["traveller-astrogation-dock", "flexcol"],
      window: { title: "World" },
    };

    /** The tools element Foundry shows as the tab body. */
    _renderHTML(): HTMLElement {
      return toolsElement;
    }

    /** Keep that element when Foundry replaces the tab contents. */
    _replaceHTML(result: unknown, content: HTMLElement): void {
      if (result instanceof HTMLElement) content.replaceChildren(result);
    }

    /** The sidebar leaves a <template id="travellerWorld">. The tab has to replace that stub. */
    _insertElement(element: HTMLElement): void {
      const content = document.getElementById("sidebar-content");
      const stub = content?.querySelector(`:scope > template#${TAB_NAME}`);
      if (stub) {
        stub.replaceWith(element);
        return;
      }
      if (content && !content.contains(element)) {
        content.append(element);
        return;
      }
      if (!element.isConnected) document.body.append(element);
    }
  }
  try {
    ui.travellerWorld = new WorldTab();
    installed = true;
  } catch (error) {
    console.error(`${MODULE_ID} | The world tab could not be created.`, error);
  }
}

/** Show the World tab while this scene is up. The first call of a visit selects the tab. */
export async function openWorldTab(): Promise<HTMLElement | "stale" | null> {
  const ticket = ++visit;
  installWorldTab();
  if (!ui.travellerWorld) return null;
  document.body.classList.add(BODY_CLASS);
  syncTabButton();
  const sidebar = ui.sidebar;
  const select = !armed;
  armed = true;
  if (sidebar && (select || !toolsElement.isConnected)) {
    if (ui.travellerWorld.render) {
      try {
        await ui.travellerWorld.render({ force: true });
      } catch (error) {
        console.error(`${MODULE_ID} | Could not render the World tab`, error);
      }
    }
  }
  const section = placeWorldTab();
  if (select && sidebar) {
    try {
      if (typeof sidebar.changeTab === "function") sidebar.changeTab(TAB_NAME, "primary");
      else sidebar.activateTab?.(TAB_NAME);
    } catch (error) {
      console.error(`${MODULE_ID} | Could not open the World tab`, error);
    }
    // changeTab ignores the request when this tab is already selected, which skips
    // marking the section active if it was mounted after that first call.
    if (section) activateSection(section);
    sidebar.expand?.();
  }
  if (ticket !== visit) return "stale";
  return toolsElement;
}

/** Hide the World tab button and leave it if it was the active sidebar tab. */
export function hideWorldTab(): void {
  visit += 1;
  armed = false;
  const sidebar = ui.sidebar;
  const active = sidebar?.tabGroups?.primary;
  if (sidebar && active === TAB_NAME) {
    try {
      if (typeof sidebar.changeTab === "function") sidebar.changeTab("chat", "primary");
      else sidebar.activateTab?.("chat");
    } catch (error) {
      console.error(`${MODULE_ID} | Could not leave the World tab`, error);
    }
  }
  const popout = ui.travellerWorld?.popout;
  if (popout && typeof popout.close === "function") {
    void Promise.resolve(popout.close()).catch((error: unknown) => {
      console.error(`${MODULE_ID} | Could not close the World popout`, error);
    });
  }
  document.body.classList.remove(BODY_CLASS);
  syncTabButton();
}

/** Keep the tab button in step when Foundry redraws the sidebar. */
export function watchWorldTab(): void {
  Hooks.on("renderSidebar", () => syncTabButton());
}

/** Tell every sidebar tab table about the World tab. */
function registerDescriptor(): void {
  const descriptor = tabDescriptor();
  const tables = [
    foundry.applications?.sidebar?.Sidebar?.TABS,
    CONFIG?.ui?.sidebar?.TABS,
    ui.sidebar?.TABS,
  ];
  for (const table of tables) {
    if (table) table[TAB_NAME] = descriptor;
  }
}

/** Tooltip and globe icon for the World tab. */
function tabDescriptor(): TabDescriptor {
  let tooltip = "World";
  try {
    const localized = game.i18n.localize("Traveller_ASTROGATION.Tabs.World");
    if (localized && !localized.startsWith("Traveller_ASTROGATION.")) tooltip = localized;
  } catch {
    // Localization is not ready while the module is initializing.
  }
  return { tooltip, icon: "fa-solid fa-globe" };
}

/** Move the rendered tab into the sidebar and mark it active. */
function placeWorldTab(): HTMLElement | null {
  const section = document.getElementById(TAB_NAME);
  const content = document.getElementById("sidebar-content");
  if (!(section instanceof HTMLElement) || section.tagName === "TEMPLATE" || !content) return null;
  if (!content.contains(section)) {
    const stub = content.querySelector(`:scope > template#${TAB_NAME}`);
    if (stub) stub.replaceWith(section);
    else content.append(section);
  }
  return section;
}

/** Mark this section as the active primary sidebar tab. */
function activateSection(section: HTMLElement): void {
  const content = section.parentElement;
  if (!content) return;
  for (const other of content.querySelectorAll(":scope > .tab[data-group='primary']")) {
    other.classList.toggle("active", other === section);
  }
}

/** Show the World tab button only while the Astrogation scene is open. */
function syncTabButton(): void {
  const open = document.body.classList.contains(BODY_CLASS);
  const nodes = document.querySelectorAll("#sidebar [data-tab='travellerWorld']");
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (!node.matches("button, a, .ui-control, .item")) continue;
    node.hidden = !open;
    node.style.display = open ? "" : "none";
  }
}
