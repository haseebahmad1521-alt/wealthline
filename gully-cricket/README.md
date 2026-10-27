# Gully Cricket

A small, fun **3D street-cricket game** in the gullies of Pakistan and India,
built with Expo + React Native so it runs on iOS, Android and the web from one
codebase.

You chase a target with a tape ball in a narrow street. Boys play in everyday
clothes, not team kits: untucked pant shirts with rolled sleeves, tees with
jeans or track pants, cheap fan jerseys, shalwar kameez, kurta pajama and
baniyan with shorts, in chappals or sneakers.

The gully is alive: kids on the stoop, an uncle with his newspaper on a
charpai, men at the chai khokha (with steam off the kettle), a fruit rehri,
a CD70 with a black cat washing itself on the seat, an orange cat that
crosses the street, a sleeping cat, a goat tied by a door, pigeons circling
and perched on the roofline, tangled wires, posters, drain pipes, dishes,
a neem tree, bunting and kites, and dust hanging in the evening light.

## Gullies

| Region   | Gully                                              |
| -------- | -------------------------------------------------- |
| Pakistan | Lahore (Androon Shehr), Karachi (Nazimabad), Multan (Hussain Agahi) |
| India    | Mumbai (Dadar chawl), Delhi (Chandni Chowk), Kolkata (Shyambazar), Hyderabad (Old City) |
| Neutral  | Dubai (Satwa backstreet)                           |

No teams, just common Pakistani and Indian boys' names (you can type your own).

## How to play

- **Neeche** (ground shot): safe, up to 4.
- **Uthao!** (lofted): 6 if timed well, but can be caught, or land in Uncle's house (OUT).
- Tap when the ball reaches the glowing ring. Keyboard on web: `←`/`A` ground, `↑`/`Space` lofted.
- Gully rules: one tip one hand = out, wide = 1 run, 3 wickets, 1–3 overs.

## Run it

```bash
cd gully-cricket
npm install
npm run web        # browser
npm run ios        # Expo Go / iOS simulator (needs macOS + Xcode for the simulator)
npm test           # game-rule unit tests
npm run typecheck
```

## How it's built

- `src/game/engine.ts`: pure game rules (deliveries, timing windows, outcomes, match state). Unit tested.
- `src/game/flight.ts`, `src/game/frame.ts`: ball paths and the per-frame animation state.
- `src/three/`: the 3D world with React Three Fiber (`@react-three/fiber/native` + `expo-gl` on phones, WebGL on web).
  - `World.tsx`: procedurally built houses, balconies, bunting, kites, rickshaw, landmarks (merged into a few draw calls).
  - `Chibi.tsx`: stylised characters (kids, teens, uncles) with jointed limbs, two-bone arm IK on the bat, and poses for batting, bowling, fielding, sitting, clapping and cheering. Each body part is merged into one mesh, about a dozen draw calls per person.
  - `Life.tsx`: neighbours, animals and street furniture.
  - `GameScene.tsx`: wires the game state to the characters, ball, timing ring, dust and cameras.
- `src/screens/`: Home (live 3D showcase), Match (HUD + controls), Result.

## Shipping to the App Store

`app.json` uses a placeholder bundle id (`com.example.gullycricket`). Set your
own, then build with EAS: `npx eas build -p ios`. The 3D runs through
`expo-gl`, which works in Expo Go and dev builds, but it has only been checked
in a desktop browser so far, so test on a real iPhone before release.

## Art direction note

Characters and houses are built in code from simple 3D shapes, in a stylised
animated-film look. Film-quality characters like the reference artwork would
need sculpted and rigged models (`.glb`), which can be dropped in to replace
`Chibi.tsx` later.
