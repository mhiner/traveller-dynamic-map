/** Foundry module id. Settings, flags, and the scene root use this name. */
export const MODULE_ID = "traveller-astrogation";
/** World setting for the system the map opens on. */
export const HOME_SYSTEM = "homeSystem";
/** World setting for the ship's jump range, from 1 through 6. */
export const JUMP_RATING = "jumpRating";
/** World setting for the explore-map zoom floor. */
export const ZOOM_MIN = "zoomMin";
/** World setting for the explore-map zoom ceiling. */
export const ZOOM_MAX = "zoomMax";
/** World setting. True draws the chart with light ink on a dark ground. */
export const DARK_MAP = "darkMap";
/** World setting. True outlines the selected world's hex in yellow. */
export const SELECTED_HEX = "selectedHex";
/** World setting. True reads sectors from the Sector Data compendium. */
export const COMPENDIUM_DATA = "compendiumData";
/** World setting. True does not call Traveller Map when the compendium has no answer. */
export const COMPENDIUM_ONLY = "compendiumOnly";
/** World setting button that starts a sector import. */
export const IMPORT_SECTORS = "importSectors";
/** Home system used when the setting is blank. */
export const DEFAULT_HOME = "Regina";
/** Jump range used when the setting is missing. */
export const DEFAULT_JUMP = 2;
/** Scene flag that marks the Astrogation scene this module created. */
export const SCENE_FLAG = "managed";
/** DOM id of the map host on the Foundry board. */
export const ROOT_ID = "traveller-astrogation";
/** World setting carrying the GM's latest snap, so other clients can follow it. */
export const GM_SNAP = "gmSnap";
/** World setting carrying the GM's latest filters, so other clients can match them. */
export const GM_FILTERS = "gmFilters";
/** Per-user scene view, stored in the world. */
export const SCENE_STATE = "sceneState";
/** Same-browser copy, so a refresh keeps a view the world has not finished saving. */
export const SCENE_LOCAL = "sceneLocal";
