# Traveller Astrogation

## Build

From the foundry subdirectory:

```bash
deno task build
````


## Sector data

**Use sector compendium** is on by default. Packed sectors in the **Sector Data** compendium are used first, and Traveller Map fills in the rest.

Go to **Configure Settings**, chooses **Traveller Astrogation**, and presses **Import sectors** . The dialog asks for two sector-grid corners. Go to Traveller Map and zoom out and you will see coordinates from core. (-8, -4) to (7,3) would give you the majority of the core.   (-5, 0) to (3, 2) would give you the Spinward Marches and all the sectors sorrounding it.

 **Compendium only** turns Traveller Map off and keeps the map inside the packed sectors.  This will let you limit available stars to a bound area.  With it off the map will pull sectors as needed but will be a little bit slower since it will pull from the Traveller Map API.

