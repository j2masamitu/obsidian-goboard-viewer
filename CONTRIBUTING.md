# Contributing to Obsidian Go Board Viewer

Thank you for your interest in contributing! Here's how you can help.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/obsidian-goboard-viewer.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/my-feature`

## Development

### Running in Development Mode

```bash
npm run dev
```

This watches for file changes and rebuilds automatically.

### Building

```bash
npm run build
```

### Testing

Test the plugin in Obsidian:

1. Build the plugin
2. Copy `manifest.json`, `main.js`, and `styles.css` to your vault's `.obsidian/plugins/goboard-viewer/`
3. Reload Obsidian
4. Enable the plugin in Settings

## Code Style

- Use TypeScript
- Follow existing code structure
- Add comments for complex logic
- Use meaningful variable and function names

## Submitting Changes

1. Commit your changes: `git commit -am 'Add some feature'`
2. Push to your fork: `git push origin feature/my-feature`
3. Create a Pull Request with:
   - Clear description of changes
   - Any relevant issue numbers
   - Screenshots if UI changes

## Reporting Issues

When reporting bugs, please include:

- Obsidian version
- Plugin version
- Steps to reproduce
- Expected vs actual behavior
- Sample SGF if relevant
- Console errors (if any)

## Feature Requests

Feature requests are welcome! Please:

- Check if it already exists
- Describe the use case
- Explain why it would be useful
- Consider implementation complexity

## Questions

Feel free to open an issue for questions about:

- How to use the plugin
- SGF format support
- Implementation details

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
