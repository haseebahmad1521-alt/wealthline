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

export type OutfitKind = 'shalwar' | 'pantshirt' | 'kurta' | 'tshirt';

export const OUTFIT_LABEL: Record<OutfitKind, string> = {
  shalwar: 'Shalwar kameez',
  pantshirt: 'Pant shirt',
  kurta: 'Kurta pajama',
  tshirt: 'T-shirt & jeans',
};

export interface Outfit {
  kind: OutfitKind;
  top: string;
  bottom: string;
  skin: string;
  hair: string;
  headwear: 'none' | 'topi' | 'cap';
}

const TOPS: Record<OutfitKind, string[]> = {
  shalwar: ['#F4F1EA', '#BFD7EA', '#D9C7A7', '#9DB8A0', '#3E4A61', '#C9B7D8'],
  pantshirt: ['#F2F2F2', '#A9C6E8', '#E8D3A9', '#D88C8C', '#8FB996'],
  kurta: ['#FFF8E7', '#F5C36B', '#E07A5F', '#81B29A', '#F2CC8F'],
  tshirt: ['#E63946', '#1D3557', '#2A9D8F', '#F4A261', '#264653', '#FFB703'],
};

const BOTTOMS: Record<OutfitKind, string[]> = {
  shalwar: [], // shalwar matches the kameez
  pantshirt: ['#2B2D42', '#4A4E69', '#6B705C', '#3D405B'],
  kurta: ['#FFFFFF', '#F1EDE4'],
  tshirt: ['#33415C', '#4B6584', '#2F3E46'],
};

const SKINS = ['#C68B59', '#B87A4B', '#A86B3C', '#D29C6E', '#8D5524'];
const HAIRS = ['#1B1B1B', '#2B1D14', '#3B2A20'];

export function makeOutfit(kind: OutfitKind, rand: () => number = Math.random): Outfit {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const top = pick(TOPS[kind]);
  const bottom = kind === 'shalwar' ? top : pick(BOTTOMS[kind]);
  const roll = rand();
  const headwear = kind === 'shalwar' && roll < 0.3 ? 'topi' : roll > 0.82 ? 'cap' : 'none';
  return { kind, top, bottom, skin: pick(SKINS), hair: pick(HAIRS), headwear };
}

export function randomOutfitKind(region: Region, rand: () => number = Math.random): OutfitKind {
  const pool: OutfitKind[] =
    region === 'pakistan'
      ? ['shalwar', 'shalwar', 'shalwar', 'pantshirt', 'tshirt']
      : region === 'india'
        ? ['kurta', 'pantshirt', 'pantshirt', 'tshirt', 'tshirt']
        : ['shalwar', 'kurta', 'pantshirt', 'tshirt'];
  return pool[Math.floor(rand() * pool.length)];
}
