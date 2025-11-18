# Reddit r/baduk Post

## Title
[Tool Release] Obsidian Go Board Viewer v2.0.0 - Now with SGF Editor!

## Post Content

Hi r/baduk!

I'm excited to share **Obsidian Go Board Viewer v2.0.0**, a major update to my Obsidian plugin that lets you view and now **edit** SGF files directly in your notes.

## What is it?

An Obsidian plugin that displays SGF (Smart Game Format) files as interactive Go boards with playback controls. Perfect for studying games, recording your own games, or creating Go-related notes.

## What's New in v2.0.0? 🎉

### SGF Editor Mode
The biggest addition is the **interactive SGF editor**:

- **View/Edit Mode**: Switch between viewing (`sgf` code blocks) and editing (`sgf-edit` code blocks)
- **Interactive Editing**: Click on the board to:
  - Add black or white stones
  - Remove stones
  - Add text labels
- **Comment Editor**: Add notes to any position
- **Game Info Editor**: Edit player names, ranks, and game title
- **Move Deletion**: Remove moves from any point
- **SGF Output**: Copy edited SGF for sharing or saving
- **Auto-play Mode**: Watch games automatically with play/pause controls

### Enhanced Viewer
- **Move Parameter**: Jump to specific moves with `![[game.sgf|move=10]]`
- Full support for variations, markers, and setup positions

## Platform Support
✅ Desktop (Windows, Mac, Linux)
✅ Mobile (iOS, Android)

## Example Use Cases

- **Study professional games**: Embed kifu in your study notes with commentary
- **Record your own games**: Edit and annotate your games with thoughts at each move
- **Create tsumego collections**: Build problem sets with setup positions
- **Teaching materials**: Make lesson notes with interactive Go boards

## Getting Started

### Installation
1. Download from [GitHub Releases](https://github.com/j2masamitu/obsidian-goboard-viewer/releases/tag/2.0.0)
2. Extract to `.obsidian/plugins/goboard-viewer/`
3. Enable in Obsidian Settings → Community Plugins

### Basic Usage

**View Mode** - Add to your markdown notes:
````markdown
```sgf
(;GM[1]FF[4]SZ[19]
;B[pd];W[dp];B[pp];W[dd])
```
````

**Edit Mode** - Change to `sgf-edit`:
````markdown
```sgf-edit
(;GM[1]FF[4]SZ[19]
;B[pd];W[dp];B[pp];W[dd])
```
````

**Embed SGF files**:
```markdown
![[my-game.sgf]]
![[professional-game.sgf|move=50]]
```

## Screenshots
[Screenshots in the GitHub repo](https://github.com/j2masamitu/obsidian-goboard-viewer)

## Technical Details
- Uses Sabaki's shudan library for board rendering
- Full SGF parsing with @sabaki/sgf
- Offline operation - no internet required
- Open source (MIT License)

## Links
- **GitHub**: https://github.com/j2masamitu/obsidian-goboard-viewer
- **Release**: https://github.com/j2masamitu/obsidian-goboard-viewer/releases/tag/2.0.0
- **Obsidian**: https://obsidian.md/

---

I'd love to hear feedback from the Go community! What features would be most useful for studying or recording your games?

Happy studying! 🪨
