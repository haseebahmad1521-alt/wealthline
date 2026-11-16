// iOS/Android, until the native planet lands: the SVG globe (d3-geo + react-native-svg) in World's globe area.
import { Globe, type GlobeArc, type GlobeFill, type GlobeMarker, type GlobePulse, type GlobeSite } from '@/components/globe';

export function WorldGlobe({
  height,
  markers,
  sites,
  arcs,
  fills,
  pulses,
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
  pulses?: GlobePulse[];
  /** Web only for now: the SVG globe turns to `center` without zooming. */
  zoomTo?: number | null;
  focus: string | null;
  center: { lat: number; lng: number } | null;
  onSelect: (id: string | null) => void;
  /** Web only for now: a portrait tap opens the profile there; the SVG globe keeps tap-to-choose. */
  onOpen: (id: string) => void;
  label: string;
}) {
  return <Globe size={height} sites={sites} markers={markers} arcs={arcs} fills={fills} pulses={pulses} focus={focus} center={center} onSelect={onSelect} label={label} />;
}
