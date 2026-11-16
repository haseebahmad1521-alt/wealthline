import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Chip as Tag } from 'heroui-native';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { metal } from '@/components/arena';
import { Globe, type GlobeArc, type GlobeFill, type GlobeMarker, type GlobePulse, type GlobeSite } from '@/components/globe';
import { WorldGlobe } from '@/components/world-globe';
import { EconomiesPanel, MoneyPanel, economyFills, flowArcs, fortuneFills, revenueLines, type EconomyMode } from '@/components/world-views';
import { useMoney } from '@/lib/currency';
import { usePeople, type Person } from '@/lib/data';
import { countryCentre } from '@/lib/geo';
import { askScenario, askVersus, examples, fetchScenario, useDailyScenarios, useLiveOdds, useMostAsked, useSimData, type Scenario } from '@/lib/scenarios';
import { briefing } from '@/lib/briefing';
import { tiesFor, type ContractTie } from '@/lib/ties';
import tiesData from '@/data/ties.json';
import { readSimParams, shareSim, simParams, simUrl } from '@/lib/share';
import { suggestedMatches, versusScenario, versusScore, type Battle } from '@/lib/versus';
import { dialScenario, type DialValues } from '@/lib/dials';
import { chain, FOLLOW_UPS } from '@/lib/chain';
import { expandAnalogs, pastEvents, replayScenario, type EventData } from '@/lib/analogs';
import eventData from '@/data/events.json';
import { MINE_KEY, myChange, readMine, type Holding } from '@/lib/mine';
import { dailyChallenge, EMPTY_SCORE, makeGuess, scored, type Score } from '@/lib/guess';
import { getItem, setItem } from '@/lib/device-store';
import { lineCountries, NOTE_LIFE, schedule, simEvents, simPct, simulate, TICKS_PER_MONTH, type SimCountry, type SimEmpire, type SimSubject } from '@/lib/simulate';
import { BriefingPanel, DialsPanel, MineEditor, SimOverlay, SimulatePanel, VersusPicker } from '@/components/world-sim';
import { companyBoard, moves, today } from '@/lib/today';
import { REFERENCE } from '@/lib/factor-data';
import { PageSearch } from '@/components/page-search';
import { Body, Caption, Change, Heading, Portrait, Screen, StateView, Surface, minTouch } from '@/components/ui';
import { formatDate, formatTime, usd } from '@/lib/format';
import { scene } from '@/lib/scene';
import { matches, publishSuggestions, useSearch, type Suggestion } from '@/lib/search';
import { LIVE_QUOTE_MS, useWorld, type CompanyView, type Empire, type Quote, type SiteKind, type Stake } from '@/lib/world';
import { color, desktopBreakpoint, glass, radius, space, type } from '@/theme';

const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const country = (iso: string | null) => (iso ? (regionName.of(iso) ?? iso) : null);

const KIND: Record<SiteKind, [string, string]> = {
  hq: ['Headquarters', 'Headquarters'],
  factory: ['Factory', 'Factories'],
  launch_site: ['Launch site', 'Launch sites'],
  data_center: ['Data centre', 'Data centres'],
  research: ['Research site', 'Research sites'],
  office: ['Office', 'Offices'],
  store: ['Store', 'Stores'],
  other: ['Site', 'Sites'],
};

// The 80% range width calibrated on past shocks (fat tails), else the bell-curve one.
const RANGE_Z = REFERENCE.backtest?.ranges?.z80;

