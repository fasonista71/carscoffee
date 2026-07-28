# Claude Code Prompt: Cars & Coffee Native iOS Package

You are working on **Cars & Coffee**, an 8-bit top-down endless driving game.

The current product is a complete browser prototype with a deterministic JavaScript game core, a fairness oracle, fuel and coffee systems, boost, hazards, hearts, overtakers, pursuits, breakdowns, difficulty tiers, scenery themes, audio, haptics seams, menus, vehicle selection, persistence, and a development tuning overlay.

Your job is to create the **native iOS foundation** as a clean Swift package and app shell while preserving the game’s proven simulation behavior.

Do not rewrite the game casually. Treat the existing browser implementation as the behavioral specification.

## Product direction

Cars & Coffee should feel like a contemporary iOS game with pixel-art gameplay inside a cleaner editorial automotive shell.

The hero vehicle is the **red sports car with white racing stripes**.

The core loop remains:

- drive through three-lane traffic
- change lanes responsively
- collect coffee to maintain fuel
- use boost tactically
- avoid traffic and hazards
- survive increasingly difficult tiers
- build distance and vehicle-specific high scores

Do not add coffee recipes, destination runs, progression systems, Game Center, monetization, or live services in this first native package. Create seams for them, but keep this phase focused on parity, architecture, and native feel.

## Primary objective

Build a compileable native iOS project using:

- **SwiftUI** for the app shell and menus
- **SpriteKit** through `SpriteView` for gameplay rendering
- a pure Swift package named **GameCore**
- **Swift Testing** for deterministic and behavioral tests
- protocols for audio, haptics, persistence, and future Game Center support

The project must run locally in the iOS Simulator without third-party dependencies.

Target the current stable iOS SDK available in Xcode, but keep the deployment target conservative enough for modern supported iPhones. Do not use beta-only APIs.

## Non-negotiable architecture rules

### 1. Preserve a pure deterministic core

`GameCore` must not import SwiftUI, SpriteKit, UIKit, AVFoundation, CoreHaptics, GameKit, UserDefaults, or ambient randomness.

Foundation is allowed only where needed for basic value types, serialization, or package support, but the simulation itself must not depend on wall-clock time.

All randomness must come from an explicit seeded RNG whose state is part of the world state.

### 2. Gameplay logic does not belong in `SKScene`

`DriveScene` may receive user input, advance a fixed-step accumulator, call `GameCore.step`, consume immutable render snapshots, display sprites and effects, and forward game events to platform services.

It must not decide collisions, spawning, fairness, fuel drain, hazard outcomes, traffic behavior, scoring, tier changes, heart spending, or overtaker and pursuit behavior.

### 3. Fixed-step simulation

Use a 60 Hz simulation step with an accumulator, interpolation alpha, maximum resume gap clamp, explicit simulation frame number, and frame-stamped input commands.

Rendering may run at device refresh rate, but simulation stays fixed at 60 Hz.

### 4. Immutable run configuration

Resolve all tunable values into a `RunConfiguration` when a run begins.

A run must store its seed, configuration version, immutable configuration snapshot, current simulation frame, framed-input history seam, and selected vehicle identifier.

Do not read mutable global tuning during a run.

### 5. Explicit state machine

Use an app flow equivalent to:

```swift
enum AppPhase {
    case loading
    case title
    case playing(GameSession)
    case paused(GameSession)
    case results(RunResult)
}
```

Invalid state combinations must be impossible.

## Suggested repository structure

```text
CarsAndCoffee/
├── CarsAndCoffee.xcodeproj
├── App/
│   ├── CarsAndCoffeeApp.swift
│   ├── AppModel.swift
│   ├── AppPhase.swift
│   ├── RootView.swift
│   ├── TitleView.swift
│   ├── GarageView.swift
│   ├── PauseView.swift
│   ├── ResultsView.swift
│   └── SettingsView.swift
├── GamePresentation/
│   ├── DriveScene.swift
│   ├── GameContainerView.swift
│   ├── RenderCoordinator.swift
│   ├── SpriteFactory.swift
│   ├── HUDRenderer.swift
│   ├── ParticleRenderer.swift
│   └── SceneMetrics.swift
├── PlatformServices/
│   ├── AudioService.swift
│   ├── HapticsService.swift
│   ├── SaveStore.swift
│   ├── GameCenterService.swift
│   └── ServiceContainer.swift
├── Resources/
│   ├── Assets.xcassets
│   ├── TextureAtlases/
│   ├── Audio/
│   └── Credits/
├── Packages/
│   └── GameCore/
│       ├── Package.swift
│       ├── Sources/GameCore/
│       │   ├── Model/
│       │   ├── Systems/
│       │   ├── Generation/
│       │   ├── Replay/
│       │   ├── Rendering/
│       │   └── Support/
│       └── Tests/GameCoreTests/
└── Documentation/
    ├── PORTING_NOTES.md
    ├── BEHAVIORAL_PARITY.md
    └── ASSET_CREDITS.md
```

