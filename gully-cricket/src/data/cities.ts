export type Region = 'pakistan' | 'india' | 'neutral';

export type StreetStyle =
  | 'haveli'
  | 'apartment'
  | 'tiles'
  | 'chawl'
  | 'oldcity'
  | 'colonial'
  | 'deccan'
  | 'gulf';

export type Landmark =
  | 'minar'
  | 'mazar'
  | 'tomb'
  | 'towers'
  | 'masjid'
  | 'bridge'
  | 'charminar'
  | 'burj';

export interface City {
  id: string;
  name: string;
  area: string;
  region: Region;
  style: StreetStyle;
  landmark: Landmark;
  tagline: string;
  /** Runs per legal ball the chasing batter needs. */
  runRate: number;
  /** 1 = easy, 3 = hard. Affects pace and timing window. */
  difficulty: 1 | 2 | 3;
  hasKite: boolean;
  palette: {
    skyTop: string;
    skyBottom: string;
    haze: string;
    road: string;
    roadEdge: string;
    pitch: string;
    walls: string[];
    trim: string;
    window: string;
    accent: string;
  };
}

export const CITIES: City[] = [
  {
    id: 'lahore',
    name: 'Lahore',
    area: 'Androon Shehr, Walled City',
    region: 'pakistan',
    style: 'haveli',
    landmark: 'minar',
    tagline: 'Brick havelis, wooden jharokas and patang in the sky.',
    runRate: 1.7,
    difficulty: 1,
    hasKite: true,
    palette: {
      skyTop: '#3E87D8',
      skyBottom: '#FFD9A0',
      haze: '#E9B98A',
      road: '#8C7B6B',
      roadEdge: '#6E5E50',
      pitch: '#A99683',
      walls: ['#E58A9A', '#2FB7A6', '#F2C14E', '#C8553D', '#F4EDE0', '#E07A5F'],
      trim: '#5B3A1E',
      window: '#3A2416',
      accent: '#2E7D4F',
    },
  },
  {
    id: 'karachi',
    name: 'Karachi',
    area: 'Nazimabad, Block 3',
    region: 'pakistan',
    style: 'apartment',
    landmark: 'mazar',
    tagline: 'Pastel flats, black water tanks and sea breeze.',
    runRate: 1.85,
    difficulty: 2,
    hasKite: false,
    palette: {
      skyTop: '#4C9BE0',
      skyBottom: '#E3F1F6',
      haze: '#BFD9E4',
      road: '#77736E',
      roadEdge: '#5D5954',
      pitch: '#94908A',
      walls: ['#8FD3C8', '#F6D06F', '#F2A7B5', '#F4EDE0', '#7FB7E6'],
      trim: '#6F6A60',
      window: '#2F3B42',
      accent: '#1F6E8C',
    },
  },
  {
    id: 'multan',
    name: 'Multan',
    area: 'Hussain Agahi Bazaar',
    region: 'pakistan',
    style: 'tiles',
    landmark: 'tomb',
    tagline: 'Garmi, gard aur neeli kashi tiles.',
    runRate: 1.6,
    difficulty: 1,
    hasKite: false,
    palette: {
      skyTop: '#4A8FD6',
      skyBottom: '#FFE2B0',
      haze: '#EBC796',
      road: '#A08B70',
      roadEdge: '#7F6C55',
      pitch: '#B9A486',
      walls: ['#E9D8B6', '#3A86C8', '#F2C14E', '#E58A9A', '#F4EDE0'],
      trim: '#1F5FA8',
      window: '#2D2A26',
      accent: '#1F5FA8',
    },
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    area: 'Dadar Chawl Lane',
    region: 'india',
    style: 'chawl',
    landmark: 'towers',
    tagline: 'Chawl balconies, monsoon clouds, local train noise.',
    runRate: 1.9,
    difficulty: 2,
    hasKite: false,
    palette: {
      skyTop: '#7E96B0',
      skyBottom: '#DCE3EA',
      haze: '#B8C4CF',
      road: '#5F6366',
      roadEdge: '#474B4E',
      pitch: '#7C8084',
      walls: ['#F2C14E', '#5CC8B5', '#F28C6B', '#C7D88A', '#F4EDE0'],
      trim: '#3E6B5A',
      window: '#26323A',
      accent: '#D64545',
    },
  },
  {
    id: 'delhi',
    name: 'Delhi',
    area: 'Chandni Chowk Galli',
    region: 'india',
    style: 'oldcity',
    landmark: 'masjid',
    tagline: 'Wires everywhere, shop shutters and kites on Sunday.',
    runRate: 1.8,
    difficulty: 2,
    hasKite: true,
    palette: {
      skyTop: '#5A92D0',
      skyBottom: '#FBD9B8',
      haze: '#E3BFA5',
      road: '#7E7369',
      roadEdge: '#61574E',
      pitch: '#9A8E82',
      walls: ['#E58A9A', '#F2B04E', '#2FB7A6', '#D98E6A', '#F4EDE0'],
      trim: '#4E3B2F',
      window: '#2E241E',
      accent: '#E2A400',
    },
  },
  {
    id: 'kolkata',
    name: 'Kolkata',
    area: 'Shyambazar Para',
    region: 'india',
    style: 'colonial',
    landmark: 'bridge',
    tagline: 'Old yellow houses, green shutters, para adda.',
    runRate: 1.7,
    difficulty: 1,
    hasKite: false,
    palette: {
      skyTop: '#5B9AD2',
      skyBottom: '#F2EEDC',
      haze: '#C9D3CE',
      road: '#6E6A62',
      roadEdge: '#55524B',
      pitch: '#8C887F',
      walls: ['#F2C14E', '#E7B85A', '#E58A9A', '#9ED0A0', '#F4EDE0'],
      trim: '#2F6B45',
      window: '#2E5A3E',
      accent: '#F4D35E',
    },
  },
  {
    id: 'hyderabad',
    name: 'Hyderabad',
    area: 'Old City, near Laad Bazaar',
    region: 'india',
    style: 'deccan',
    landmark: 'charminar',
    tagline: 'Bangles, biryani smoke and a pink sunset.',
    runRate: 1.85,
    difficulty: 2,
    hasKite: false,
    palette: {
      skyTop: '#6A7FD0',
      skyBottom: '#FFC9B5',
      haze: '#EDB7AE',
      road: '#7D6F68',
      roadEdge: '#61554F',
      pitch: '#9B8C84',
      walls: ['#E58AB0', '#F2C14E', '#5CC8B5', '#E4C9A8', '#F4EDE0'],
      trim: '#7A3E5C',
      window: '#3A2A30',
      accent: '#7A3E5C',
    },
  },
  {
    id: 'dubai',
    name: 'Dubai',
    area: 'Satwa Backstreet (neutral ground)',
    region: 'neutral',
    style: 'gulf',
    landmark: 'burj',
    tagline: 'Friday match — Pakistani and Indian boys, one gully.',
    runRate: 2.0,
    difficulty: 3,
    hasKite: false,
    palette: {
      skyTop: '#3D9BE0',
      skyBottom: '#E2F2FA',
      haze: '#B5DCEC',
      road: '#6B6B6B',
      roadEdge: '#525252',
      pitch: '#8A8A8A',
      walls: ['#F3EBDD', '#E4D6B8', '#F2C14E', '#8FD3C8'],
      trim: '#A08660',
      window: '#3C4E5A',
      accent: '#C1272D',
    },
  },
];

export const REGION_LABEL: Record<Region, string> = {
  pakistan: 'Pakistan',
  india: 'India',
  neutral: 'Neutral',
};

export function cityById(id: string): City {
  return CITIES.find((c) => c.id === id) ?? CITIES[0];
}

export function targetFor(city: City, overs: number): number {
  return Math.max(6, Math.round(city.runRate * overs * 6));
}