const VIEWS = [
  { key: 'places', label: 'Today' },
  { key: 'money', label: 'Money' },
  { key: 'economies', label: 'Economies' },
  { key: 'whatif', label: 'What if' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

const formatShares = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString('en-US'));

const isLive = (q: Quote | null) => !!q && Date.now() - Date.parse(q.as_of) < LIVE_QUOTE_MS;
const open = (url: string | null) => url && void WebBrowser.openBrowserAsync(url);

export default function World() {
  const world = useWorld();
  const people = usePeople();
  const money = useMoney();
  const { width, height: windowHeight } = useWindowDimensions();
  const desktop = width >= desktopBreakpoint;
  const { focus: slug, view: viewParam, sim: simParam, vs: vsParam, dials: dialsParam } = useLocalSearchParams<{ focus?: string; view?: string; sim?: string; vs?: string; dials?: string }>();
  const view: ViewKey = VIEWS.some((v) => v.key === viewParam) ? (viewParam as ViewKey) : 'places';
  const empires = world.data ?? [];
  const focused = empires.find((e) => e.person.slug === slug) ?? null;
  const lines = useMemo(() => revenueLines(world.data ?? []), [world.data]);
  const [econ, setEcon] = useState<EconomyMode>('fortune');

  // Simulations: Grok's daily scenarios first (most plausible first), then the built-in examples; a typed question's
  // answer joins the front. The month is the globe's month too.
  const simData = useSimData();
  const daily = useDailyScenarios();
  const mostAsked = useMostAsked();
  const [asked, setAsked] = useState<Scenario[]>([]);
  const [panel, setPanel] = useState<'scenarios' | 'versus' | 'dials'>('scenarios');
  const [dials, setDials] = useState<DialValues>({});
  const dialSim = useMemo(() => dialScenario(dials), [dials]);
  const scenarios = useMemo(() => [...asked, ...(daily.data ?? []), ...examples(empires), ...(mostAsked.data ?? []).filter((m) => !asked.some((a) => a.id === m.id))], [asked, daily.data, empires, mostAsked.data]);
  const [simId, setSimId] = useState<string | null>(null);
  const picked = panel === 'dials' ? dialSim : (scenarios.find((s) => s.id === simId) ?? scenarios[0] ?? null);
  // "Like past events" changes become their measured market moves (src/data/events.json) before simulating.
  const sim = useMemo(() => (picked ? expandAnalogs(picked, eventData as EventData) : null), [picked]);
  // The film's clock: a few ticks per month (TICKS_PER_MONTH); the globe shows the month the clock is in.
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const simOn = view === 'whatif' && !!sim;
  const simEmpires = useMemo<SimEmpire[]>(
    () =>
      empires.map((e) => ({
        person: e.person,
        stakes: e.stakes,
        companies: e.companies.map((c) => ({ id: c.id, name: c.name, sector: simData.data?.sectors.get(c.id) ?? null, listed: !c.is_private && !!c.ticker, regions: c.regions, fit: simData.data?.fits.get(c.id) ?? null, margin: simData.data?.margins.get(c.id) ?? null })),
      })),
    [empires, simData.data],
  );
  const simCountries = useMemo<SimCountry[]>(() => (world.countries ?? []).map((c) => ({ ...c, region: simData.data?.regions.get(c.iso2) ?? null })), [world.countries, simData.data]);
  // Every month of the film at once (a few dozen small calculations), so notifications can compare months.
  const frames = useMemo(
    () => (simOn && sim ? Array.from({ length: sim.months + 1 }, (_, m) => simulate(sim, simEmpires, simCountries, m, RANGE_Z)) : []),
    [simOn, sim, simEmpires, simCountries],
  );
  const month = sim ? Math.min(Math.floor(tick / TICKS_PER_MONTH), sim.months) : 0;
  const frame = frames[Math.min(month, frames.length - 1)] ?? null;
  const events = useMemo(() => {
    if (!sim || !frames.length) return [];
    const companyName = new Map(empires.flatMap((e) => e.companies.map((c) => [c.id, c.name] as const)));
    const personName = new Map(empires.map((e) => [e.person.slug, e.person.name] as const));
    return simEvents(sim, frames, (id) => companyName.get(id) ?? 'A company', (slug) => personName.get(slug) ?? slug);
  }, [sim, frames, empires]);
  const film = useMemo(() => schedule(events, sim?.months ?? 0), [events, sim]);
  const playPause = () => {
    if (playing) return setPlaying(false);
    if (tick >= film.length) setTick(0);
    setPlaying(true);
  };
  // Play: about 1.3 s a month while something is happening; quiet stretches (no notification up or about to come)
  // run faster. It stops once the last notification has had its moment.
  const busy = film.notes.some((n) => n.tick <= tick + 1 && n.tick > tick - NOTE_LIFE);
  useEffect(() => {
    if (!playing || !sim) return;
    const t = setTimeout(() => {
      if (tick >= film.length) setPlaying(false);
      else setTick(tick + 1);
    }, busy ? 420 : 160);
    return () => clearTimeout(t);
  }, [playing, sim, tick, busy, film.length]);
  // The note on screen now (the newest), which the camera follows.
  const note = [...film.notes].reverse().find((n) => n.tick <= tick && n.tick > tick - NOTE_LIFE) ?? null;
  const scrub = (k: number) => {
    setPlaying(false);
    setTick(k);
  };
  const pick = (s: Scenario) => {
    setSimId(s.id);
    setTick(0);
    // Scenarios open on the guess first (the answer starts the film); matches start straight away, unless the device
    // asks for reduced motion.
    setPlaying(s.origin === 'versus' && !reduceMotion);
    setAutoStart(s.origin !== 'versus');
  };
  // A scenario with no clear question to ask starts playing by itself, as before.
  const [autoStart, setAutoStart] = useState(false);
  // Versus: the rivals' slugs, scored every month; everyone else steps back.
  const rivals = sim?.versus ? sim.versus.map((slug) => simEmpires.find((e) => e.person.slug === slug)) : null;
  const pair = rivals && rivals[0] && rivals[1] ? ([rivals[0], rivals[1]] as const) : null;
  const score = simOn && pair && frame ? versusScore(frame, pair[0], pair[1]) : null;
  const finalScore = simOn && pair && frames.length ? versusScore(frames[frames.length - 1], pair[0], pair[1]) : null;
  const fighters = useMemo(() => [...empires].filter((e) => e.person.net_worth_usd).sort((a, b) => b.person.net_worth_usd! - a.person.net_worth_usd!).slice(0, 60).map((e) => e.person), [empires]);
  const matchups = useMemo(() => suggestedMatches(fighters), [fighters]);
  const homeOf = (companyId: string) => empires.flatMap((e) => e.companies).find((c) => c.id === companyId)?.country ?? null;
  const fight = (a: string, b: string, battle: Battle, winner: 'a' | 'b') => {
    const ea = simEmpires.find((e) => e.person.slug === a);
    const eb = simEmpires.find((e) => e.person.slug === b);
    const s = ea && eb ? versusScenario(ea, eb, battle, winner, { home: homeOf, countryName: (iso) => country(iso) ?? iso }) : null;
    if (!s) return 'Those two share the same main company; pick someone else.';
    setAsked((x) => [s, ...x.filter((y) => y.id !== s.id)]);
    pick(s);
    return null;
  };
  const fightGrok = async (a: string, b: string) => {
    const r = await askVersus(a, b);
    if ('error' in r) return r.error;
    setAsked((x) => [r.scenario, ...x.filter((y) => y.id !== r.scenario.id)]);
    pick(r.scenario);
    return null;
  };
  // Guess before you play: asked before the film starts, scored when it ends; points and streak stay on this device.
  const [game, setGame] = useState<Score>(EMPTY_SCORE);
  useEffect(() => {
    void getItem('wl.sim.score').then((v) => {
      try {
        if (v) setGame({ ...EMPTY_SCORE, ...JSON.parse(v) });
      } catch {
        /* a damaged value just starts over */
      }
    });
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const challenge = useMemo(() => dailyChallenge(scenarios, today), [scenarios, today]);
  const [choice, setChoice] = useState<{ id: string; pick: string | null; scored: boolean; gained: number } | null>(null);
  const guess = useMemo(
    () => (simOn && sim && sim.origin !== 'dials' && sim.origin !== 'versus' ? makeGuess(sim.id, frames[frames.length - 1] ?? null) : null),
    [simOn, sim, frames],
  );
  const asking = !!guess && !!sim && choice?.id !== sim.id && tick === 0 && !playing;
  const onGuess = (personId: string | null) => {
    if (!sim) return;
    setChoice({ id: sim.id, pick: personId, scored: false, gained: 0 });
    setTick(0);
    setPlaying(true);
  };
  useEffect(() => {
    if (!autoStart || !frames.length) return;
    setAutoStart(false);
    if (!guess && !reduceMotion) setPlaying(true);
  }, [autoStart, frames.length, guess]);
  const filmDone = tick >= film.length;
  useEffect(() => {
    if (!filmDone || !guess || !sim || !choice || choice.id !== sim.id || choice.scored || !choice.pick) return;
    const right = choice.pick === guess.answer;
    const counts = sim.id === challenge?.id && game.challenge !== today;
    const next = scored(game, right, counts ? today : null);
    setGame(next);
    void setItem('wl.sim.score', JSON.stringify(next));
    setChoice({ ...choice, scored: true, gained: next.points - game.points });
  }, [filmDone, guess, sim, choice, challenge, game, today]);
  const byId = (id: string | null) => (id ? (empires.find((e) => e.person.id === id)?.person ?? null) : null);
  const verdict =
    filmDone && guess && sim && choice?.id === sim.id && choice.pick && choice.scored
      ? { right: choice.pick === guess.answer, answer: byId(guess.answer)!, pick: byId(choice.pick), gained: choice.gained, streak: game.streak }
      : null;

  // Share: a link that rebuilds this scenario (or match, or dials), sent with a one-line result.
  const shareLine = () => {
    if (!sim) return '';
    if (finalScore?.lead) return `${sim.title.replace(/\.$/, '')} — ${(finalScore.lead === 'a' ? finalScore.a : finalScore.b).person.name.replace(/ & family$/, '')} wins.`;
    const end = frames[frames.length - 1];
    const low = end?.people.find((p) => (p.delta ?? p.pct ?? 0) < 0);
    const high = end?.people.find((p) => (p.delta ?? p.pct ?? 0) > 0);
    const who = [high && `${high.person.name.replace(/ & family$/, '')} gains most`, low && `${low.person.name.replace(/ & family$/, '')} is hit hardest`].filter(Boolean).join(', ');
    return `${sim.title.replace(/\.$/, '')}${who ? ` — ${who}.` : ''} A Wealthline what-if.`;
  };
  const onShare = async () => {
    if (!sim) return 'Nothing to share';
    const r = await shareSim(shareLine(), simUrl(simParams(sim, dials)));
    return r === 'copied' ? 'Link copied' : r === 'shared' ? 'Shared' : 'Couldn’t share';
  };
  // Opening a shared link: rebuild the match or dials, or find the scenario (fetching a Grok one by id), once the
  // people are loaded.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    const key = `${simParam ?? ''}|${vsParam ?? ''}|${dialsParam ?? ''}`;
    if (key === '||' || opened.current === key || !simEmpires.length) return;
    opened.current = key;
    const want = readSimParams({ sim: simParam, vs: vsParam, dials: dialsParam });
    if (want.vs) {
      setPanel('versus');
      fight(want.vs.a, want.vs.b, want.vs.battle, want.vs.winner);
    } else if (want.dials) {
      setPanel('dials');
      turnDials(want.dials);
    } else if (want.sim) {
      const known = scenarios.find((s) => s.id === want.sim);
      if (known) pick(known);
      else
        void fetchScenario(want.sim).then((s) => {
          if (!s) return;
          setAsked((x) => [s, ...x.filter((y) => y.id !== s.id)]);
          pick(s);
        });
    }
  }, [simParam, vsParam, dialsParam, simEmpires.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tracked companies by sector, biggest revenue first, so the dials can name who they reach.
  const sectorNames = useMemo(() => {
    const out: Record<string, string[]> = {};
    const seen = new Set<string>();
    const all = simEmpires.flatMap((e) => e.companies).filter((c) => c.sector && !seen.has(c.id) && seen.add(c.id));
    const revenue = (c: (typeof all)[number]) => c.regions.reduce((n, r) => n + r.revenue_usd, 0);
    for (const c of all.sort((a, b) => revenue(b) - revenue(a))) (out[c.sector!] ??= []).push(c.name);
    return out;
  }, [simEmpires]);
  // "You": what the player owns, on this device only; each holding moves with its company.
  const [mine, setMine] = useState<Holding[]>([]);
  useEffect(() => {
    void getItem(MINE_KEY).then((v) => setMine(readMine(v)));
  }, []);
  const saveMine = (h: Holding[]) => {
    setMine(h);
    void setItem(MINE_KEY, JSON.stringify(h));
  };
  const mineEnd = myChange(frames[frames.length - 1] ?? null, mine);
  const ownable = useMemo(() => {
    const seen = new Set<string>();
    return empires
      .flatMap((e) => e.companies)
      .filter((c) => c.ticker && !c.is_private && !seen.has(c.id) && seen.add(c.id))
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [empires]);

  // Today's briefing: Grok's daily storylines (or the built-in examples until it's on), each with who gains and loses
  // most at the end, and live prediction-market odds where a market matches.
  const briefSource = useMemo(() => ((daily.data?.length ? daily.data : examples(empires)) as Scenario[]), [daily.data, empires]);
  const briefItems = useMemo(() => {
    if (view !== 'whatif' || !simEmpires.length) return [];
    // Each company's tracked people, for the documented ties.
    const owners = new Map<string, { id: string; name: string }[]>();
    for (const e of empires) for (const c of e.companies) owners.set(c.id, [...(owners.get(c.id) ?? []), { id: e.person.id, name: e.person.name }]);
    const contracts = (tiesData as { companies: Record<string, ContractTie> }).companies;
    return briefing(briefSource, simEmpires, simCountries, eventData as EventData, 2, RANGE_Z).map((item) => ({
      ...item,
      ties: tiesFor(expandAnalogs(item.scenario, null), contracts, (id) => owners.get(id) ?? []),
    }));
  }, [view, briefSource, simEmpires, simCountries, empires]);
  const liveOdds = useLiveOdds(briefSource.map((s) => s.odds?.market).filter((x): x is string => !!x));

  // "Last time this happened": the past events behind the scenario's analogs, each replayed on today's fortunes.
  const replays = useMemo(() => (picked ? pastEvents(picked, eventData as EventData) : []), [picked]);
  const replay = (key: string) => {
    const s = replayScenario(key, eventData as EventData);
    if (!s) return;
    setAsked((x) => [s, ...x.filter((y) => y.id !== s.id)]);
    setSimId(s.id);
    setTick(0);
    setPlaying(!reduceMotion);
  };

  // "…and then?": the story carries on for another year from where it ended; the film resumes there.
  const followUps = sim && sim.origin !== 'dials' && sim.months < 36 ? FOLLOW_UPS : undefined;
  const continueWith = (key: string) => {
    const f = FOLLOW_UPS.find((x) => x.key === key);
    if (!sim || !f) return;
    const next = chain(sim, f);
    setAsked((x) => [next, ...x.filter((y) => y.id !== next.id)]);
    setSimId(next.id);
    setTick(sim.months * TICKS_PER_MONTH);
    setPlaying(!reduceMotion);
  };

  // Dials: the globe jumps to the year's end as they move; play replays it as a film.
  const turnDials = (v: DialValues) => {
    setDials(v);
    setPlaying(false);
    setTick(Number.MAX_SAFE_INTEGER);
  };
  const ask = async (prompt: string) => {
    const r = await askScenario(prompt);
    if ('error' in r) return r.error;
    setAsked((a) => [r.scenario, ...a.filter((x) => x.id !== r.scenario.id)]);
    pick(r.scenario);
    return null;
  };

  let arcs: GlobeArc[] = [];
  let fills: GlobeFill[] = [];
  if (view === 'money') arcs = flowArcs(lines, focused);
  if (view === 'economies') fills = econ === 'fortune' ? fortuneFills(empires, world.countries ?? [], focused) : economyFills(lines, world.countries ?? [], focused).fills;
  let simCentre: { lat: number; lng: number } | null = null;
  if (simOn && sim && frame) {
    fills = frame.fills.map((f) => ({ iso2: f.iso2, strength: Math.min(Math.abs(f.pct) / 0.5, 1), risk: f.pct < 0, gain: f.pct > 0 }));
    // Money that flows from the shocked countries (directly, or as their share of a regional line).
    const shocked = new Set(frame.fills.map((f) => f.iso2));
    const moved = new Map(frame.companies.map((c) => [c.company.id, c.revenueDelta]));
    arcs = flowArcs(lines, null, (l) => {
      if (!moved.get(l.company.id)) return false;
      const own = new Set(l.company.regions.map((r) => r.country).filter((x): x is string => !!x));
      return lineCountries({ region: l.place, country: l.country }, own, simCountries).some((c) => shocked.has(c));
    }, true);
    // A sale: a line from the seller's headquarters to the buyer's.
    for (const t of frame.transfers) {
      const from = empires.find((e) => e.person.id === t.seller.id)?.hq;
      const to = empires.find((e) => e.person.id === t.buyer.id)?.hq;
      if (from && to) arcs.push({ key: `sale-${t.seller.id}-${t.company.id}`, from, to, weight: t.done ? 1 : 0.4, group: t.buyer.id });
    }
    // Arcs grow as the change ramps in: weight scaled by how much of the company's final revenue change has happened.
    const end = new Map((frames[frames.length - 1]?.companies ?? []).map((c) => [c.company.id, Math.abs(c.revenueDelta)]));
    arcs = arcs.map((a) => {
      const id = a.key.split(':')[0];
      const full = end.get(id);
      return full && moved.has(id) ? { ...a, weight: a.weight * Math.min(Math.abs(moved.get(id)!) / full, 1) } : a;
    });
  }
  // The camera follows the notification on screen: in close for a country, company or person, out for the world.
  const hqOf = (id: string) => {
    for (const e of empires) {
      const c = e.companies.find((x) => x.id === id);
      if (c?.hq_lat != null && c.hq_lng != null) return { lat: c.hq_lat, lng: c.hq_lng };
    }
    return null;
  };
  const whereIs = (about: SimSubject): { at: { lat: number; lng: number } | null; zoom: number } => {
    if (about.kind === 'place') return { at: countryCentre(about.iso2), zoom: 0.4 };
    if (about.kind === 'company') return { at: hqOf(about.id), zoom: 0.35 };
    if (about.kind === 'person') return { at: empires.find((e) => e.person.slug === about.slug)?.hq ?? null, zoom: 0.35 };
    if (about.kind === 'sector') {
      const top = frame?.companies.find((c) => c.company.sector === about.sector);
      return { at: top ? hqOf(top.company.id) : null, zoom: 0.25 };
    }
    if (about.kind === 'start' && sim) {
      if (sim.versus) return { at: empires.find((e) => e.person.slug === sim.versus![0])?.hq ?? null, zoom: 0.3 };
      const place = sim.shocks.find((x) => x.kind === 'place');
      if (place) return { at: countryCentre(place.target), zoom: 0.3 };
      const sale = sim.shocks.find((x) => x.kind === 'transfer') as { person: string } | undefined;
      if (sale) return { at: empires.find((e) => e.person.slug === sale.person)?.hq ?? null, zoom: 0.3 };
    }
    return { at: null, zoom: 0 };
  };
  const shot = simOn && note ? whereIs(note.about) : null;
  if (shot?.at) simCentre = shot.at;
  const shockCentre = simOn ? simCentre : null;
  const simZoom = simOn ? (shot?.zoom ?? 0) : null;
  // Rings where something is happening now: shocked countries (stronger for bigger changes), both sides of a sale,
  // and wherever the notification on screen is about.
  const pulses: GlobePulse[] = [];
  if (simOn && frame) {
    for (const f of frame.fills) {
      const at = countryCentre(f.iso2);
      if (at) pulses.push({ key: `fill-${f.iso2}`, ...at, tone: f.pct < 0 ? 'loss' : 'gain', strength: Math.min(Math.abs(f.pct) / 0.6, 1) });
    }
    for (const t of frame.transfers.filter((x) => x.done)) {
      for (const who of [t.seller, t.buyer]) {
        const at = empires.find((e) => e.person.id === who.id)?.hq;
        if (at) pulses.push({ key: `sale-${who.id}`, ...at, tone: 'info', strength: 0.6 });
      }
    }
    if (shot?.at && note && note.about.kind !== 'place') pulses.push({ key: `note-${note.tick}`, ...shot.at, tone: note.tone, strength: 0.8 });
  }
  // What if and the fortune comparison are about the whole map, so picking a person doesn't fly the globe to them.
  const wide = view === 'whatif' || (view === 'economies' && econ === 'fortune');

  const { sites, markers } = useMemo(() => {
    const s: GlobeSite[] = [];
    const m: GlobeMarker[] = [];
    for (const e of world.data ?? []) {
      for (const c of e.companies) {
        const live = isLive(c.quote);
        // Keyed by person too: a company shared by several people (Alphabet, Walmart) is drawn once per empire, and
        // duplicate keys left stale rings frozen at old positions as the globe turned.
        for (const site of c.sites) s.push({ key: `${e.person.id}:${c.id}:${site.kind}:${site.name}`, lat: site.lat, lng: site.lng, kind: site.kind, group: e.person.id, live });
      }
      if (e.hq) m.push({ key: e.person.id, lat: e.hq.lat, lng: e.hq.lng, uri: e.person.portrait_url, label: e.person.name, worth: e.person.net_worth_usd });
    }
    return { sites: s, markers: m };
  }, [world.data]);

  // Today: each portrait carries its change since the previous value, and the biggest movers lead their bubbles.
  const todayMarkers = useMemo(() => {
    const by = new Map(moves(empires.map((e) => e.person)).map((mv) => [mv.person.id, mv.delta]));
    return markers
      .map((m) => {
        const d = by.get(m.key);
        return !d ? m : { ...m, change: { text: money.format(Math.abs(d)), dir: (Math.sign(d) as 1 | -1 | 0) } };
      })
      .sort((a, b) => Math.abs(by.get(b.key) ?? 0) - Math.abs(by.get(a.key) ?? 0));
  }, [markers, empires, money]);
  // Simulation: each touched portrait carries its projected change (dashed, "≈"); the biggest movers lead.
  const rivalIds = useMemo(() => (sim?.versus ? new Set(empires.filter((e) => sim.versus!.includes(e.person.slug)).map((e) => e.person.id)) : null), [sim, empires]);
  const simMarkers = useMemo(() => {
    if (!frame) return markers;
    const by = new Map(frame.people.map((p) => [p.person.id, p]));
    const size = (id: string) => Math.abs(by.get(id)?.delta ?? 0) * 1e3 + Math.abs(by.get(id)?.pct ?? 0);
    return markers
      .map((m) => {
        const p = by.get(m.key);
        if (!p) return m;
        const v = p.delta ?? p.pct ?? 0;
        const text = p.delta != null ? money.format(Math.abs(p.delta)) : simPct(p.pct!);
        return { ...m, change: { text, dir: Math.sign(v) as 1 | -1 | 0, projected: true } };
      })
      // Everyone the scenario doesn't touch steps back (once it has started moving anyone); in versus, everyone but
      // the two rivals.
      .map((m) => (rivalIds ? (rivalIds.has(m.key) ? m : { ...m, dim: true }) : by.size && !by.has(m.key) ? { ...m, dim: true } : m))
      .sort((a, b) => size(b.key) - size(a.key));
  }, [frame, markers, money, rivalIds]);
  const shownMarkers = view === 'places' ? todayMarkers : simOn ? simMarkers : markers;

  // A place picked from search: the camera flies there instead of to the owner's headquarters.
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(null);
  const select = (personId: string | null) => {
    const e = empires.find((x) => x.person.id === personId);
    setSpot(null);
    router.setParams({ focus: e && e.person.slug !== slug ? e.person.slug : undefined });
  };

  // Search: people, companies and places, each turning the globe to it and focusing its owner.
  const query = useSearch('world').trim();
  useEffect(() => {
    if (!query) return publishSuggestions('world', undefined);
    const out: Suggestion[] = [];
    const fly = (e: Empire, at: { lat: number; lng: number } | null) => () => {
      setSpot(at);
      router.setParams({ focus: e.person.slug, view: undefined });
    };
    for (const e of empires) if (matches(query, e.person.name)) out.push({ key: `p:${e.person.id}`, label: e.person.name, detail: 'Person · headquarters', onPick: fly(e, null) });
    for (const e of empires) {
      for (const c of e.companies) {
        const at = c.hq_lat != null && c.hq_lng != null ? { lat: c.hq_lat, lng: c.hq_lng } : (c.sites[0] ?? null);
        if (at && matches(query, c.name, c.ticker)) out.push({ key: `c:${e.person.id}:${c.id}`, label: c.name, detail: `Company · ${e.person.name}`, onPick: fly(e, at) });
      }
    }
    for (const e of empires) {
      for (const c of e.companies) {
        for (const site of c.sites) {
          if (!matches(query, site.name, site.city, country(site.country))) continue;
          const where = [site.city, country(site.country)].filter(Boolean).join(', ');
          out.push({ key: `s:${e.person.id}:${c.id}:${site.kind}:${site.name}`, label: site.name, detail: `${KIND[site.kind][0]} · ${c.name}${where ? ` · ${where}` : ''}`, onPick: fly(e, site) });
        }
      }
    }
    publishSuggestions('world', out.slice(0, 8));
  }, [query, empires]);
  useEffect(() => () => publishSuggestions('world', undefined), []);

  const globeSize = desktop ? 520 : Math.min(width - space.md * 2 - space.md * 2, 440);
  // Web: the real planet is the globe in every view (flows and shaded countries are drawn on it). While World is open
  // the planet turns to face us (one scene, no page change); leaving World swings it back to the orbit view.
  const planet = Platform.OS === 'web';
  useFocusEffect(
    useCallback(() => {
      if (!planet) return;
      scene.preset = 'world';
      scene.invalidate?.();
      return () => {
        scene.preset = 'orbit';
        scene.invalidate?.();
      };
    }, [planet]),
  );
  const details = useRef<ComponentRef<typeof View>>(null);
  // Choosing someone from the panel below: bring the globe back into view so the flight to them is seen (web).
  const top = useRef<ComponentRef<typeof View>>(null);
  const show = (personId: string) => {
    select(personId);
    (top.current as unknown as HTMLElement | null)?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };
  const places = new Set(sites.map((s) => s.key.split(':').slice(1).join(':'))).size;

  return (
    <Screen>
      <View ref={top}>
        <Heading>World.</Heading>
        <Body secondary>
          {view === 'places' ? 'Who gained and lost today, pinned where their companies are based.' : 'Where the biggest fortunes reach: every ring is a real place their companies own or run.'}
        </Body>
      </View>
      <PageSearch context="world" />
      {world.isPending || world.error ? (
        <StateView loading={world.isPending} error={world.error} onRetry={() => void world.refetch()} />
      ) : !empires.length ? (
        <StateView empty={{ title: 'No company places yet.', body: 'Places appear once company records are linked to their sources.' }} />
      ) : (
        <>
          <View accessibilityRole="tablist" style={styles.segments}>
            {VIEWS.map((v) => (
              <Pressable
                key={v.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: view === v.key }}
                onPress={() => router.setParams({ view: v.key === 'places' ? undefined : v.key })}
                style={[styles.segment, view === v.key && styles.segmentOn]}>
                <Text numberOfLines={1} style={[type.headline, { fontSize: width < 360 ? 12.5 : 14, color: view === v.key ? color.text : color.textSecondary }]}>
                  {v.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {/* Today picks people from its lists and search; the other views keep the strip of names. */}
          {view !== 'places' && view !== 'whatif' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.above} contentContainerStyle={styles.chips} accessibilityRole="tablist">
              <Chip label="Everyone" selected={!focused} onPress={() => select(null)} />
              {empires.map((e) => (
                <Chip key={e.person.id} label={e.person.name} selected={focused?.person.id === e.person.id} onPress={() => select(e.person.id)} empire={e} />
              ))}
            </ScrollView>
          )}
          <View style={[styles.layout, desktop && styles.layoutWide]}>
            {planet ? (
              <View style={[styles.planetArea, desktop && styles.planetWide]}>
                <View style={styles.globeBox}>
                <WorldGlobe
                  // Desktop: as tall as fits below the header, segments and chips (~360px), so the whole globe is in view.
                  height={desktop ? Math.max(360, Math.min(560, windowHeight - 360)) : Math.min(width - space.md * 2, 420)}
                  sites={view === 'places' ? sites : []}
                  markers={shownMarkers}
                  arcs={arcs}
                  fills={fills}
                  pulses={pulses}
                  zoomTo={simZoom}
                  focus={wide ? null : (focused?.person.id ?? null)}
                  center={wide ? shockCentre : ((focused && spot) ?? focused?.hq ?? null)}
                  onSelect={(id) => select(id)}
                  onOpen={(id) => {
                    const e = empires.find((x) => x.person.id === id);
                    if (e) router.push(`/person/${e.person.slug}`);
                  }}
                  label={
                    focused
                      ? `Globe turned to ${focused.person.name}'s companies: ${focused.companies.reduce((n, c) => n + c.sites.length, 0)} places. Details follow.`
                      : `Globe of ${places} company places for ${empires.length} people. Details follow.`
                  }
                />
                {simOn && sim && <SimOverlay notes={film.notes} tick={tick} length={film.length} month={month} start={sim.run_date ?? null} playing={playing} onPlay={playPause} onScrub={scrub} ending={frames[frames.length - 1] ?? null} months={sim.months} title={sim.title} money={money.format} score={score} finalScore={finalScore} quiet={sim.origin === 'dials' && !playing} guess={guess} asking={asking} onGuess={onGuess} verdict={verdict} onShare={onShare} followUps={followUps} onContinue={continueWith} replays={replays} onReplay={replay} mine={mineEnd} />}
                </View>
                {/* A handle instead of a block of text under the globe (owner, Nov 2, 2026): there's more below. */}
                <MoreHandle target={details} />
              </View>
            ) : (
            <Surface style={[styles.globeCard, desktop && styles.globeCardWide]}>
              <Globe
                size={globeSize}
                sites={view === 'places' ? sites : []}
                markers={shownMarkers}
                arcs={arcs}
                fills={fills}
                pulses={pulses}
                focus={wide ? null : (focused?.person.id ?? null)}
                center={wide ? shockCentre : ((focused && spot) ?? focused?.hq ?? null)}
                onSelect={(id) => select(id)}
                label={
                  focused
                    ? `Globe turned to ${focused.person.name}'s companies: ${focused.companies.reduce((n, c) => n + c.sites.length, 0)} places. Details follow.`
                    : `Globe of ${places} company places for ${empires.length} people. Details follow.`
                }
              />
              {simOn && sim && <SimOverlay notes={film.notes} tick={tick} length={film.length} month={month} start={sim.run_date ?? null} playing={playing} onPlay={playPause} onScrub={scrub} ending={frames[frames.length - 1] ?? null} months={sim.months} title={sim.title} money={money.format} score={score} finalScore={finalScore} quiet={sim.origin === 'dials' && !playing} guess={guess} asking={asking} onGuess={onGuess} verdict={verdict} onShare={onShare} followUps={followUps} onContinue={continueWith} replays={replays} onReplay={replay} mine={mineEnd} />}
              <Caption style={styles.globeNote}>
                {view === 'places'
                  ? 'Drag to turn. Places from Wikidata; brighter, quicker rings mean the company’s share price moved in the last 30 minutes.'
                  : view === 'money'
                    ? 'Drag to turn. Lines carry reported revenue from where it’s earned to headquarters; thicker means more.'
                    : view === 'economies'
                      ? econ === 'fortune'
                        ? 'Drag to turn. Shaded countries have a yearly GDP smaller than the fortune.'
                        : 'Drag to turn. Darker countries: more of the tracked companies’ revenue compared with that country’s GDP.'
                      : 'Drag to turn. Hypothetical: the place in red and the revenue that flows from it.'}
              </Caption>
            </Surface>
            )}
            <View ref={details} style={[styles.panel, styles.details, desktop && styles.panelWide]}>
              {view === 'money' ? (
                <MoneyPanel lines={lines} focus={focused} />
              ) : view === 'economies' ? (
                <EconomiesPanel lines={lines} countries={world.countries ?? []} empires={empires} focus={focused} mode={econ} onMode={setEcon} onSelect={show} />
              ) : view === 'whatif' ? (
                <Surface style={styles.simCard}>
                  <View style={styles.headRow}>
                    <Heading level={2}>What if.</Heading>
                    <Caption>Hypothetical</Caption>
                  </View>
                  <SimulatePanel
                    scenarios={scenarios}
                    scenario={sim}
                    onPick={pick}
                    onAsk={ask}
                    mode={panel}
                    score={game}
                    challengeId={challenge?.id ?? null}
                    mostAsked={mostAsked.data ?? []}
                    brief={
                      <BriefingPanel
                        nameOf={(slug) => empires.find((e) => e.person.slug === slug)?.person.name ?? slug}
                        items={briefItems}
                        sample={!daily.data?.length}
                        live={liveOdds.data ?? new Map()}
                        date={daily.data?.[0]?.run_date ?? null}
                        money={money.format}
                        onWatch={pick}
                      />
                    }
                    you={<MineEditor holdings={mine} companies={ownable} onChange={saveMine} money={money.format} />}
                    onMode={(m) => {
                      setPanel(m);
                      if (m === 'dials') turnDials(dials);
                    }}
                    versus={<VersusPicker people={fighters} suggested={matchups} onFight={fight} onGrok={fightGrok} />}
                    dials={<DialsPanel values={dials} onChange={turnDials} result={frames[frames.length - 1] ?? null} money={money.format} names={sectorNames} mine={mineEnd} />}
                  />
                </Surface>
              ) : focused ? (
                <EmpirePanel empire={focused} onClear={() => select(null)} />
              ) : (
                <Overview empires={empires} people={people.data ?? []} places={places} onSelect={show} />
              )}
              {planet && (
                <Caption style={styles.planetNote}>
                  {view === 'places'
                    ? 'Drag the globe to turn it; pinch or use + and − to zoom. Each portrait shows the change since that person’s previous recorded value; when portraits crowd, the biggest mover leads the bubble: tap it to fan them out, and tap a portrait for the profile. Dots are real company places from Wikidata; green ones moved in the last 30 minutes.'
                    : view === 'money'
                      ? 'Drag the globe to turn it; pinch to zoom. Lines carry reported revenue from where it’s earned to headquarters; thicker means more.'
                      : view === 'economies'
                        ? econ === 'fortune'
                          ? 'Drag the globe to turn it; pinch to zoom. Lit countries have a yearly GDP smaller than the fortune.'
                          : 'Drag the globe to turn it; pinch to zoom. Brighter countries: more of the tracked companies’ revenue compared with that country’s GDP.'
                        : 'Drag the globe to turn it; pinch to zoom. Hypothetical: shaded countries are where business falls (red) or grows (green); dashed portraits with ≈ show projected changes, never recorded ones.'}
                </Caption>
              )}
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}

function mainQuote(e: Empire) {
  return e.companies.find((c) => c.quote?.prev_close)?.quote ?? null;
}

function Chip({ label, selected, onPress, empire }: { label: string; selected: boolean; onPress: () => void; empire?: Empire }) {
  const q = empire ? mainQuote(empire) : null;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}>
      {empire && <Portrait uri={empire.person.portrait_url} name={empire.person.name} size={26} />}
      <Text style={[type.headline, { color: selected ? color.action : color.text, fontSize: 15 }]}>{label}</Text>
      {q?.prev_close ? <Change delta={q.price - q.prev_close} base={q.prev_close} size={13} compact /> : null}
    </Pressable>
  );
}

/** Everyone: the day's movers (counts, biggest gains and drops), then the companies on the map ranked by revenue. */
function Overview({ empires, people, places, onSelect }: { empires: Empire[]; people: Person[]; places: number; onSelect: (id: string) => void }) {
  const money = useMoney();
  const countries = new Set(empires.flatMap((e) => e.companies.flatMap((c) => c.sites.map((s) => s.country).filter(Boolean)))).size;
  const t = today(people);
  const since = (t.gains[0] ?? t.drops[0])?.person.prev_as_of ?? null;
  const onMap = new Set(empires.map((e) => e.person.id));
  // On the globe: turn to them; otherwise (no company places recorded) open the profile.
  const pick = (p: Person) => (onMap.has(p.id) ? onSelect(p.id) : router.push(`/person/${p.slug}`));
    const board = companyBoard(empires.map((e) => ({ owner: e, companies: e.companies })));
  return (
    <>
      {t.up + t.down > 0 && (
        <Surface style={styles.panelCard}>
          <View style={styles.headRow}>
            <Heading level={2}>Today.</Heading>
            {since && <Caption>since {formatDate(since)}</Caption>}
          </View>
          <View style={styles.tally} accessible accessibilityLabel={`${t.up} up, ${t.down} down`}>
            <Text style={[type.title, styles.figure, styles.tallyText, { color: color.gain }]}>▲ {t.up} up</Text>
            <Text style={[type.title, styles.figure, styles.tallyText, { color: color.loss }]}>▼ {t.down} down</Text>
          </View>
          <View style={styles.list}>
            {[...t.gains, ...t.drops].map((m, i) => (
              <Pressable
                key={m.person.id}
                accessibilityRole="button"
                accessibilityLabel={`${m.person.name}, ${m.delta > 0 ? 'up' : 'down'} ${money.format(Math.abs(m.delta))}. ${onMap.has(m.person.id) ? 'Show on the globe' : 'Open profile'}`}
                onPress={() => pick(m.person)}
                style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && styles.pressedRow]}>
                <Portrait uri={m.person.portrait_url} name={m.person.name} size={36} />
                <Text style={[type.headline, styles.flex, { color: color.text }]} numberOfLines={2}>
                  {m.person.name.replace(/ & family$/, '')}
                </Text>
                <Change delta={m.delta} base={m.base} size={13} />
              </Pressable>
            ))}
          </View>
        </Surface>
      )}
      <Surface style={styles.panelCard}>
        <Heading level={2}>Companies on the map.</Heading>
        <Text style={[type.title, styles.figure]}>
          {places} places in {countries} countries
        </Text>
        <Body secondary>Ranked by the yearly revenue each company reports, counted once however many owners we track. Choose one to follow its owner round the globe.</Body>
        <View style={styles.list}>
          {board.map(({ company: c, owners, revenue, places: n }, i) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={`Number ${i + 1}, ${c.name}: ${revenue ? `${usd(revenue)} revenue, ` : ''}${n} ${n === 1 ? 'place' : 'places'}. Owners: ${owners.map((o) => o.person.name).join(', ')}. Follow`}
              onPress={() => onSelect(owners[0].person.id)}
              style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && styles.pressedRow]}>
              <View style={[styles.place, i < 3 && metal(i + 1)]}>
                <Text style={[type.number, { fontSize: 13, color: i < 3 ? '#FFFFFF' : color.text }]}>{i + 1}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={[type.headline, { color: color.text }]} numberOfLines={1}>
                  {c.name}
                </Text>
                <Caption numberOfLines={1}>{owners.map((o) => o.person.name.replace(/ & family$/, '')).join(', ')}</Caption>
                <View style={styles.tags}>
                  {revenue > 0 && (
                    <Tag size="sm" variant="soft" color="default">
                      <Tag.Label>{usd(revenue)}/yr</Tag.Label>
                    </Tag>
                  )}
                  <Tag size="sm" variant="soft" color="default">
                    <Tag.Label>
                      {n} {n === 1 ? 'place' : 'places'}
                    </Tag.Label>
                  </Tag>
                </View>
              </View>
              <View style={styles.owners}>
                {owners.slice(0, 3).map((o, k) => (
                  <View key={o.person.id} style={k > 0 && styles.ownerOverlap}>
                    <Portrait uri={o.person.portrait_url} name={o.person.name} size={30} />
                  </View>
                ))}
              </View>
            </Pressable>
          ))}
        </View>
      </Surface>
    </>
  );
}

function EmpirePanel({ empire, onClear }: { empire: Empire; onClear: () => void }) {
  const all = empire.companies.flatMap((c) => c.sites);
  const countries = new Set(all.map((s) => s.country).filter(Boolean)).size;
  const move = moves([empire.person])[0];
  return (
    <Surface style={styles.panelCard}>
      <Pressable accessibilityRole="button" onPress={onClear} hitSlop={8} style={styles.source}>
        <Caption style={{ color: color.action }}>‹ Everyone</Caption>
      </Pressable>
      <View style={styles.who}>
        <Portrait uri={empire.person.portrait_url} name={empire.person.name} size={56} rounded={16} />
        <View style={styles.flex}>
          <Text style={[type.title, { color: color.text }]}>{empire.person.name}</Text>
          <Caption>
            {all.length} {all.length === 1 ? 'place' : 'places'} in {countries} {countries === 1 ? 'country' : 'countries'}
          </Caption>
          {move && <Change delta={move.delta} base={move.base} size={14} />}
        </View>
      </View>
      <Link href={`/person/${empire.person.slug}`} style={styles.link}>
        Open profile
      </Link>
      {empire.companies.map((c) => (
        <Fragment key={c.id}>
          <View style={styles.rule} />
          <CompanySection company={c} stake={empire.stakes.find((s) => s.company.id === c.id)} worth={empire.person.net_worth_usd} />
        </Fragment>
      ))}
    </Surface>
  );
}

function CompanySection({ company: c, stake, worth }: { company: CompanyView; stake?: Stake; worth: number | null }) {
  const q = c.quote;
  const kinds = new Map<SiteKind, CompanyView['sites']>();
  for (const s of c.sites) kinds.set(s.kind, [...(kinds.get(s.kind) ?? []), s]);
  return (
    <View style={styles.company}>
      <View style={styles.companyHead}>
        <View style={styles.companyName}>
          <Text style={[type.headline, { color: color.text }]}>{c.name}</Text>
          <Caption>{c.is_private ? 'Private company' : c.ticker}</Caption>
        </View>
        {q?.prev_close ? (
          <View style={styles.price}>
            <Change delta={q.price - q.prev_close} base={q.prev_close} size={15} compact />
            <Caption style={styles.priceTime}>
              {isLive(q) ? 'Today, ' : 'Last price, '}
              {formatTime(q.as_of)} {isLive(q) ? '' : formatDate(q.as_of)}
            </Caption>
          </View>
        ) : null}
      </View>

      {stake ? (
        <View style={styles.block} accessible>
          <Text style={[type.body, { color: color.text }]}>
            {formatShares(stake.shares)} shares{stake.value ? ` · ${usd(stake.value)} at the latest price` : ''}
            {stake.value && worth ? ` · ${Math.round((stake.value / worth) * 100)}% of the fortune` : ''}
          </Text>
          <SourceLink label={stake.label ?? 'SEC filing'} url={stake.url} />
        </View>
      ) : null}

      {c.regions.length ? (
        <View style={styles.block}>
          <Caption>Revenue by place, fiscal {c.regions[0].fiscal_year}</Caption>
          {c.regions.map((r) => (
            <View key={r.region} style={styles.share} accessible accessibilityLabel={`${r.region}: ${Math.round(r.share * 100)} percent of revenue`}>
              <Text style={[type.body, styles.flex, { color: color.text }]} numberOfLines={2}>
                {r.region}
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { width: `${Math.max(r.share * 100, 2)}%` }]} />
              </View>
              <Text style={[type.number, styles.pct, { color: color.text }]}>{Math.round(r.share * 100)}%</Text>
            </View>
          ))}
          <SourceLink label={c.regions[0].source_label} url={c.regions[0].source_url} />
        </View>
      ) : (
        <Caption style={styles.block}>
          {c.is_private ? 'Private company: no public filings break down its revenue.' : 'Its annual report doesn’t break revenue down by place.'}
        </Caption>
      )}

      {c.sites.length ? (
        <View style={styles.block}>
          {[...kinds].map(([kind, list]) => (
            <Body key={kind}>
              <Text style={{ fontFamily: type.headline.fontFamily }}>{KIND[kind][list.length === 1 ? 0 : 1]}: </Text>
              {list
                .slice(0, 6)
                .map((s) => (kind === 'hq' ? (s.city ?? s.name) : s.country ? `${s.name} (${country(s.country)})` : s.name))
                .join(', ')}
              {list.length > 6 ? `, and ${list.length - 6} more` : ''}
            </Body>
          ))}
          <SourceLink label="Places from Wikidata" url={c.source_url} />
        </View>
      ) : null}

      {c.subsidiaries > 0 && <SourceLink label={`${c.subsidiaries} subsidiaries listed in its annual report`} url={c.subsidiariesUrl} />}
    </View>
  );
}

