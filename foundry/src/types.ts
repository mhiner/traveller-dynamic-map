export {};

declare global {
  const Hooks: {
    once(hook: string, fn: (...args: unknown[]) => unknown): number;
    on(hook: string, fn: (...args: unknown[]) => unknown): number;
  };

  const game: {
    user: {
      id?: string;
      isGM: boolean;
    } | null;
    ready?: boolean;
    scenes: {
      contents?: FoundryScene[];
    } | null;
    settings: {
      register(module: string, key: string, config: FoundrySetting): void;
      registerMenu(module: string, key: string, config: FoundrySettingMenu): void;
      get(module: string, key: string): unknown;
      set(module: string, key: string, value: unknown): Promise<unknown>;
    };
    i18n: {
      localize(key: string): string;
    };
    system?: { id: string };
    actors?: { contents?: FoundryActor[] };
    folders?: { contents?: FoundryFolder[] };
    packs?: { contents?: FoundryPack[] };
    modules?: {
      get(id: string): {
        active?: boolean;
        api?: {
          importSectors?: () => Promise<void>;
          selectedSystem?: () => {
            name: string;
            sector: string;
            hex: string;
            worldX: number | null;
            worldY: number | null;
          } | null;
          systemsWithin?: (
            origin: {
              name: string;
              sector: string;
              hex: string;
              worldX: number | null;
              worldY: number | null;
            },
            jump: number,
          ) => Promise<Array<{
            name: string;
            sector: string;
            hex: string;
            worldX: number | null;
            worldY: number | null;
            parsecs: number;
          }>>;
          worldProfile?: (sector: string, hex: string) => Promise<{
            name: string;
            sector: string;
            hex: string;
            uwp: string;
            tradeCodes: string[];
            zone: "green" | "amber" | "red";
            port: string;
            population: number | null;
          } | null>;
        };
      } | undefined;
    };
  };

  const canvas: {
    scene: FoundryScene | null;
    app?: {
      canvas?: HTMLCanvasElement;
      view?: HTMLCanvasElement;
    };
  } | undefined;

  const ui: {
    notifications: {
      info(message: string): void;
      warn(message: string): void;
      error(message: string): void;
    };
    sidebar?: FoundrySidebar;
    travellerWorld?: FoundrySidebarTab;
  };

  const ChatMessage: {
    create(
      data: {
        content: string;
        speaker?: object;
        whisper?: string[];
        flags?: Record<string, unknown>;
      },
      options?: { messageMode?: string },
    ): Promise<unknown>;
    getSpeaker?: (options?: { alias?: string }) => object;
  };

  interface FoundryChatLog {
    CHAT_COMMANDS: Record<string, {
      rgx: RegExp;
      fn: (command: string, match: RegExpMatchArray) => boolean | void | Promise<boolean | void>;
    }>;
  }

  const Scene: {
    create(data: Record<string, unknown>): Promise<FoundryScene | FoundryScene[] | null | undefined>;
  };

  const Actor: {
    create(
      data: Record<string, unknown>,
      options?: { pack?: string },
    ): Promise<FoundryActor | FoundryActor[] | null | undefined>;
  };

  const Folder: {
    create(
      data: Record<string, unknown>,
      options?: { pack?: string },
    ): Promise<FoundryFolder | FoundryFolder[] | null | undefined>;
  };

  const JournalEntry: {
    create(
      data: { name: string; flags?: Record<string, unknown> },
      options?: { pack?: string },
    ): Promise<FoundryJournal | FoundryJournal[] | null | undefined>;
  };

  const CompendiumCollection: {
    createCompendium(metadata: { label: string; type: string }): Promise<FoundryPack | null | undefined>;
  };

  interface FoundryPack {
    metadata: { label: string };
    collection: string;
    locked: boolean;
    folder?: { id?: string } | null;
    folders?: { contents?: FoundryFolder[]; values?: () => Iterable<FoundryFolder> };
    getIndex(options?: { fields?: string[] }): Promise<{ contents?: FoundryIndexEntry[] } | Iterable<FoundryIndexEntry>>;
    getDocument(id: string): Promise<FoundryDocument>;
    configure(configuration: { ownership?: Record<string, string> }): Promise<void>;
    setFolder?: (folder: FoundryFolder | string | null) => Promise<unknown>;
  }

  interface FoundryIndexEntry {
    _id: string;
    name: string;
    type?: string;
    folder?: string | null;
    flags?: Record<string, unknown>;
    system?: FoundryActor["system"];
  }

  interface FoundryDocument {
    id: string;
    name: string;
    getFlag(scope: string, key: string): unknown;
    setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
    delete(): Promise<unknown>;
  }

  interface FoundryJournal extends FoundryDocument {}

  interface FoundryApplicationV2 {
    render(...args: unknown[]): Promise<this>;
  }

  interface FoundryApplicationV2Class {
    new (): FoundryApplicationV2;
  }

  interface FoundrySettingMenu {
    name: string;
    label: string;
    hint: string;
    icon: string;
    type: FoundryApplicationV2Class;
    restricted?: boolean;
  }

  interface FoundryActor {
    id: string;
    name: string;
    type: string;
    pack?: string | null;
    folder?: { id?: string } | string | null;
    system?: {
      world?: {
        location?: {
          sector?: string;
          sectorX?: number | string;
          sectorY?: number | string;
          x?: number | string;
          y?: number | string;
        };
        uwp?: {
          port?: string;
          size?: number | string;
          atmosphere?: number | string;
          hydrographics?: number | string;
          population?: number | string;
          government?: number | string;
          lawLevel?: number | string;
          techLevel?: number | string;
          zone?: string | null;
          bases?: string;
          codes?: string;
        };
        extra?: { popDigit?: number | string; allegiance?: string };
      };
    };
  }

  interface FoundryFolder {
    id: string;
    name: string;
    type: string;
    folder?: { id?: string } | string | null;
  }

  interface FoundryScene {
    id: string;
    name: string;
    getFlag(scope: string, key: string): unknown;
  }

  interface FoundrySetting {
    name: string;
    hint: string;
    scope: "world" | "client" | "user";
    config: boolean;
    type: typeof String | typeof Number | typeof Boolean | typeof Object;
    default: string | number | boolean | null;
    range?: { min: number; max: number; step: number };
    onChange?: (value: unknown) => void;
  }

  interface FoundrySidebarTab {
    rendered?: boolean;
    popout?: { close?: () => void | Promise<void> } | null;
    render?: (options?: boolean | { force?: boolean }) => Promise<unknown>;
  }

  interface FoundrySidebar {
    TABS?: Record<string, { tooltip?: string; icon?: string }>;
    tabGroups?: { primary?: string | null };
    element?: HTMLElement;
    render: (options?: boolean | { force?: boolean }) => Promise<unknown>;
    changeTab?: (tab: string, group: string) => void;
    activateTab?: (tab: string) => void;
    expand?: () => void;
  }

  const foundry: {
    applications?: {
      sidebar?: {
        AbstractSidebarTab?: new (options?: object) => FoundrySidebarTab;
        Sidebar?: { TABS?: Record<string, { tooltip?: string; icon?: string }> };
        tabs?: { ChatLog?: FoundryChatLog };
      };
      api?: {
        ApplicationV2?: FoundryApplicationV2Class;
        DialogV2?: {
          prompt(config: {
            window?: { title?: string };
            content?: string;
            ok?: {
              label?: string;
              callback?: (event: Event, button: HTMLButtonElement) => unknown;
            };
            rejectClose?: boolean;
          }): Promise<unknown>;
        };
      };
    };
  };

  const CONFIG: {
    ui?: {
      sidebar?: { TABS?: Record<string, { tooltip?: string; icon?: string }> };
      chat?: FoundryChatLog;
    };
  };
}
