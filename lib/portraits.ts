export type Portrait = {
  imageUrl: string;
  filePage: string;
  author: string;
  license: string;
  licenseUrl: string;
};
const commons = 'https://commons.wikimedia.org/wiki/File:';
const thumb = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/';
function portrait(
  path: string,
  file: string,
  author: string,
  license: string,
  licenseUrl: string,
): Portrait {
  return {
    imageUrl: `${thumb}${path}/960px-${file}`,
    filePage: `${commons}${file}`,
    author,
    license,
    licenseUrl,
  };
}
export const portraits: Record<string, Portrait> = {
  'elon-musk': portrait(
    '5/5e/Elon_Musk_-_54820081119_%28cropped%29.jpg',
    'Elon_Musk_-_54820081119_%28cropped%29.jpg',
    'Gage Skidmore',
    'CC BY-SA 4.0',
    'https://creativecommons.org/licenses/by-sa/4.0/',
  ),
  'jeff-bezos': portrait(
    'f/fc/260202-D-PM193-2205_SECWAR_Arsenal_of_Freedom_Tour_-_Florida_%283x4_cropped_on_Bezos_and_rotated%29.jpg',
    '260202-D-PM193-2205_SECWAR_Arsenal_of_Freedom_Tour_-_Florida_%283x4_cropped_on_Bezos_and_rotated%29.jpg',
    'SECWAR',
    'Public domain',
    'https://commons.wikimedia.org/wiki/Commons:Copyright_rules_by_territory/United_States#Federal_works',
  ),
  'larry-page': portrait(
    '2/2a/Larry_Page_in_the_European_Parliament%2C_17.06.2009_%28cropped_2%29.jpg',
    'Larry_Page_in_the_European_Parliament%2C_17.06.2009_%28cropped_2%29.jpg',
    'Stansfield PL',
    'CC BY-SA 3.0',
    'https://creativecommons.org/licenses/by-sa/3.0/',
  ),
  'michael-dell': portrait(
    'd/d0/Michael_Dell_%2852548152888%29_%28cropped%29.jpg',
    'Michael_Dell_%2852548152888%29_%28cropped%29.jpg',
    'Village Global',
    'CC BY 2.0',
    'https://creativecommons.org/licenses/by/2.0/',
  ),
  'sergey-brin': portrait(
    '1/12/Sergey_Brin_DC_Summit_2026_%28cropped%29.jpg',
    'Sergey_Brin_DC_Summit_2026_%28cropped%29.jpg',
    'The White House',
    'Public domain',
    'https://commons.wikimedia.org/wiki/Commons:Copyright_rules_by_territory/United_States#Federal_works',
  ),
  'mark-zuckerberg': portrait(
    '1/12/P20260929DT-1655_%2855561811540%29_%28cropped_2%29.jpg',
    'P20260929DT-1655_%2855561811540%29_%28cropped_2%29.jpg',
    'The White House',
    'Public domain',
    'https://commons.wikimedia.org/wiki/Commons:Copyright_rules_by_territory/United_States#Federal_works',
  ),
  'jensen-huang': portrait(
    'e/e6/Jen-Hsun_Huang_2025.jpg',
    'Jen-Hsun_Huang_2025.jpg',
    'The White House',
    'Public domain',
    'https://commons.wikimedia.org/wiki/Commons:Copyright_rules_by_territory/United_States#Federal_works',
  ),
  'larry-ellison': portrait(
    '4/47/Larry_Ellison_2016.png',
    'Larry_Ellison_2016.png',
    'Oracle PR Hartmann Studios',
    'CC BY 2.0',
    'https://creativecommons.org/licenses/by/2.0/',
  ),
  'steve-ballmer': portrait(
    '5/54/Steve_ballmer_2007_outdoors2-2.jpg',
    'Steve_ballmer_2007_outdoors2-2.jpg',
    'Martin Olsson',
    'CC BY-SA 2.5',
    'https://creativecommons.org/licenses/by-sa/2.5/',
  ),
  'warren-buffett': portrait(
    'd/d4/Warren_Buffett_at_the_2015_SelectUSA_Investment_Summit_%28cropped%29.jpg',
    'Warren_Buffett_at_the_2015_SelectUSA_Investment_Summit_%28cropped%29.jpg',
    'USA International Trade Administration',
    'Public domain',
    'https://commons.wikimedia.org/wiki/Commons:Copyright_rules_by_territory/United_States#Federal_works',
  ),
};