Adjust names only when there is a strong Swift convention reason. Keep boundaries intact.

## GameCore types

Create clear value types for at least:

```swift
struct GameWorld
struct RunConfiguration
struct PlayerState
struct TrafficVehicle
struct TrafficRow
struct Pickup
struct Hazard
struct OvertakerState
struct PursuitState
struct BreakdownState
struct TierDefinition
struct SceneryTheme
struct RunResult
struct RenderSnapshot
struct EntityTransform
struct SeededRandom
```

Use stable identifiers suitable for replay and render reconciliation.

Use enums for closed domains:

```swift
enum Lane: Int, Codable, Sendable
enum InputCommand: Codable, Sendable
enum HazardKind: Codable, Sendable
enum PickupKind: Codable, Sendable
enum VehicleID: String, Codable, Sendable
enum GameEvent: Codable, Sendable
enum EndReason: Codable, Sendable
```

Prefer structs and pure functions. Use classes only for platform ownership or clearly stateful coordinators outside the deterministic core.

## Input model

Support these native controls:

- swipe left: move one lane left
- swipe right: move one lane right
- swipe up: boost
- tap a lane: move one lane toward that lane
- tap the player’s current lane: boost
- two-finger tap: pause
- three-finger development gesture may be omitted from release UI, but preserve a debug-only tuning seam

Each captured input must become a frame-stamped `InputEvent`.

Gesture recognition belongs in the presentation layer; the core receives normalized commands only.

## Rendering requirements

Preserve the logical pixel-art presentation:

- internal logical scene: 180 × 320
- integer or nearest-neighbor scaling
- no texture smoothing
- portrait-first layout
- three-lane road
- red player car with white stripes as the default hero car
- HUD for distance, best score, coffee/fuel, boost, and three hearts
- tier banner
- overtaker warning and boost prompt
- scenery themes
- oil slicks, rubble, traffic, breakdown flashers, pursuits, pickup particles, speed lines, and screen shake

Use SpriteKit texture filtering mode `.nearest`.

Do not stretch pixel assets non-uniformly.

Create a `SceneMetrics` abstraction so iPhone screen sizes and safe areas do not affect simulation coordinates.

## Platform service protocols

Define protocols first:

```swift
protocol AudioServicing
protocol HapticsServicing
protocol SaveStoring
protocol GameCenterServicing
```

Provide no-op implementations for tests and previews, and basic native implementations for the app target.

Initial persistence should cover selected vehicle, per-vehicle best score, sound enabled, haptics enabled, and first-run state.

Do not put persistence inside `GameCore`.

## Testing requirements

Port the browser prototype’s strongest guarantees.

At minimum create tests for:

### Determinism
- same seed + same configuration + same framed inputs = identical final serialized state
- RNG state serializes and restores correctly
- replay round-trip reproduces the same result

### Movement
- lane tween completes on the expected frame
- exactly one queued lane input is accepted
- edge lane commands are rejected safely
- opposing queued commands behave predictably

### Fuel and boost
- passive drain
- boost drain
- minimum fuel gate
- fixed boost duration
- no boost restacking
- coffee refill
- out-of-fuel ending

### Hazards and hearts
- oil slick slide direction
- steering lock duration
- rubble fuel and speed penalties
- rubble cancels boost
- lethal contact spends a heart
- invulnerability duration
- final heart ends the run
- heart pickup eligibility respects minimum spent-heart requirement

### Traffic and fairness
- no generated row blocks all lanes
- corridor cannot narrow inside a tight cluster
- crossing gaps appear before corridor narrowing
- breakdowns do not form unfair double blocks
- overtakers obey lane and runway constraints
- pursuits preserve chase spacing
- rows spawned during a pass do not occupy the pass lane
- generator/oracle test exercises all tiers across a meaningful seed set

### State and serialization
- pause does not advance simulation
- configuration is pinned per run
- world serialization round-trip
- render interpolation does not mutate world state

