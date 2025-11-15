# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.2] - 2025-11-16

### Fixed
- Fixed settings UI to use `setHeading()` instead of direct HTML heading creation (Obsidian PR review requirement)
- Changed UI text to sentence case for consistency (Obsidian PR review requirement)

## [1.2.1] - 2025-11-16

### Added
- Added comprehensive color customization settings with color pickers:
  - Board background color
  - Board grid line color (including star points)
  - Coordinate label color
  - SGF marker color (circles, triangles, squares, labels)
  - Variation label color (A, B, C, etc.)
- Added "Reset to defaults" button to restore all colors to default values
- CSS variables for all customizable colors for real-time updates

### Changed
- Board colors now use CSS variables for dynamic theming
- All marker and label colors are now customizable instead of fixed

### Fixed
- Fixed board grid lines not updating when line color is changed (now targets rect.shudan-gridline elements)

## [1.2.0] - 2025-11-16

### Added
- Initial color customization feature (superseded by 1.2.1)

## [1.1.8] - 2025-11-14

### Fixed
- Fixed LB (label) marker text not displaying after marker hiding rules were applied
- Added specific override rules to show label text content while keeping other marker default text hidden

## [1.1.7] - 2025-11-14

### Fixed
- Fixed unwanted small marker text appearing on empty intersections
- Hidden default text content from shudan library for markers, showing only custom marker symbols
- Improved marker display by hiding all child elements and showing only ::before pseudo-element content

### Changed
- Increased coordinate font size from 9px to 11px for better readability
- Changed coordinate color to #333 for improved visibility

## [1.1.6] - 2025-11-14

### Fixed
- Reverted overly aggressive text-hiding CSS from version 1.1.5 that was preventing SGF markers and labels from displaying
- Fixed coordinate number overlapping issue for 2-digit numbers by adding proper coordinate styling
- SGF markers (circles, squares, triangles, labels, etc.) now display correctly again

## [1.1.5] - 2025-11-11

### Fixed
- Fixed stone display issue where stones were showing as "1" and "-1" text instead of graphical stones
- Added comprehensive CSS rules to completely hide numerical text content in stone elements
- Stones now properly display as circular graphical elements with radial gradients

## [1.1.4] - 2025-11-10

### Fixed
- Replaced `element.style.setProperty` with Obsidian's `setCssProps` API
- Better theming support and maintainability for CSS property changes
- All code now fully complies with Obsidian plugin best practices

## [1.1.3] - 2025-11-10

### Fixed
- Fixed remaining async/await issues in `onUnloadFile` method
- Fixed Promise handling in setTimeout callbacks
- Replaced remaining `any` type casting with type-safe `setProperty` method
- All code now passes Obsidian plugin review requirements

## [1.1.2] - 2025-11-10

### Fixed
- Code quality improvements for Obsidian plugin review
- Replaced all `innerHTML`, `outerHTML`, and `insertAdjacentHTML` with safe DOM API methods
- Changed all `console.log` to `console.debug` (only warn/error/debug allowed)
- Fixed async/await issues (removed unnecessary async, proper Promise handling)
- Replaced all `any` types with proper TypeScript types
- Removed unused variables
- Fixed expression statements

## [1.1.1] - 2025-11-10

### Changed
- Updated plugin description to match Community Plugins submission requirements
- Description now: "Displays Go (Weiqi/Baduk) SGF files and code blocks as interactive Go boards with playback controls for desktop and mobile."

## [1.1.0] - 2025-11-10

### Changed
- **BREAKING CHANGE**: Plugin ID changed from `obsidian-goboard-viewer` to `goboard-viewer`
- Installation path changed to `.obsidian/plugins/goboard-viewer/`
- Updated all documentation to reflect new plugin ID
- This change is required for Obsidian Community Plugins submission

### Migration for Existing Users
- Disable old plugin in Obsidian Settings
- Delete `.obsidian/plugins/obsidian-goboard-viewer/` folder
- Download version 1.1.0 or later
- Extract to `.obsidian/plugins/goboard-viewer/`
- Enable plugin in Obsidian Settings

## [1.0.0] - 2025-11-08

### Added
- Initial release of Obsidian Go Board Viewer
- SGF code block support (````sgf` blocks)
- SGF file embedding support (`![[game.sgf]]`)
- Direct .sgf file opening
- Game information display (player names, ranks, event, date, komi, handicap, result)
- Interactive Go board with Sabaki/shudan rendering
- Playback controls (First, Previous, Next, Last)
- Move number display and navigation
- Comment display for each move
- Full variation/branch support with selection UI
- SGF marker support:
  - LB (Label): Text labels on intersections
  - TR (Triangle): Triangle markers
  - SQ (Square): Square markers
  - CR (Circle): Circle markers
  - MA (Mark): X-mark markers
- Setup stone support (AB, AW, AE)
- Multiple board sizes (19×19, 13×13, 9×9, custom)
- Coordinate display on board edges
- Responsive design for various screen sizes
- Red markers for SGF properties
- Blue markers for variation indicators
- English UI labels

### Technical Details
- Uses @sabaki/shudan for board rendering
- Uses @sabaki/sgf for SGF parsing
- Uses Preact for lightweight UI components
- Fully offline operation
- TypeScript implementation
