import type { MutableRefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import type { City } from '../data/cities';
import type { Outfit } from '../data/players';
import type { Live } from '../game/frame';
import { Canvas } from './fiber';
import { GameScene } from './GameScene';

interface Props {
  city: City;
  batterOutfit: Outfit;
  bowlerOutfit: Outfit;
  live?: MutableRefObject<Live>;
}

/** Full-bleed 3D view of the gully. */
export function GullyCanvas(props: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas shadows camera={{ fov: 62, near: 0.1, far: 1200, position: [0.9, 2.0, 3.6] }}>
        <GameScene {...props} />
      </Canvas>
    </View>
  );
}
