#!/bin/bash

# Go Board Viewer Plugin Setup Script

echo "======================================"
echo "Go Board Viewer Plugin Setup"
echo "======================================"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed"
    echo "Please install Node.js and npm first"
    exit 1
fi

echo "✓ npm is installed"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies"
    exit 1
fi

echo "✓ Dependencies installed"
echo ""

# Build the plugin
echo "🔨 Building plugin..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Error: Build failed"
    exit 1
fi

echo "✓ Build successful"
echo ""

# Check if files exist
if [ ! -f "main.js" ] || [ ! -f "manifest.json" ] || [ ! -f "styles.css" ]; then
    echo "❌ Error: Required files not found"
    exit 1
fi

echo "======================================"
echo "✅ Setup complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Copy these files to your Obsidian vault:"
echo "   .obsidian/plugins/obsidian-goboard-viewer/"
echo ""
echo "   Files to copy:"
echo "   - manifest.json"
echo "   - main.js"
echo "   - styles.css"
echo ""
echo "2. Restart Obsidian"
echo "3. Enable 'Go Board Viewer' in Settings → Community Plugins"
echo ""
echo "Or use a symbolic link for development:"
echo "   cd /path/to/vault/.obsidian/plugins/"
echo "   ln -s $(pwd) obsidian-goboard-viewer"
echo ""
