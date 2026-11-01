// iOS/Android, until the native planet lands: the SVG globe (d3-geo + react-native-svg) in World's globe area.
import { Globe, type GlobeMarker, type GlobeSite } from '@/components/globe';

export function WorldGlobe({
  height,
  markers,
  sites,
  focus,
  center,
  onSelect,
  label,
}: {
  height: number;
  markers: GlobeMarker[];
  sites: GlobeSite[];
  focus: string | null;
  center: { lat: number; lng: number } | null;
  onSelect: (id: string | null) => void;
  label: string;
}) {
  return <Globe size={height} sites={sites} markers={markers} focus={focus} center={center} onSelect={onSelect} label={label} />;
}
