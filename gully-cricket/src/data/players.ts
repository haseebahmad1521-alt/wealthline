import type { Region } from './cities';

export const PAKISTANI_NAMES = [
  'Ali', 'Hamza', 'Bilal', 'Usman', 'Zain', 'Fahad', 'Saad', 'Asad', 'Umer',
  'Hassan', 'Danish', 'Waqas', 'Junaid', 'Faizan', 'Taimoor', 'Arslan',
  'Sheraz', 'Kashif', 'Ahmed', 'Haris', 'Shahzaib', 'Rizwan', 'Talha', 'Noman',
  'Billu', 'Gogi', 'Mithu', 'Chhotu',
];

export const INDIAN_NAMES = [
  'Rahul', 'Rohit', 'Arjun', 'Aman', 'Vikram', 'Karan', 'Rohan', 'Aditya',
  'Siddharth', 'Vivek', 'Raju', 'Sameer', 'Nikhil', 'Pranav', 'Abhishek',
  'Deepak', 'Manish', 'Gaurav', 'Ankit', 'Harsh', 'Imran', 'Faraz', 'Sunny',
  'Bunty', 'Golu', 'Pappu', 'Monu',
];

export function namesFor(region: Region): string[] {
  if (region === 'pakistan') return PAKISTANI_NAMES;
  if (region === 'india') return INDIAN_NAMES;
  return [...PAKISTANI_NAMES, ...INDIAN_NAMES];
}

export type OutfitKind = 'pantshirt' | 'tshirt' | 'jersey' | 'shalwar' | 'kurta' | 'vest';

export const OUTFIT_LABEL: Record<OutfitKind, string> = {
  pantshirt: 'Pant shirt',
  tshirt: 'T-shirt & jeans',
  jersey: 'Fan jersey',
  shalwar: 'Shalwar kameez',
  kurta: 'Kurta pajama',
  vest: 'Baniyan & shorts',
};

export type Build = 'kid' | 'teen' | 'uncle';
export type HairStyle = 'messy' | 'spiky' | 'side' | 'curly' | 'buzz';
export type Footwear = 'chappal' | 'sneaker' | 'barefoot';
export type Headwear = 'none' | 'topi' | 'cap' | 'capBack' | 'headband';
export type Bottom = 'pants' | 'jeans' | 'track' | 'shorts' | 'shalwar' | 'pajama';

export interface Outfit {
  kind: OutfitKind;
  build: Build;
  top: string;
  /** Collar, stripes or trim. */
  accent: string;
  bottom: string;
  bottomKind: Bottom;
  tucked: boolean;
  sleeves: 'full' | 'rolled' | 'short' | 'none';
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  headwear: Headwear;
  footwear: Footwear;
  shoe: string;
  moustache: boolean;
  beard: boolean;
}

const SHIRTS = ['#F4F4F0', '#A9C6E8', '#E8D3A9', '#D88C8C', '#8FB996', '#F2E2C4', '#C9D6F0', '#E6B8A2'];
const TEES = ['#E63946', '#1D3557', '#2A9D8F', '#F4A261', '#264653', '#FFB703', '#6A4C93', '#F1FAEE'];
const KAMEEZ = ['#F4F1EA', '#BFD7EA', '#D9C7A7', '#9DB8A0', '#3E4A61', '#C9B7D8', '#7A8B99'];
const KURTA = ['#FFF8E7', '#F5C36B', '#E07A5F', '#81B29A', '#F2CC8F'];
const PANTS = ['#2B2D42', '#4A4E69', '#6B705C', '#3D405B', '#A47E54', '#8C6E4B'];
const JEANS = ['#33415C', '#4B6584', '#2F3E46', '#5A7BA6'];
const SKINS = ['#C68B59', '#B87A4B', '#A86B3C', '#D29C6E', '#8D5524', '#E0AC7E'];
const HAIRS = ['#1B1B1B', '#2B1D14', '#3B2A20', '#241A12'];
const SHOES = ['#C1272D', '#F2F2F2', '#1D3557', '#3A3A3A', '#2A9D8F'];

