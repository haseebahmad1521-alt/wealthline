import { useSyncExternalStore } from 'react';

// One search field for the whole app (owner, Nov 2, 2026). Its meaning follows the tab in view, and each tab keeps
// its own query, so switching tabs and back finds your search where you left it. Screens read their query here and
// filter in place; a screen whose matches aren't a list on the page (World) publishes suggestions the field shows.

export type SearchContext = 'people' | 'world' | 'projects' | 'watchlist';

export type Suggestion = { key: string; label: string; detail: string; onPick: () => void };

export const searchCopy: Record<SearchContext, { placeholder: string; label: string }> = {
  people: { placeholder: 'Search people', label: 'Search people by name, source, or country' },
  world: { placeholder: 'People, companies, places', label: 'Search people, companies, and places on the globe' },
  projects: { placeholder: 'Search projects', label: 'Search projects by title, description, or person' },
  watchlist: { placeholder: 'Search your watchlist', label: 'Search the people you watch' },
};

const queries: Record<SearchContext, string> = { people: '', world: '', projects: '', watchlist: '' };
const suggestions: Partial<Record<SearchContext, Suggestion[]>> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export function setSearch(context: SearchContext, query: string) {
  if (queries[context] === query) return;
  queries[context] = query;
  emit();
}

/** The tab's query, as typed (trim before matching). */
export const useSearch = (context: SearchContext) =>
  useSyncExternalStore(subscribe, () => queries[context], () => '');

/** Matches a screen offers for its query (undefined: the screen filters in place). */
export function publishSuggestions(context: SearchContext, list: Suggestion[] | undefined) {
  if (suggestions[context] === list) return;
  suggestions[context] = list;
  emit();
}

export const useSuggestions = (context: SearchContext) =>
  useSyncExternalStore(subscribe, () => suggestions[context], () => undefined);

/** Case-insensitive "contains" over a record's searchable fields. */
export const matches = (query: string, ...fields: (string | null | undefined)[]) => {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => f?.toLowerCase().includes(q));
};