Use Swift Testing where practical. XCTest may be used only where framework integration requires it.

## Fixed-point decision

Do not silently convert the full simulation to fixed point in the first pass.

Instead:

1. isolate simulation numeric types behind aliases or small wrappers
2. document every location where JavaScript floating-point behavior may affect parity
3. create a focused fixed-point spike for distance, speed, fuel, and spawn positions
4. record the recommendation in `PORTING_NOTES.md`

The first working package may use `Double` if required for parity, provided determinism holds within Swift and numeric boundaries are isolated for later conversion.

## Migration sequence

Work in small compileable phases.

### Phase 1: Project and package skeleton
- create Xcode app
- create local `GameCore` Swift package
- establish dependency direction
- add placeholder SwiftUI title screen and empty SpriteKit scene
- add service protocols and no-op implementations
- ensure project builds and tests run

### Phase 2: Core primitives
- seedable RNG
- run configuration
- lanes and input commands
- world state
- fixed-step runner
- serialization
- first deterministic golden test

### Phase 3: Player and basic road
- lane movement
- queued input
- distance and speed
- render snapshots
- SpriteKit road and player rendering
- native gestures

### Phase 4: Traffic and fair generation
- traffic entities
- rows, clusters, corridors, stagger
- spacing and traffic clamp
- fairness oracle port
- traffic rendering

### Phase 5: Fuel, coffee, boost, and HUD
- full fuel spine
- pickups
- HUD
- out-of-fuel state
- boost effects

### Phase 6: Hazards, hearts, and breakdowns
- slicks
- rubble
- collisions
- three-heart system
- invulnerability
- breakdown scheduling and flashers

### Phase 7: Overtakers and pursuits
- warning
- pass scheduling
- fair spawn guards
- traffic yielding
- emergency pursuit pairing
- event-driven audio and haptics

### Phase 8: Tiers, scenery, polish, menus, persistence
- all six tiers
- scenery theme switching
- parallax
- particles and shake
- title, pause, results, garage, settings
- high-score persistence
- asset credits

At the end of every phase:

- build the app
- run all tests
- update `PORTING_NOTES.md`
- list any behavior that differs from the browser prototype
- do not proceed with knowingly broken tests

## Important cleanup from the current documentation

The browser documentation contains stale milestone language. Treat the latest feature list as authoritative:

- milestone 6
- all twelve original build-order steps complete
- parallax, juice, full development overlay, audio, pursuits, breakdowns, hearts, scenery themes, and traffic yielding are already implemented

Do not infer that these are still missing because older paragraphs remain in the README.

Preserve the distinction between behavior already implemented in the browser prototype, engineering work planned for native, and future product ideas that are not part of parity.

## Asset and licensing requirements

Preserve and surface the existing art credits.

The current traffic sprites originate from the “Road To Rage” vehicle pack by TMD Studios and require the supplied credit and link.

Keep an `ASSET_CREDITS.md` file and include license text in the app bundle where appropriate.

Do not use Porsche names, logos, model badges, or trademarks in code or user-facing text unless licensed. Refer to the hero car internally with a neutral identifier such as:

```swift
VehicleID.heroRedStripe
```

The visual may remain a red sports-car archetype with white stripes.

## Deliverables for this task

Produce:

1. a compileable Xcode project
2. a local `GameCore` Swift package
3. the folder structure above
4. initial SwiftUI and SpriteKit integration
5. deterministic RNG and fixed-step runner
6. core models and normalized input types
7. service protocols with no-op implementations
8. an initial test suite with at least one golden deterministic fixture
9. `PORTING_NOTES.md`
10. `BEHAVIORAL_PARITY.md`
11. `ASSET_CREDITS.md`
12. a concise root README with build and test instructions

Do not claim feature parity until the parity document and tests support it.

## Working style

Before changing code:

1. inspect the existing repository
2. identify the JavaScript files that define each system
3. map those files to Swift targets and types
4. write the mapping into `PORTING_NOTES.md`
5. begin with the smallest compileable slice

When uncertain, preserve observed browser behavior rather than inventing new behavior.

Do not remove fairness guards because a native implementation seems simpler.

Do not replace the deterministic generator with SpriteKit physics.

Do not use GameplayKit random sources unless their algorithm and serialized state are explicitly controlled and tested.

Do not introduce third-party packages or backend dependencies.

At completion, provide:

- what was built
- files added or changed
- tests run and results
- parity gaps
- recommended next phase
