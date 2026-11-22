/** Reads Traveller Map data. The default talks to the host's `/travellermap` proxy. */
export interface MapSource {
  get(path: string, init: { accept: string; signal?: AbortSignal }): Promise<{ ok: boolean; status: number; text: string }>;
}

/** Fetch Traveller Map through the host's proxy. */
export function travellerMapSource(base = "/travellermap"): MapSource {
  return {
    async get(path, init) {
      const response = await fetch(`${base}${path}`, {
        headers: { Accept: init.accept },
        signal: init.signal,
      });
      return { ok: response.ok, status: response.status, text: await response.text() };
    },
  };
}