function SourceLink({ label, url }: { label: string; url: string | null }) {
  return url ? (
    <Pressable accessibilityRole="link" onPress={() => open(url)} style={styles.source}>
      <Caption style={{ color: color.action }}>{label}</Caption>
    </Pressable>
  ) : (
    <Caption>{label}</Caption>
  );
}

const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Web: a pill under the globe saying there's more below. A soft double glow every 5 s, three times, then still; tap to
 * bring the details up (the page scrolls normally from here, since the globe itself keeps every drag for turning).
 */
function MoreHandle({ target }: { target: RefObject<ComponentRef<typeof View> | null> }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Show details"
      accessibilityHint="Scrolls the details below the globe into view"
      onPress={() => (target.current as unknown as HTMLElement | null)?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })}
      hitSlop={8}
      style={styles.handleHit}>
      {({ pressed }) => <View style={[styles.handle, !reduceMotion && styles.handlePulse, pressed && styles.pressed]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  handleHit: { alignSelf: 'center', minWidth: 96, minHeight: minTouch, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 44, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  // Two quick glows, then rest until the next 5 s beat; three beats, starting after a moment.
  handlePulse: {
    animationKeyframes: [
      {
        '0%, 24%, 100%': { boxShadow: '0 0 0 0 rgba(108,184,255,0)', backgroundColor: 'rgba(255,255,255,0.55)' },
        '6%, 18%': { boxShadow: '0 0 14px 4px rgba(108,184,255,0.55)', backgroundColor: 'rgba(255,255,255,0.95)' },
        '12%': { boxShadow: '0 0 4px 1px rgba(108,184,255,0.2)', backgroundColor: 'rgba(255,255,255,0.7)' },
      },
    ],
    animationDuration: '5s',
    animationDelay: '1.5s',
    animationIterationCount: 3,
    animationTimingFunction: 'ease-in-out',
  } as object,
  // Clear of the ticker when scrolled to.
  details: { scrollMarginTop: 72 } as object,
  planetNote: { maxWidth: 520 },
  flex: { flex: 1, minWidth: 0 },
  // Four equal segments across the width, so they fit a 320px phone; capped on desktop.
  chips: { gap: space.sm, paddingVertical: 2 },
  // Controls above the globe's portraits, frosted where a portrait passes under them (web).
  above: { zIndex: 1 },
  // Four equal segments across the width, so they fit a 320px phone; capped on desktop.
  segments: { flexDirection: 'row', alignSelf: 'stretch', maxWidth: 520, padding: 3, borderRadius: radius.pill, backgroundColor: color.fill, zIndex: 1, ...({ backdropFilter: glass.backdrop, WebkitBackdropFilter: glass.backdrop } as object) },
  segment: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: radius.pill },
  segmentOn: { backgroundColor: color.surface },
  chip: {
    minHeight: minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.sm,
    paddingRight: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.fill,
    ...({ backdropFilter: glass.backdrop, WebkitBackdropFilter: glass.backdrop } as object),
  },
  chipOn: { backgroundColor: color.actionTint },
  pressed: { opacity: 0.75 },
  layout: { gap: space.lg },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  globeCard: { padding: space.md, gap: space.md },
  // No card: the planet behind the page is the globe; the area is just where it sits and where gestures land.
  planetArea: { gap: space.sm },
  globeBox: { position: 'relative' },
  simCard: { padding: space.lg, gap: space.md },
  // Desktop: the globe takes the larger column; it sized to its content before and sat in a narrow strip.
  planetWide: { flex: 3, minWidth: 0 },
  globeCardWide: { padding: space.lg },
  globeNote: { textAlign: 'center', maxWidth: 420, alignSelf: 'center' },
  panel: { gap: space.lg },
  panelWide: { flex: 2, minWidth: 0 },
  panelCard: { padding: space.lg, gap: space.md },
  figure: { color: color.text, fontVariant: ['tabular-nums'] },
  list: { marginHorizontal: -space.lg },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.hairline },
  pressedRow: { backgroundColor: color.fill },
  place: { width: 26, height: 26, borderRadius: 13, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
  tally: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  tallyText: { fontSize: 22, lineHeight: 28 },
  owners: { flexDirection: 'row' },
  ownerOverlap: { marginLeft: -10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  link: { ...type.headline, color: color.action, alignSelf: 'flex-start', paddingVertical: space.sm },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  company: { gap: space.md },
  companyHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  // The name keeps its room on narrow phones; the price time wraps instead.
  companyName: { flexGrow: 1, flexShrink: 0, minWidth: 96, maxWidth: '50%' },
  price: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 },
  priceTime: { textAlign: 'right' },
  block: { gap: space.sm },
  share: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barTrack: { width: 56, height: 6, borderRadius: 3, backgroundColor: color.fill, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: color.text },
  pct: { width: 44, textAlign: 'right', fontSize: 15 },
  source: { alignSelf: 'flex-start', minHeight: minTouch, justifyContent: 'center' },
});
