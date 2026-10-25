// Row shapes from supabase/migrations. shortcut: hand-written, replace with `supabase gen types` once the project exists.
export type PersonRow = {
  id: string;
  slug: string;
  name: string;
  age: number | null;
  residence: string | null;
  citizenship: string | null;
  main_source: string | null;
  bio: string | null;
  other_assets_usd: number;
  portrait_url: string | null;
  portrait_page_url: string | null;
  portrait_author: string | null;
  portrait_license: string | null;
  portrait_license_url: string | null;
  updated_at: string;
  forbes_uri: string | null;
  forbes_rank: number | null;
  /** Where they post most (one-time research); profile link always, latest post when the platform allows. */
  social: { platform: string; handle: string; url: string } | null;
};

export type ValueKind = 'estimate' | 'computed';

export type NetWorthValue = {
  id: string;
  person_id: string;
  as_of: string;
  net_worth_usd: number;
  kind: ValueKind;
  source_label: string | null;
  source_url: string | null;
};

export type Summary = {
  person_id: string;
  net_worth_usd: number | null;
  as_of: string | null;
  kind: ValueKind | null;
  prev_net_worth_usd: number | null;
  prev_as_of: string | null;
};

export type Holding = {
  id: string;
  person_id: string;
  company: string;
  ticker: string | null;
  shares_owned: number;
  stake_percent: number;
  role: string | null;
  is_private: boolean;
  private_valuation_usd: number;
};

export type Project = {
  id: string;
  person_id: string;
  title: string;
  description: string | null;
  status: 'new' | 'upcoming';
  announced_date: string;
  source_name: string;
  source_url: string;
};

export type LifeEvent = { id: string; person_id: string; date: string; text: string };

export type BriefItem = {
  id: string;
  brief_id: string;
  person_id: string | null;
  position: number;
  title: string;
  note: string;
  source_name: string;
  source_url: string;
  published_at: string | null;
};

export type Brief = { id: string; brief_date: string; headline: string; model: string; brief_items: BriefItem[] };

export type PersonNews = {
  id: string;
  person_id: string;
  title: string;
  source_name: string;
  source_url: string;
  published_at: string | null;
  note?: string | null;
};

export type SocialPost = {
  person_id: string;
  platform: string;
  handle: string;
  post_url: string | null;
  text: string;
  posted_at: string | null;
  fetched_at: string;
};

export type RefreshState = {
  person_id: string;
  kind: 'finance' | 'news' | 'social';
  status: 'idle' | 'running' | 'error';
  started_at: string | null;
  refreshed_at: string | null;
  next_auto_at: string | null;
  error: string | null;
};
