// iOS/Android, until the native planet lands: the SVG globe (d3-geo + react-native-svg) in World's globe area.
import { Globe, type GlobeArc, type GlobeFill, type GlobeMarker, type GlobeSite } from '@/components/globe';

export function WorldGlobe({
  height,
  markers,
  sites,
  arcs,
  fills,
  focus,
  center,
  onSelect,
  label,
}: {
  height: number;
  markers: GlobeMarker[];
  sites: GlobeSite[];
  arcs?: GlobeArc[];
  fills?: GlobeFill[];
  focus: string | null;
  center: { lat: number; lng: number } | null;
  onSelect: (id: string | null) => void;
  /** Web only for now: a portrait tap opens the profile there; the SVG globe keeps tap-to-choose. */
  onOpen: (id: string) => void;
  label: string;
}) {
  return <Globe size={height} sites={sites} markers={markers} arcs={arcs} fills={fills} focus={focus} center={center} onSelect={onSelect} label={label} />;
}
