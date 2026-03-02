import { limitlessAdapter } from "./limitlessAdapter";
import { polymarketAdapter } from "./polymarketAdapter";
import type { VenueAdapter, VenueProvider } from "./types";

const adapters: VenueAdapter[] = [polymarketAdapter, limitlessAdapter];

export const getVenueAdapter = (provider: VenueProvider): VenueAdapter => {
  const adapter = adapters.find((item) => item.provider === provider);
  if (!adapter) {
    throw new Error(`VENUE_ADAPTER_NOT_FOUND:${provider}`);
  }
  return adapter;
};

export const listEnabledVenueAdapters = (): VenueAdapter[] =>
  adapters.filter((adapter) => adapter.isEnabled());

export const listEnabledProviders = (): VenueProvider[] =>
  listEnabledVenueAdapters().map((adapter) => adapter.provider);
