# Release Notes - Version 1.1.0

## ⚠️ Breaking Change: Plugin ID Update

This release changes the plugin ID to comply with Obsidian's Community Plugin guidelines.

**Plugin ID changed from:** `obsidian-goboard-viewer` → `goboard-viewer`

### Why this change?

Obsidian's official plugin guidelines state: **"The id can't contain obsidian."**

This change is required for submission to the Obsidian Community Plugins directory.

---

## 📦 Migration Instructions for Existing Users

If you're upgrading from version 1.0.0, please follow these steps:

### Option 1: Manual Reinstallation (Recommended)

1. **Disable the old plugin** in Obsidian Settings → Community Plugins
2. **Delete the old plugin folder:**
   - `.obsidian/plugins/obsidian-goboard-viewer/`
3. **Download version 1.1.0** from the [Releases page](https://github.com/j2masamitu/obsidian-goboard-viewer/releases)
4. **Extract to the new folder:**
   - `.obsidian/plugins/goboard-viewer/`
5. **Enable the plugin** in Obsidian Settings → Community Plugins

### Option 2: Using BRAT

If you installed via BRAT:
1. Update the plugin through BRAT
2. The new folder will be created automatically

### For Mobile Users with Sync Plugins

If you use a sync plugin like "Remotely Save":
1. Enable "Sync Config Dir" temporarily
2. Sync to mobile devices
3. Verify the new plugin folder appears
4. You can disable "Sync Config Dir" after installation

---

## 📝 Changes in This Release

### Changed
- **Plugin ID**: Changed from `obsidian-goboard-viewer` to `goboard-viewer`
- **Installation path**: Now `.obsidian/plugins/goboard-viewer/`
- Updated all documentation to reflect the new plugin ID

### Documentation Updates
- ✅ README.md - Updated installation paths
- ✅ README_ja.md - Updated installation paths (Japanese)
- ✅ setup.sh - Updated setup script
- ✅ CONTRIBUTING.md - Updated development instructions

---

## ✨ No Functional Changes

This release contains **no changes to plugin functionality**. All features work exactly the same:

- ✅ SGF file embedding
- ✅ SGF code blocks
- ✅ Mobile & desktop support
- ✅ Playback controls
- ✅ Variation support
- ✅ Markers (TR, SQ, CR, MA, LB)
- ✅ Game information display

---

## 🎯 Next Steps

This update prepares the plugin for:
- **Submission to Obsidian Community Plugins** - Users will be able to install directly from Obsidian
- **Better discoverability** - Listed in the official plugin directory
- **Automatic updates** - Through Obsidian's built-in plugin manager

---

## 📚 Full Documentation

- [English README](https://github.com/j2masamitu/obsidian-goboard-viewer/blob/main/README.md)
- [日本語 README](https://github.com/j2masamitu/obsidian-goboard-viewer/blob/main/README_ja.md)

---

## 🙏 Thank You

Thank you for using Go Board Viewer! If you encounter any issues with the migration, please [open an issue](https://github.com/j2masamitu/obsidian-goboard-viewer/issues).
