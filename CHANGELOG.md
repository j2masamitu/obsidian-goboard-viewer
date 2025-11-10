# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