/** Green for Pakistan fans, blue for India, either in the neutral gully. */
function jerseyColors(region: Region | undefined, rand: () => number): [string, string] {
  const pk: [string, string] = ['#1E8C45', '#C8E64A'];
  const ind: [string, string] = ['#2D6CDF', '#F28C28'];
  if (region === 'pakistan') return pk;
  if (region === 'india') return ind;
  return rand() < 0.5 ? pk : ind;
}

export function makeOutfit(
  kind: OutfitKind,
  rand: () => number = Math.random,
  opts: { region?: Region; build?: Build } = {},
): Outfit {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const build: Build = opts.build ?? (rand() < 0.35 ? 'kid' : 'teen');
  let top = pick(SHIRTS);
  let accent = '#FFFFFF';
  let bottomKind: Bottom = 'pants';
  let bottom = pick(PANTS);
  let sleeves: Outfit['sleeves'] = rand() < 0.6 ? 'rolled' : 'full';
  let tucked = false;

  switch (kind) {
    case 'pantshirt':
      tucked = rand() < 0.3;
      bottomKind = rand() < 0.4 ? 'jeans' : 'pants';
      bottom = bottomKind === 'jeans' ? pick(JEANS) : pick(PANTS);
      accent = top;
      break;
    case 'tshirt':
      top = pick(TEES);
      accent = top;
      sleeves = 'short';
      bottomKind = build === 'kid' && rand() < 0.5 ? 'shorts' : rand() < 0.5 ? 'jeans' : 'track';
      bottom = bottomKind === 'jeans' ? pick(JEANS) : bottomKind === 'track' ? pick(['#2B2D42', '#1D3557', '#3A3A3A']) : pick(['#33415C', '#A47E54', '#2F3E46']);
      break;
    case 'jersey': {
      const [c, a] = jerseyColors(opts.region, rand);
      top = c;
      accent = a;
      sleeves = 'short';
      bottomKind = rand() < 0.5 ? 'track' : 'jeans';
      bottom = bottomKind === 'track' ? pick(['#2B2D42', '#1D3557']) : pick(JEANS);
      break;
    }
    case 'shalwar':
      top = pick(KAMEEZ);
      accent = top;
      bottom = top;
      bottomKind = 'shalwar';
      break;
    case 'kurta':
      top = pick(KURTA);
      accent = top;
      bottom = pick(['#FFFFFF', '#F1EDE4']);
      bottomKind = 'pajama';
      break;
    case 'vest':
      top = '#F7F7F2';
      accent = top;
      sleeves = 'none';
      bottomKind = 'shorts';
      bottom = pick(['#33415C', '#A47E54', '#2B2D42', '#6B705C']);
      break;
  }

  const style: HairStyle = pick(['messy', 'messy', 'spiky', 'side', 'curly', 'buzz'] as const);
  const roll = rand();
  const headwear: Headwear =
    kind === 'shalwar' && roll < 0.25 ? 'topi' : roll > 0.86 ? 'capBack' : roll > 0.76 ? 'cap' : 'none';
  const footwear: Footwear = rand() < (kind === 'shalwar' || kind === 'kurta' || kind === 'vest' ? 0.75 : 0.35) ? 'chappal' : rand() < 0.06 ? 'barefoot' : 'sneaker';
  return {
    kind,
    build,
    top,
    accent,
    bottom,
    bottomKind,
    tucked,
    sleeves,
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hairStyle: build === 'uncle' && rand() < 0.5 ? 'side' : style,
    headwear,
    footwear,
    shoe: footwear === 'chappal' ? pick(['#5B3A22', '#2B2B2B', '#1D5FA8']) : pick(SHOES),
    moustache: build === 'uncle' || (build === 'teen' && rand() < 0.12),
    beard: build === 'uncle' && rand() < 0.45,
  };
}

export function randomOutfitKind(region: Region, rand: () => number = Math.random): OutfitKind {
  const pool: OutfitKind[] =
    region === 'pakistan'
      ? ['pantshirt', 'pantshirt', 'tshirt', 'tshirt', 'jersey', 'shalwar', 'shalwar', 'vest']
      : region === 'india'
        ? ['pantshirt', 'pantshirt', 'tshirt', 'tshirt', 'jersey', 'kurta', 'vest']
        : ['pantshirt', 'tshirt', 'tshirt', 'jersey', 'shalwar', 'kurta'];
  return pool[Math.floor(rand() * pool.length)];
}
