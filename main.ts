import { Plugin, MarkdownPostProcessorContext, TFile, FileView, WorkspaceLeaf, PluginSettingTab, Setting, App } from 'obsidian';
import { h, render } from 'preact';
import { Goban } from '@sabaki/shudan';
// @ts-ignore
import * as sgf from '@sabaki/sgf';

// Settings interface
interface GoBoardSettings {
	boardColor: string;
	lineColor: string;
	coordinateColor: string;
	markerColor: string;
	variationColor: string;
}

const DEFAULT_SETTINGS: GoBoardSettings = {
	boardColor: '#DCB35C',
	lineColor: '#000000',
	coordinateColor: '#333333',
	markerColor: '#FF0000',
	variationColor: '#2196F3'
};

// Type definitions for SGF library
interface SGFNode {
	data?: Record<string, string[]>;
	children?: SGFNode[];
}

interface SGFGameTree {
	root?: SGFNode;
	data?: Record<string, string[]>;
	children?: SGFNode[];
}

interface MarkerData {
	type: "label" | "circle" | "cross" | "triangle" | "square" | "point" | "loader" | null | undefined;
	label?: string;
}

// View for displaying SGF files
class SGFView extends FileView {
	plugin: GoBoardViewerPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: GoBoardViewerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return 'sgf';
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : 'SGF Board';
	}

	async onLoadFile(file: TFile): Promise<void> {
		console.debug('SGFView: Loading file:', file.path);
		const content = await this.app.vault.read(file);

		// Clear container
		const container = this.contentEl;
		container.empty();

		// Render Go board
		this.plugin.renderGoBoard(container, content);
	}

	onUnloadFile(file: TFile): Promise<void> {
		// Clear the view
		this.contentEl.empty();
		return Promise.resolve();
	}
}

export default class GoBoardViewerPlugin extends Plugin {
	settings: GoBoardSettings;
	private mutationObserver: MutationObserver | null = null;

	/**
	 * Convert SGF coordinates to board coordinates
	 * SGF: 'aa' = top-left, first letter = x (column), second = y (row)
	 * shudan signMap: indexed as [y][x] (row, column)
	 * So SGF 'dd' (x=3, y=3) → signMap[3][3]
	 */
	private point2vertex(point: string): { x: number; y: number } {
		if (!point || point.length < 2) {
			return { x: -1, y: -1 };
		}
		const x = point.charCodeAt(0) - 97; // 'a' = 97, column
		const y = point.charCodeAt(1) - 97; // 'a' = 97, row
		return { x, y };
	}

	/**
	 * Convert vertex coordinates [x, y] to SGF point notation (e.g., "dd")
	 */
	private vertex2point(vertex: [number, number]): string {
		const [x, y] = vertex;
		return String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
	}

	/**
	 * Handle vertex click in edit mode - add a move or marker depending on mode
	 * Returns the new move number if a move was added to the main line, otherwise null
	 */
	private handleVertexClick(
		vertex: [number, number],
		currentNode: SGFNode,
		allMoves: Array<{ node: SGFNode; moveNum: number; variations: SGFNode[] }>,
		moveNumber: number,
		rebuildMoveTree: () => void,
		mode: string,
		labelText: string
	): number | null {
		const point = this.vertex2point(vertex);

		console.debug('handleVertexClick - mode:', mode, 'moveNumber:', moveNumber, 'currentNode:', currentNode);

		// Handle different modes
		if (mode === 'move') {
			// Move mode - add a stone as a move
			const nextPlayer = this.getNextPlayer(currentNode, allMoves, moveNumber);
			const moveProperty = nextPlayer === 'B' ? 'B' : 'W';

			// Check if there's already a move at this location from current node
			const existingChild = currentNode.children?.find((child: SGFNode) => {
				const childMove = child.data?.[moveProperty];
				return childMove && Array.isArray(childMove) && childMove[0] === point;
			});

			if (existingChild) {
				console.debug('Move already exists at this position');
				return null;
			}

			// Create the new move node
			const newNode: SGFNode = {
				data: { [moveProperty]: [point] },
				children: []
			};

			// Check if current node has children
			if (!currentNode.children || currentNode.children.length === 0) {
				currentNode.children = [newNode];
				console.debug(`Added move at ${point} as main line continuation`);
				rebuildMoveTree();
				return moveNumber + 1;
			} else {
				currentNode.children.push(newNode);
				console.debug(`Created variation at ${point}`);
				rebuildMoveTree();
				return null;
			}
		} else if (mode === 'black' || mode === 'white') {
			// Add/remove/replace setup stone (AB or AW)
			const property = mode === 'black' ? 'AB' : 'AW';
			const oppositeProperty = mode === 'black' ? 'AW' : 'AB';

			if (!currentNode.data) {
				currentNode.data = {};
			}

			// Check if same color stone already exists at this point
			if (currentNode.data[property] && currentNode.data[property].includes(point)) {
				// Same color stone exists - remove it (toggle off)
				currentNode.data[property] = currentNode.data[property].filter((p: string) => p !== point);
				console.debug(`Removed ${mode} stone at ${point}`);
			} else {
				// Remove opposite color stone if exists (replace)
				if (currentNode.data[oppositeProperty]) {
					currentNode.data[oppositeProperty] = currentNode.data[oppositeProperty].filter((p: string) => p !== point);
				}

				// Add stone
				if (!currentNode.data[property]) {
					currentNode.data[property] = [];
				}
				currentNode.data[property].push(point);
				console.debug(`Added ${mode} stone at ${point}`);
			}
			return null;
		} else {
			// Add/remove/replace marker
			let property: string;
			let value: string;

			switch (mode) {
				case 'triangle':
					property = 'TR';
					value = point;
					break;
				case 'square':
					property = 'SQ';
					value = point;
					break;
				case 'circle':
					property = 'CR';
					value = point;
					break;
				case 'mark':
					property = 'MA';
					value = point;
					break;
				case 'label':
					property = 'LB';
					value = `${point}:${labelText}`;
					break;
				default:
					return null;
			}

			if (!currentNode.data) {
				currentNode.data = {};
			}

			// Check if same marker already exists at this point
			let sameMarkerExists = false;
			if (mode === 'label') {
				// For labels, check if same label text exists
				if (currentNode.data[property]) {
					sameMarkerExists = currentNode.data[property].some((item: string) => item === value);
				}
			} else {
				// For other markers, check if marker exists at point
				if (currentNode.data[property]) {
					sameMarkerExists = currentNode.data[property].includes(point);
				}
			}

			if (sameMarkerExists) {
				// Same marker exists - remove it (toggle off)
				if (mode === 'label') {
					currentNode.data[property] = currentNode.data[property].filter((item: string) => item !== value);
				} else {
					currentNode.data[property] = currentNode.data[property].filter((p: string) => p !== point);
				}
				console.debug(`Toggled off ${mode} at ${point}`);
			} else {
				// Different or no marker - remove all markers at this point and add new one
				const markerProperties = ['TR', 'SQ', 'CR', 'MA', 'LB'];
				markerProperties.forEach(prop => {
					if (currentNode.data && currentNode.data[prop]) {
						if (prop === 'LB') {
							currentNode.data[prop] = currentNode.data[prop]!.filter((item: string) => !item.startsWith(`${point}:`));
						} else {
							currentNode.data[prop] = currentNode.data[prop]!.filter((p: string) => p !== point);
						}
					}
				});

				// Add the new marker
				if (!currentNode.data[property]) {
					currentNode.data[property] = [];
				}
				currentNode.data[property]!.push(value);
				console.debug(`Added ${mode} at ${point}`);
			}
			return null;
		}
	}

	/**
	 * Determine the next player based on current position
	 */
	private getNextPlayer(
		currentNode: SGFNode,
		allMoves: Array<{ node: SGFNode; moveNum: number; variations: SGFNode[] }>,
		moveNumber: number
	): 'B' | 'W' {
		// If we're at the root or no moves yet, black plays first
		if (moveNumber === 0) {
			return 'B';
		}

		// Get the last move's player by checking the node
		const lastMove = allMoves[moveNumber - 1];
		if (lastMove && lastMove.node.data) {
			// Check if it's a black or white move
			if (lastMove.node.data.B) {
				return 'W'; // Last was black, next is white
			} else if (lastMove.node.data.W) {
				return 'B'; // Last was white, next is black
			}
		}

		// Default to black
		return 'B';
	}

	/**
	 * Delete current node and all its descendants
	 * Returns the new move number after deletion
	 */
	private deleteFromCurrentNode(
		rootNode: SGFNode,
		allMoves: Array<{ node: SGFNode; moveNum: number; variations: SGFNode[] }>,
		moveNumber: number,
		rebuildMoveTree: () => void
	): number {
		if (moveNumber === 0) {
			// At root - delete all children
			if (rootNode.children) {
				rootNode.children = [];
				console.debug('Deleted all moves from root');
			}
			rebuildMoveTree();
			return 0;
		}

		// Find parent node
		let parentNode: SGFNode;
		if (moveNumber === 1) {
			// Parent is root
			parentNode = rootNode;
		} else {
			// Parent is the previous move
			parentNode = allMoves[moveNumber - 2].node;
		}

		// Get current node
		const currentNode = allMoves[moveNumber - 1].node;

		// Remove current node from parent's children
		if (parentNode.children) {
			const index = parentNode.children.indexOf(currentNode);
			if (index !== -1) {
				parentNode.children.splice(index, 1);
				console.debug(`Deleted node at move ${moveNumber}`);
			}
		}

		// Rebuild move tree
		rebuildMoveTree();

		// Move back to parent
		return moveNumber - 1;
	}

	async onload() {
		console.debug('Loading Go Board Viewer plugin (Sabaki version)');

		// Load settings
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new GoBoardSettingTab(this.app, this));

		// Apply initial CSS variables
		this.applyCSSVariables();

		// Register markdown code block processor for SGF (both lowercase and uppercase)
		this.registerMarkdownCodeBlockProcessor('sgf', this.processSGFCodeBlock.bind(this));
		this.registerMarkdownCodeBlockProcessor('SGF', this.processSGFCodeBlock.bind(this));

		// Register markdown code block processor for SGF editor
		this.registerMarkdownCodeBlockProcessor('sgf-edit', (source, el, ctx) => this.processSGFEditBlock(source, el, ctx));
		this.registerMarkdownCodeBlockProcessor('SGF-EDIT', (source, el, ctx) => this.processSGFEditBlock(source, el, ctx));

		// Register SGF file extension (both lowercase and uppercase)
		this.registerExtensions(['sgf', 'SGF'], 'sgf');

		// Register view for SGF files
		this.registerView(
			'sgf',
			(leaf) => new SGFView(leaf, this)
		);

		// Register markdown post processor for SGF file embeds
		this.registerMarkdownPostProcessor(this.processSGFFileEmbed.bind(this));

		// Use MutationObserver to watch for SGF embeds being added to DOM
		this.setupMutationObserver();

		// Initial processing
		setTimeout(() => {
			this.processSGFEmbeds().catch(console.error);
		}, 1000);

		console.debug('Go Board Viewer plugin loaded');
	}

	setupMutationObserver() {
		console.debug('Setting up MutationObserver for SGF embeds');

		// Create observer to watch for new elements
		this.mutationObserver = new MutationObserver((mutations) => {
			for (let i = 0; i < mutations.length; i++) {
				const mutation = mutations[i];
				// Check added nodes
				for (let j = 0; j < mutation.addedNodes.length; j++) {
					const node = mutation.addedNodes[j];
					if (node.nodeType === Node.ELEMENT_NODE) {
						const element = node as HTMLElement;

						// Skip verbose logging - only log if actually processing

						// Check if this element itself is an SGF embed
						if (element.classList.contains('internal-embed')) {
							const embedSrc = element.getAttribute('src') || element.getAttribute('alt');
							if (embedSrc && embedSrc.toLowerCase().endsWith('.sgf')) {
								this.processSGFEmbed(element).catch(console.error);
							}
						}

						// Also check children for embeds
						const embeds = element.querySelectorAll('.internal-embed');
						if (embeds.length > 0) {
							embeds.forEach((embed) => {
								const el = embed as HTMLElement;
								const embedSrc = el.getAttribute('src') || el.getAttribute('alt');
								if (embedSrc && embedSrc.toLowerCase().endsWith('.sgf')) {
									this.processSGFEmbed(el).catch(console.error);
								}
							});
						}
					}
				}
			}
		});

		// Start observing the document body for changes
		this.mutationObserver.observe(document.body, {
			childList: true,
			subtree: true
		});

		console.debug('MutationObserver started');
	}

	async processSGFEmbed(embed: HTMLElement) {
		// Skip if already processed
		if (embed.hasAttribute('data-sgf-processed')) {
			return;
		}
		embed.setAttribute('data-sgf-processed', 'true');

		const src = embed.getAttribute('src') || embed.getAttribute('alt');
		if (!src || !src.toLowerCase().endsWith('.sgf')) {
			return;
		}

		// Get the file
		const file = this.app.metadataCache.getFirstLinkpathDest(src, '');
		if (!file || !(file instanceof TFile)) {
			console.error('Go Board Viewer: Could not find file:', src);
			return;
		}

		try {
			const sgfContent = await this.app.vault.read(file);

			// Clear the embed's contents
			embed.empty();

			// Add our container inside the embed
			const container = embed.createDiv('goboard-container');

			// Render the board
			this.renderGoBoard(container, sgfContent);
		} catch (error) {
			console.error('Go Board Viewer: Error loading SGF:', error);
		}
	}

	// Process all SGF embeds in the current workspace
	async processSGFEmbeds() {
		console.debug('Processing SGF embeds in document');

		// Debug: Log all .internal-embed elements
		const allEmbeds = document.querySelectorAll('.internal-embed');
		console.debug('Total .internal-embed elements found:', allEmbeds.length);
		allEmbeds.forEach((el, idx) => {
			console.debug(`Embed ${idx}:`, {
				tagName: el.tagName,
				className: el.className,
				src: el.getAttribute('src'),
				alt: el.getAttribute('alt'),
				href: el.getAttribute('href')
			});
		});

		// Search entire document instead of just view containers
		let embeds: NodeListOf<Element>;

		// Try to find in preview/reading mode
		embeds = document.querySelectorAll('.internal-embed[src$=".sgf"]');
		console.debug('Found with .internal-embed[src$=".sgf"]:', embeds.length);

		if (embeds.length === 0) {
			embeds = document.querySelectorAll('.internal-embed.file-embed[src*=".sgf"]');
			console.debug('Found with .internal-embed.file-embed[src*=".sgf"]:', embeds.length);
		}

		if (embeds.length === 0) {
			embeds = document.querySelectorAll('div[src$=".sgf"]');
			console.debug('Found with div[src$=".sgf"]:', embeds.length);
		}

		// Try to find in live preview mode
		if (embeds.length === 0) {
			embeds = document.querySelectorAll('a.internal-link[href$=".sgf"]');
			console.debug('Found with a.internal-link[href$=".sgf"]:', embeds.length);
		}

		const embedsArray = Array.from(embeds);
		console.debug('Starting loop through', embedsArray.length, 'embeds');

		for (let i = 0; i < embedsArray.length; i++) {
			const embed = embedsArray[i] as HTMLElement;
			console.debug(`Processing embed ${i}:`, embed);

			// Skip if already processed
			if (embed.hasAttribute('data-sgf-processed')) {
				console.debug('Already processed, skipping');
				continue;
			}
			embed.setAttribute('data-sgf-processed', 'true');
			console.debug('Marked as processed');

			const src = embed.getAttribute('src');
			const alt = embed.getAttribute('alt');
			console.debug('src attribute:', src);
			console.debug('alt attribute:', alt);

			const finalSrc = src || alt;
			console.debug('Processing embed with finalSrc:', finalSrc);

			if (!finalSrc || !finalSrc.toLowerCase().endsWith('.sgf')) {
				console.debug('Not an SGF file:', finalSrc);
				continue;
			}

			// Get the file
			const file = this.app.metadataCache.getFirstLinkpathDest(finalSrc, '');
			console.debug('Looking for file:', finalSrc, 'Result:', file);

			if (!file || !(file instanceof TFile)) {
				console.error('Could not find file:', finalSrc);
				continue;
			}

			try {
				const sgfContent = await this.app.vault.read(file);
				console.debug('Read SGF content, length:', sgfContent.length);

				// Create container for the Go board
				const container = document.createElement('div');
				container.className = 'goboard-container';

				// Replace the embed with our Go board
				embed.replaceWith(container);

				// Render the board
				this.renderGoBoard(container, sgfContent);
				console.debug('Successfully rendered Go board for:', finalSrc);
			} catch (error) {
				console.error('Error reading or rendering SGF file:', error);
			}
		}
	}

	onunload() {
		console.debug('Unloading Go Board Viewer plugin');
		if (this.mutationObserver) {
			this.mutationObserver.disconnect();
			console.debug('MutationObserver disconnected');
		}
	}

	/**
	 * Process SGF code blocks (```sgf ... ```)
	 */
	processSGFCodeBlock(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) {
		this.renderGoBoard(el, source.trim());
	}

	/**
	 * Process SGF editor code blocks (```sgf-edit)
	 */
	processSGFEditBlock(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) {
		this.renderGoBoard(el, source.trim(), true, ctx);
	}

	/**
	 * Process SGF file embeds (![[file.sgf]])
	 */
	async processSGFFileEmbed(
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) {
		// Log every call to see if this is being invoked
		const hasInternalLink = el.querySelector('a.internal-link');
		const hasSgfText = el.textContent?.includes('.sgf');

		if (hasInternalLink || hasSgfText) {
			console.debug('=== processSGFFileEmbed called ===');
			console.debug('Element:', el.tagName, el.className);
			console.debug('Has internal-link:', !!hasInternalLink);
			console.debug('Text content:', el.textContent?.substring(0, 100));
		}

		// Check if this element itself is an SGF embed
		const isSGFEmbed = el.classList.contains('internal-embed') &&
			(el.getAttribute('src')?.toLowerCase().endsWith('.sgf') || el.getAttribute('alt')?.toLowerCase().endsWith('.sgf'));

		// Look for SGF file embeds within this element
		const embeds = el.querySelectorAll('.internal-embed');

		// Only log if we find something relevant
		if (isSGFEmbed || embeds.length > 0) {
			console.debug('processSGFFileEmbed - Found relevant content');
			console.debug('Element tag:', el.tagName, 'classes:', el.className);
			console.debug('Is SGF embed:', isSGFEmbed);
			console.debug('Children embeds found:', embeds.length);

			if (embeds.length > 0) {
				for (let i = 0; i < embeds.length; i++) {
					const e = embeds[i] as HTMLElement;
					console.debug(`Child embed ${i}:`, {
						classes: e.className,
						src: e.getAttribute('src'),
						alt: e.getAttribute('alt')
					});
				}
			}
		}

		// If this element itself is an SGF embed, process it
		if (isSGFEmbed) {
			await this.processEmbed(el, ctx);
			return;
		}

		// Otherwise look for embeds in children
		const sgfEmbeds: HTMLElement[] = [];
		for (let i = 0; i < embeds.length; i++) {
			const embed = embeds[i] as HTMLElement;
			const src = embed.getAttribute('src') || embed.getAttribute('alt');
			if (src && src.toLowerCase().endsWith('.sgf')) {
				sgfEmbeds.push(embed);
			}
		}

		// Process all SGF embeds found
		for (const embed of sgfEmbeds) {
			await this.processEmbed(embed, ctx);
		}
	}

	/**
	 * Helper to process a single embed element
	 */
	async processEmbed(embed: HTMLElement, ctx: MarkdownPostProcessorContext) {
		// Try to get the file path from various attributes
		let src = embed.getAttribute('src') || embed.getAttribute('alt');

		console.debug('processEmbed - Found embed:', embed);
		console.debug('processEmbed - src attribute:', src);

		if (!src || !src.toLowerCase().endsWith('.sgf')) {
			console.debug('processEmbed - Not an SGF file, skipping');
			return;
		}

		console.debug('processEmbed - Processing SGF file:', src);

		// Get the file
		const file = this.app.metadataCache.getFirstLinkpathDest(src, ctx.sourcePath);
		console.debug('processEmbed - Resolved file:', file);

		if (!file) {
			console.error('processEmbed - Could not find file:', src);
			return;
		}

		if (file instanceof TFile) {
			try {
				const sgfContent = await this.app.vault.read(file);
				console.debug('processEmbed - Read SGF content, length:', sgfContent.length);

				// Create container for the Go board
				const container = document.createElement('div');
				container.className = 'goboard-container';

				// Replace the embed with our Go board
				embed.replaceWith(container);

				// Render the board
				this.renderGoBoard(container, sgfContent);
				console.debug('processEmbed - Successfully rendered Go board for:', src);
			} catch (error) {
				console.error('processEmbed - Error reading or rendering SGF file:', error);
				const errorDiv = document.createElement('div');
				errorDiv.className = 'goboard-error';
				errorDiv.textContent = `Error loading SGF file: ${error.message}`;
				embed.replaceWith(errorDiv);
			}
		}
	}

	/**
	 * Render a Go board with the given SGF content using Sabaki
	 */
	public renderGoBoard(container: HTMLElement, sgfContent: string, editMode: boolean = false, ctx?: MarkdownPostProcessorContext) {
		try {
			// Parse SGF
			const gameTrees = sgf.parse(sgfContent) as SGFGameTree[];
			if (!gameTrees || gameTrees.length === 0) {
				throw new Error('No game tree found in SGF');
			}

			const gameTree = gameTrees[0];

			// Debug: log the structure
			console.debug('Game tree:', gameTree);

			// Handle different possible structures
			const rootNode = gameTree.root || gameTree;

			if (!rootNode) {
				throw new Error('Could not find root node in game tree');
			}

			// Get board size from SGF
			const nodeData = rootNode.data || {};
			const sizeProperty = nodeData.SZ;
			const boardSize = sizeProperty ? parseInt(sizeProperty[0]) : 19;

			// Extract game information
			const gameInfo = {
				black: nodeData.PB ? nodeData.PB[0] : null,
				white: nodeData.PW ? nodeData.PW[0] : null,
				blackRank: nodeData.BR ? nodeData.BR[0] : null,
				whiteRank: nodeData.WR ? nodeData.WR[0] : null,
				result: nodeData.RE ? nodeData.RE[0] : null,
				date: nodeData.DT ? nodeData.DT[0] : null,
				event: nodeData.EV ? nodeData.EV[0] : null,
				round: nodeData.RO ? nodeData.RO[0] : null,
				place: nodeData.PC ? nodeData.PC[0] : null,
				gameName: nodeData.GN ? nodeData.GN[0] : null,
				komi: nodeData.KM ? nodeData.KM[0] : null,
				handicap: nodeData.HA ? nodeData.HA[0] : null,
				rules: nodeData.RU ? nodeData.RU[0] : null,
			};

			// Create wrapper and append to DOM first to get proper dimensions
			const wrapper = document.createElement('div');
			wrapper.className = 'goboard-wrapper';
			container.appendChild(wrapper);

			// Get actual available width from the parent container
			// container is our created div, so look at its parent or the viewport
			const parentElement = container.parentElement;
			let availableContainerWidth = 700; // Default

			if (parentElement) {
				const parentWidth = parentElement.clientWidth || parentElement.offsetWidth;
				if (parentWidth > 0) {
					availableContainerWidth = parentWidth;
				}
			}

			// If parent width is not available, use viewport width minus sidebars
			if (availableContainerWidth === 700) {
				const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
				// Assume sidebar takes about 300-400px on desktop, less on mobile
				const estimatedSidebarWidth = viewportWidth < 768 ? 0 : 350;
				availableContainerWidth = Math.max(300, viewportWidth - estimatedSidebarWidth - 40);
			}

			const containerWidth = Math.min(availableContainerWidth, 700);

			console.debug('Container width for board sizing:', containerWidth, 'parent width:', parentElement?.clientWidth, 'viewport:', window.innerWidth);

			// Use default vertex size - we'll use CSS zoom instead
			const calculatedVertexSize = 24;

			// Add game info section if we have any info
			if (gameInfo.black || gameInfo.white || gameInfo.event || gameInfo.gameName) {
				const infoSection = document.createElement('div');
				infoSection.className = 'goboard-game-info';

				if (gameInfo.gameName) {
					const titleEl = document.createElement('div');
					titleEl.className = 'game-info-title';
					titleEl.textContent = gameInfo.gameName;
					infoSection.appendChild(titleEl);
				}

				if (gameInfo.event) {
					const eventEl = document.createElement('div');
					eventEl.className = 'game-info-event';
					eventEl.textContent = gameInfo.event;
					if (gameInfo.round) {
						eventEl.textContent += ` - Round ${gameInfo.round}`;
					}
					infoSection.appendChild(eventEl);
				}

				const playersEl = document.createElement('div');
				playersEl.className = 'game-info-players';

				if (gameInfo.black || gameInfo.white) {
					const blackName = gameInfo.black || 'Unknown';
					const whiteName = gameInfo.white || 'Unknown';
					const blackRank = gameInfo.blackRank ? ` (${gameInfo.blackRank})` : '';
					const whiteRank = gameInfo.whiteRank ? ` (${gameInfo.whiteRank})` : '';

					const blackSpan = playersEl.createSpan({ cls: 'player-black' })
					blackSpan.textContent = `⚫ ${blackName}${blackRank}`;
					playersEl.appendText(' vs ');
					const whiteSpan = playersEl.createSpan({ cls: 'player-white' })
					whiteSpan.textContent = `⚪ ${whiteName}${whiteRank}`;
					infoSection.appendChild(playersEl);
				}

				const detailsEl = document.createElement('div');
				detailsEl.className = 'game-info-details';
				const details = [];

				if (gameInfo.date) details.push(`Date: ${gameInfo.date}`);
				if (gameInfo.place) details.push(`Place: ${gameInfo.place}`);
				if (gameInfo.komi) details.push(`Komi: ${gameInfo.komi}`);
				if (gameInfo.handicap) details.push(`Handicap: ${gameInfo.handicap}`);
				if (gameInfo.rules) details.push(`Rules: ${gameInfo.rules}`);
				if (gameInfo.result) details.push(`Result: ${gameInfo.result}`);

				if (details.length > 0) {
					detailsEl.textContent = details.join(' • ');
					infoSection.appendChild(detailsEl);
				}

				wrapper.appendChild(infoSection);
			}

			// Create board container
			const boardContainer = document.createElement('div');
			boardContainer.className = 'goboard-display';
			wrapper.appendChild(boardContainer);

			console.debug('Board size:', boardSize, 'Calculated vertexSize:', calculatedVertexSize, 'Container width:', containerWidth);

			// Create controls container
			const controlsContainer = document.createElement('div');
			controlsContainer.className = 'goboard-controls';
			wrapper.appendChild(controlsContainer);

			// Game state
			let moveNumber = 0;

			// Build move tree with variations
			interface MoveNode {
				node: SGFNode;
				moveNum: number;
				variations: SGFNode[]; // Child nodes (variations)
			}

			const allMoves: MoveNode[] = [];
			let currentVariationPath: number[] = []; // Which child index to follow at each decision point
			let rootVariationIndex: number = 0; // Which root variation to follow

			// Build complete move tree
			const buildMoveTree = (startNode: SGFNode, path: number[] = []): MoveNode[] => {
				const moves: MoveNode[] = [];
				let current = startNode;

				while (current) {
					const data = current.data || {};

					if (data.B || data.W) {
						moves.push({
							node: current,
							moveNum: moves.length + 1,
							variations: current.children || []
						});

						// Follow the selected variation path
						if (current.children && Array.isArray(current.children) && current.children.length > 0) {
							const pathIndex = path[moves.length - 1] || 0;
							const childIndex = Math.min(pathIndex, current.children.length - 1);
							current = current.children[childIndex];
						} else {
							break;
						}
					} else {
						// Non-move node, continue
						if (current.children && Array.isArray(current.children) && current.children.length > 0) {
							current = current.children[0];
						} else {
							break;
						}
					}
				}

				return moves;
			};

			// Rebuild move tree based on current variation path
			const rebuildMoveTree = () => {
				// Start from the selected root variation
				let startNode = rootNode;
				if (rootNode && rootNode.children && rootNode.children.length > rootVariationIndex) {
					startNode = rootNode.children[rootVariationIndex];
				}
				const moves = buildMoveTree(startNode, currentVariationPath);
				allMoves.length = 0;
				allMoves.push(...moves);
			};

			// Initialize with main line
			rootVariationIndex = 0;
			currentVariationPath = [];
			rebuildMoveTree();

			console.debug('Collected moves:', allMoves.length);

			// Function to get SGF markers and setup stones for current position
			const getSGFMarkers = (): (MarkerData | null)[][] => {
				const markerMap: (MarkerData | null)[][] = [];
				for (let i = 0; i < boardSize; i++) {
					markerMap[i] = new Array(boardSize).fill(null);
				}

				// Get current node data
				let currentNodeData: Record<string, string[]> = {};
				if (moveNumber === 0) {
					currentNodeData = rootNode?.data || {};
				} else if (moveNumber > 0 && moveNumber <= allMoves.length) {
					const moveNode = allMoves[moveNumber - 1];
					currentNodeData = moveNode.node?.data || {};
				}

				// Process SGF marker properties
				// TR - Triangle
				if (currentNodeData.TR) {
					const triangles = Array.isArray(currentNodeData.TR) ? currentNodeData.TR : [currentNodeData.TR];
					triangles.forEach((point: string) => {
						const coords = this.point2vertex(point);
						if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
							markerMap[coords.y][coords.x] = { type: 'triangle' };
						}
					});
				}

				// SQ - Square
				if (currentNodeData.SQ) {
					const squares = Array.isArray(currentNodeData.SQ) ? currentNodeData.SQ : [currentNodeData.SQ];
					squares.forEach((point: string) => {
						const coords = this.point2vertex(point);
						if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
							markerMap[coords.y][coords.x] = { type: 'square' };
						}
					});
				}

				// CR - Circle
				if (currentNodeData.CR) {
					const circles = Array.isArray(currentNodeData.CR) ? currentNodeData.CR : [currentNodeData.CR];
					circles.forEach((point: string) => {
						const coords = this.point2vertex(point);
						if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
							markerMap[coords.y][coords.x] = { type: 'circle' };
						}
					});
				}

				// MA - Mark (X)
				if (currentNodeData.MA) {
					const marks = Array.isArray(currentNodeData.MA) ? currentNodeData.MA : [currentNodeData.MA];
					marks.forEach((point: string) => {
						const coords = this.point2vertex(point);
						if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
							markerMap[coords.y][coords.x] = { type: 'point' };
						}
					});
				}

				// LB - Label
				if (currentNodeData.LB) {
					const labels = Array.isArray(currentNodeData.LB) ? currentNodeData.LB : [currentNodeData.LB];
					labels.forEach((labelData: string) => {
						// LB format is "point:label" like "dd:A"
						const match = labelData.match(/^([a-z]{2}):(.+)$/);
						if (match) {
							const coords = this.point2vertex(match[1]);
							if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
								markerMap[coords.y][coords.x] = { type: 'label', label: match[2] };
							}
						}
					});
				}

				// Add variation markers (if current position has variations)
				let variationSource: SGFNode | null = null;
				if (moveNumber === 0) {
					// Check root node for variations
					variationSource = rootNode;
				} else if (moveNumber > 0 && moveNumber <= allMoves.length) {
					// Check current move node for variations
					variationSource = allMoves[moveNumber - 1].node;
				}

				if (variationSource && variationSource.children && variationSource.children.length > 1) {
					variationSource.children.forEach((variation: SGFNode, index: number) => {
						// Get the first move of this variation
						const firstMove = variation.data?.B || variation.data?.W;

						if (firstMove && Array.isArray(firstMove) && firstMove[0]) {
							const coords = this.point2vertex(firstMove[0]);
							if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
								// Only add if no other marker exists
								if (!markerMap[coords.y][coords.x]) {
									markerMap[coords.y][coords.x] = {
										type: 'label',
										label: String.fromCharCode(65 + index) // A, B, C, ...
									};
								}
							}
						}
					});
				}

				console.debug('MarkerMap generated:', markerMap);
				return markerMap;
			};

			// Helper function to check if a group has any liberties
			const hasLiberties = (signMap: (0 | 1 | -1)[][], x: number, y: number, color: 1 | -1, visited: boolean[][]): boolean => {
				if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) return false;
				if (visited[y][x]) return false;

				visited[y][x] = true;

				// Empty point = liberty found
				if (signMap[y][x] === 0) return true;

				// Different color stone = no liberty here
				if (signMap[y][x] !== color) return false;

				// Same color stone = check neighbors
				return hasLiberties(signMap, x + 1, y, color, visited) ||
				       hasLiberties(signMap, x - 1, y, color, visited) ||
				       hasLiberties(signMap, x, y + 1, color, visited) ||
				       hasLiberties(signMap, x, y - 1, color, visited);
			};

			// Helper function to remove a group of stones
			const removeGroup = (signMap: (0 | 1 | -1)[][], x: number, y: number, color: 1 | -1): void => {
				if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) return;
				if (signMap[y][x] !== color) return;

				signMap[y][x] = 0;

				removeGroup(signMap, x + 1, y, color);
				removeGroup(signMap, x - 1, y, color);
				removeGroup(signMap, x, y + 1, color);
				removeGroup(signMap, x, y - 1, color);
			};

			// Helper function to remove captured stones after a move
			const removeCapturedStones = (signMap: (0 | 1 | -1)[][], lastX: number, lastY: number, lastColor: 1 | -1): void => {
				const opponentColor = lastColor === 1 ? -1 : 1;

				// Check all four neighbors of the last move
				const neighbors = [
					{x: lastX + 1, y: lastY},
					{x: lastX - 1, y: lastY},
					{x: lastX, y: lastY + 1},
					{x: lastX, y: lastY - 1}
				];

				for (const neighbor of neighbors) {
					if (neighbor.x >= 0 && neighbor.y >= 0 &&
					    neighbor.x < boardSize && neighbor.y < boardSize &&
					    signMap[neighbor.y][neighbor.x] === opponentColor) {

						const visited: boolean[][] = [];
						for (let i = 0; i < boardSize; i++) {
							visited[i] = new Array(boardSize).fill(false);
						}

						// If this opponent group has no liberties, remove it
						if (!hasLiberties(signMap, neighbor.x, neighbor.y, opponentColor, visited)) {
							removeGroup(signMap, neighbor.x, neighbor.y, opponentColor);
						}
					}
				}
			};

			// Function to get board state at current move
			const getBoardState = (): (0 | 1 | -1)[][] => {
				// Initialize empty board as 2D array
				const signMap: (0 | 1 | -1)[][] = [];
				for (let i = 0; i < boardSize; i++) {
					signMap[i] = [];
					for (let j = 0; j < boardSize; j++) {
						signMap[i][j] = 0;
					}
				}

				// Process root node setup stones (AB/AW)
				const rootData = rootNode?.data || {};

				// AB - Add Black stones (setup)
				if (rootData.AB) {
					const blackStones = Array.isArray(rootData.AB) ? rootData.AB : [rootData.AB];
					blackStones.forEach((point: string) => {
						const coords = this.point2vertex(point);
						if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
							signMap[coords.y][coords.x] = 1;
						}
					});
				}

				// AW - Add White stones (setup)
				if (rootData.AW) {
					const whiteStones = Array.isArray(rootData.AW) ? rootData.AW : [rootData.AW];
					whiteStones.forEach((point: string) => {
						const coords = this.point2vertex(point);
						if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
							signMap[coords.y][coords.x] = -1;
						}
					});
				}

				// AE - Add Empty (remove stones in setup)
				if (rootData.AE) {
					const emptyPoints = Array.isArray(rootData.AE) ? rootData.AE : [rootData.AE];
					emptyPoints.forEach((point: string) => {
						const coords = this.point2vertex(point);
						if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
							signMap[coords.y][coords.x] = 0;
						}
					});
				}

				if (!allMoves || !Array.isArray(allMoves)) {
					return signMap;
				}

				// moveNumber 0 = no moves, 1 = first move, etc.
				// So we render moves from index 0 to moveNumber-1
				for (let i = 0; i < moveNumber && i < allMoves.length; i++) {
					const moveNode = allMoves[i];
					if (!moveNode || !moveNode.node) continue;

					const data = moveNode.node.data || {};

					// Regular moves (B/W)
					const move = data.B || data.W;
					const color: 1 | -1 = data.B ? 1 : -1;

					if (move && Array.isArray(move) && move[0] && move[0] !== '') {
						const coords = this.point2vertex(move[0]);
						console.debug(`Move ${i}: SGF=${move[0]}, coords=(x=${coords.x}, y=${coords.y}), signMap[${coords.y}][${coords.x}], color=${color}`);
						if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
							signMap[coords.y][coords.x] = color;

							// Remove any captured stones after this move
							removeCapturedStones(signMap, coords.x, coords.y, color);
						}
					}

					// Setup stones in move nodes (AB/AW/AE)
					if (data.AB) {
						const blackStones = Array.isArray(data.AB) ? data.AB : [data.AB];
						blackStones.forEach((point: string) => {
							const coords = this.point2vertex(point);
							if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
								signMap[coords.y][coords.x] = 1;
							}
						});
					}

					if (data.AW) {
						const whiteStones = Array.isArray(data.AW) ? data.AW : [data.AW];
						whiteStones.forEach((point: string) => {
							const coords = this.point2vertex(point);
							if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
								signMap[coords.y][coords.x] = -1;
							}
						});
					}

					if (data.AE) {
						const emptyPoints = Array.isArray(data.AE) ? data.AE : [data.AE];
						emptyPoints.forEach((point: string) => {
							const coords = this.point2vertex(point);
							if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
								signMap[coords.y][coords.x] = 0;
							}
						});
					}
				}

				return signMap;
			};

			// Track if zoom has been applied
			let zoomApplied = false;

			// Edit mode state
			let currentMode = 'move';
			let currentLabelText = 'A';

			// Function to update game info display
			const updateGameInfoDisplay = () => {
				const existingInfoSection = wrapper.querySelector('.goboard-game-info');
				if (existingInfoSection) {
					existingInfoSection.remove();
				}

				// Re-extract game information from rootNode
				const nodeData = rootNode.data || {};
				const updatedGameInfo = {
					black: nodeData.PB ? nodeData.PB[0] : null,
					white: nodeData.PW ? nodeData.PW[0] : null,
					blackRank: nodeData.BR ? nodeData.BR[0] : null,
					whiteRank: nodeData.WR ? nodeData.WR[0] : null,
					result: nodeData.RE ? nodeData.RE[0] : null,
					date: nodeData.DT ? nodeData.DT[0] : null,
					event: nodeData.EV ? nodeData.EV[0] : null,
					round: nodeData.RO ? nodeData.RO[0] : null,
					place: nodeData.PC ? nodeData.PC[0] : null,
					gameName: nodeData.GN ? nodeData.GN[0] : null,
					komi: nodeData.KM ? nodeData.KM[0] : null,
					handicap: nodeData.HA ? nodeData.HA[0] : null,
					rules: nodeData.RU ? nodeData.RU[0] : null,
				};

				if (updatedGameInfo.black || updatedGameInfo.white || updatedGameInfo.event || updatedGameInfo.gameName) {
					const infoSection = document.createElement('div');
					infoSection.className = 'goboard-game-info';

					if (updatedGameInfo.gameName) {
						const titleEl = document.createElement('div');
						titleEl.className = 'game-info-title';
						titleEl.textContent = updatedGameInfo.gameName;
						infoSection.appendChild(titleEl);
					}

					if (updatedGameInfo.event) {
						const eventEl = document.createElement('div');
						eventEl.className = 'game-info-event';
						eventEl.textContent = updatedGameInfo.event;
						if (updatedGameInfo.round) {
							eventEl.textContent += ` - Round ${updatedGameInfo.round}`;
						}
						infoSection.appendChild(eventEl);
					}

					const playersEl = document.createElement('div');
					playersEl.className = 'game-info-players';

					if (updatedGameInfo.black || updatedGameInfo.white) {
						const blackName = updatedGameInfo.black || 'Unknown';
						const whiteName = updatedGameInfo.white || 'Unknown';
						const blackRank = updatedGameInfo.blackRank ? ` (${updatedGameInfo.blackRank})` : '';
						const whiteRank = updatedGameInfo.whiteRank ? ` (${updatedGameInfo.whiteRank})` : '';

						const blackSpan = playersEl.createSpan({ cls: 'player-black' })
						blackSpan.textContent = `⚫ ${blackName}${blackRank}`;
						playersEl.appendText(' vs ');
						const whiteSpan = playersEl.createSpan({ cls: 'player-white' })
						whiteSpan.textContent = `⚪ ${whiteName}${whiteRank}`;
						infoSection.appendChild(playersEl);
					}

					const detailsEl = document.createElement('div');
					detailsEl.className = 'game-info-details';
					const details = [];

					if (updatedGameInfo.date) details.push(`Date: ${updatedGameInfo.date}`);
					if (updatedGameInfo.place) details.push(`Place: ${updatedGameInfo.place}`);
					if (updatedGameInfo.komi) details.push(`Komi: ${updatedGameInfo.komi}`);
					if (updatedGameInfo.handicap) details.push(`Handicap: ${updatedGameInfo.handicap}`);
					if (updatedGameInfo.rules) details.push(`Rules: ${updatedGameInfo.rules}`);
					if (updatedGameInfo.result) details.push(`Result: ${updatedGameInfo.result}`);

					if (details.length > 0) {
						detailsEl.textContent = details.join(' • ');
						infoSection.appendChild(detailsEl);
					}

					// Insert at the beginning of wrapper (before board container)
					const boardContainer = wrapper.querySelector('.goboard-display');
					if (boardContainer) {
						wrapper.insertBefore(infoSection, boardContainer);
					} else {
						wrapper.appendChild(infoSection);
					}
				}
			};

			// Render function
			const renderBoard = () => {
				const signMap = getBoardState();

				// Update game info display
				if (editMode) {
					updateGameInfoDisplay();
				}

				console.debug('Rendering board at move:', moveNumber);
				console.debug('SignMap:', signMap);
				console.debug('Board size:', boardSize);

				// Get current node for edit mode
				let currentNode: SGFNode;
				if (moveNumber === 0) {
					currentNode = rootNode;
				} else if (moveNumber > 0 && moveNumber <= allMoves.length) {
					currentNode = allMoves[moveNumber - 1].node;
				} else {
					currentNode = rootNode;
				}

				// Get comment from the last displayed move
				let comment = '';
				let hasVariations = false;

				if (moveNumber === 0) {
					// Show root node comment if any
					const rootData = rootNode ? (rootNode.data || {}) : {};
					comment = rootData.C ? rootData.C[0] : '';
					// Check if root has variations
					hasVariations = Boolean(rootNode && rootNode.children && rootNode.children.length > 1);
				} else if (allMoves && moveNumber > 0 && moveNumber <= allMoves.length) {
					// Show comment from the last displayed move
					const moveNode = allMoves[moveNumber - 1];
					const data = moveNode.node ? (moveNode.node.data || {}) : {};
					comment = data.C ? data.C[0] : '';

					// Check if this move has variations
					hasVariations = Boolean(moveNode.node && moveNode.node.children && moveNode.node.children.length > 1);
				}

				// Render Goban
				// Get SGF markers for current position
				const markerMap = getSGFMarkers();

				// Create empty paint map
				const emptyPaintMap: (0 | 1 | -1)[][] = [];
				for (let i = 0; i < boardSize; i++) {
					emptyPaintMap[i] = new Array(boardSize).fill(0) as (0 | 1 | -1)[];
				}

				// Log the props being passed to Goban
				const gobanProps = {
					vertexSize: calculatedVertexSize,
					signMap,
					dimmedVertices: [],
					markerMap: markerMap,
					paintMap: emptyPaintMap,
					showCoordinates: true,
					busy: false,
					fuzzyStonePlacement: false,
					animateStonePlacement: false,
					...(editMode && {
						onVertexClick: (_evt: MouseEvent, vertex: [number, number]) => {
							const newMoveNumber = this.handleVertexClick(vertex, currentNode, allMoves, moveNumber, rebuildMoveTree, currentMode, currentLabelText);
							if (newMoveNumber !== null) {
								moveNumber = newMoveNumber;
							}
							renderBoard();
						}
					})
				};

				console.debug('Goban props:', gobanProps);

				// @ts-ignore
				render(
					h(Goban, gobanProps),
					boardContainer
				);

				// Apply CSS zoom to fit the board in available space (only once)
				if (!zoomApplied) {
					const applyZoom = () => {
						const gobanElement = boardContainer.querySelector('.shudan-goban') as HTMLElement;
						if (!gobanElement) return;

						// Reset zoom to get natural size
						gobanElement.setCssProps({ zoom: '1' })

						// Force layout (accessing offsetHeight triggers layout)
						void gobanElement.offsetHeight;

						// Get the natural rendered size
						const naturalWidth = gobanElement.scrollWidth || gobanElement.offsetWidth;
						const naturalHeight = gobanElement.scrollHeight || gobanElement.offsetHeight;

						// Get available width
						const availableWidth = containerWidth - 32;

						console.debug('Natural board size:', naturalWidth, 'x', naturalHeight, 'Available width:', availableWidth, 'Container width:', containerWidth);

						// Calculate zoom
						if (naturalWidth > availableWidth) {
							const zoomFactor = availableWidth / naturalWidth;
							console.debug('Board too wide! Applying zoom factor:', zoomFactor);

							gobanElement.setCssProps({ zoom: `${zoomFactor}` })
						} else {
							console.debug('Board fits naturally, no zoom needed');
							gobanElement.setCssProps({ zoom: '1' })
						}

						zoomApplied = true;
					};

					setTimeout(applyZoom, 100);
				}

				// Mark variation labels with a special class for blue styling
				setTimeout(() => {
					// Find all variation markers
					let variationSource: SGFNode | null = null;
					if (moveNumber === 0) {
						variationSource = rootNode;
					} else if (moveNumber > 0 && moveNumber <= allMoves.length) {
						variationSource = allMoves[moveNumber - 1].node;
					}

					if (variationSource && variationSource.children && variationSource.children.length > 1) {
						variationSource.children.forEach((variation: SGFNode, index: number) => {
							const firstMove = variation.data?.B || variation.data?.W;
							if (firstMove && Array.isArray(firstMove) && firstMove[0]) {
								const coords = this.point2vertex(firstMove[0]);
								if (coords.x >= 0 && coords.y >= 0 && coords.x < boardSize && coords.y < boardSize) {
									// Find the marker element at this position
									const vertices = boardContainer.querySelectorAll('.shudan-vertex');
									const targetIndex = coords.y * boardSize + coords.x;
									if (vertices[targetIndex]) {
										const marker = vertices[targetIndex].querySelector('.shudan-marker');
										if (marker) {
											marker.classList.add('variation-marker');
										}
									}
								}
							}
						});
					}
				}, 10);

				// Update info display
				const totalMoves = allMoves ? allMoves.length : 0;

				const existingInfo = controlsContainer.querySelector('.goboard-info');
				if (existingInfo) {
					existingInfo.remove();
				}

				const infoDiv = controlsContainer.createDiv({ cls: 'goboard-info' })
				const moveDiv = infoDiv.createDiv();
				const moveLabelStrong = moveDiv.createEl('strong');
				moveLabelStrong.textContent = 'Move:';
				moveDiv.appendText(` ${moveNumber} / ${totalMoves}`);

				if (hasVariations) {
					const variationSpan = moveDiv.createSpan({ cls: 'variation-indicator' })
					variationSpan.textContent = '(has variations)';
				}

				// Comment section (display only)
				if (comment) {
					const commentDiv = infoDiv.createDiv({ cls: 'goboard-comment' })
					commentDiv.textContent = comment;
				}

				controlsContainer.insertBefore(infoDiv, controlsContainer.firstChild);

				// Add edit mode controls
				if (editMode) {
					// Add mode selector
					const existingModeSelector = controlsContainer.querySelector('.goboard-mode-selector');
					if (existingModeSelector) {
						existingModeSelector.remove();
					}

					const modeSelectorContainer = controlsContainer.createDiv({ cls: 'goboard-mode-selector' });
					const modeLabel = modeSelectorContainer.createEl('strong');
					modeLabel.textContent = 'Click mode: ';

					const modeSelect = modeSelectorContainer.createEl('select');
					modeSelect.className = 'goboard-mode-select';
					const modes = [
						{ value: 'move', label: 'Move' },
						{ value: 'black', label: 'Black Stone' },
						{ value: 'white', label: 'White Stone' },
						{ value: 'triangle', label: 'Triangle' },
						{ value: 'square', label: 'Square' },
						{ value: 'circle', label: 'Circle' },
						{ value: 'mark', label: 'Mark (X)' },
						{ value: 'label', label: 'Label' }
					];

					modes.forEach(mode => {
						const option = modeSelect.createEl('option');
						option.value = mode.value;
						option.textContent = mode.label;
					});

					// Restore current mode selection
					modeSelect.value = currentMode;

					// Add label input (shown only when Label mode is selected)
					const labelInputContainer = modeSelectorContainer.createDiv({ cls: 'goboard-label-input-container' });
					labelInputContainer.style.display = currentMode === 'label' ? 'inline' : 'none';
					const labelInputLabel = labelInputContainer.createEl('span');
					labelInputLabel.textContent = ' Text: ';
					const labelInput = labelInputContainer.createEl('input');
					labelInput.type = 'text';
					labelInput.className = 'goboard-label-input';
					labelInput.maxLength = 3;
					labelInput.value = currentLabelText;

					modeSelect.addEventListener('change', () => {
						currentMode = modeSelect.value;
						if (modeSelect.value === 'label') {
							labelInputContainer.style.display = 'inline';
						} else {
							labelInputContainer.style.display = 'none';
						}
					});

					labelInput.addEventListener('input', () => {
						currentLabelText = labelInput.value || 'A';
					});

					controlsContainer.appendChild(modeSelectorContainer);

					// Add comment editor
					const existingCommentEditor = controlsContainer.querySelector('.goboard-comment-editor');
					if (existingCommentEditor) {
						existingCommentEditor.remove();
					}

					const commentEditor = controlsContainer.createDiv({ cls: 'goboard-comment-editor' });
					const commentEditorTitle = commentEditor.createEl('strong');
					commentEditorTitle.textContent = 'Comment for current position:';
					const commentTextarea = commentEditor.createEl('textarea');
					commentTextarea.className = 'goboard-comment-edit';
					commentTextarea.value = comment;
					commentTextarea.placeholder = 'Enter comment for this position...';

					// Capture currentNode reference
					const nodeToEdit = currentNode;

					const saveCommentBtn = commentEditor.createEl('button');
					saveCommentBtn.className = 'goboard-btn goboard-btn-save';
					saveCommentBtn.textContent = '💾 Save Comment';
					saveCommentBtn.onclick = () => {
						if (!nodeToEdit.data) {
							nodeToEdit.data = {};
						}
						if (commentTextarea.value.trim()) {
							nodeToEdit.data.C = [commentTextarea.value];
						} else {
							delete nodeToEdit.data.C;
						}
						renderBoard();
						saveCommentBtn.textContent = '✓ Saved!';
						setTimeout(() => {
							saveCommentBtn.textContent = '💾 Save Comment';
						}, 1000);
					};

					controlsContainer.appendChild(commentEditor);

					// Add game info editor
					const existingGameInfoEditor = controlsContainer.querySelector('.goboard-game-info-editor');
					if (existingGameInfoEditor) {
						existingGameInfoEditor.remove();
					}

					const gameInfoEditor = controlsContainer.createDiv({ cls: 'goboard-game-info-editor' });
					const gameInfoTitle = gameInfoEditor.createEl('strong');
					gameInfoTitle.textContent = 'Game Information:';

					const gameInfoGrid = gameInfoEditor.createDiv({ cls: 'game-info-grid' });

					// Store all input elements for batch save
					const gameInfoInputs: HTMLInputElement[] = [];

					// Modified helper function to store input references
					const createInfoInput = (label: string, property: string, placeholder: string) => {
						const row = gameInfoGrid.createDiv({ cls: 'game-info-row' });
						const labelEl = row.createEl('label');
						labelEl.textContent = label + ':';
						const input = row.createEl('input');
						input.type = 'text';
						input.placeholder = placeholder;
						input.value = rootNode.data?.[property]?.[0] || '';
						input.dataset.property = property;
						gameInfoInputs.push(input);
					};

					createInfoInput('Black Player', 'PB', 'Player name');
					createInfoInput('Black Rank', 'BR', 'e.g. 5d');
					createInfoInput('White Player', 'PW', 'Player name');
					createInfoInput('White Rank', 'WR', 'e.g. 3d');
					createInfoInput('Game Name', 'GN', 'Game title');
					createInfoInput('Event', 'EV', 'Tournament name');
					createInfoInput('Round', 'RO', 'Round number');
					createInfoInput('Date', 'DT', 'YYYY-MM-DD');
					createInfoInput('Place', 'PC', 'Location');
					createInfoInput('Komi', 'KM', 'e.g. 6.5');
					createInfoInput('Handicap', 'HA', 'Number of stones');
					createInfoInput('Result', 'RE', 'e.g. B+3.5');
					createInfoInput('Rules', 'RU', 'e.g. Japanese');

					// Add save button for game info
					const saveGameInfoBtn = gameInfoEditor.createEl('button');
					saveGameInfoBtn.className = 'goboard-btn goboard-btn-save';
					saveGameInfoBtn.textContent = '💾 Save Game Info';
					saveGameInfoBtn.onclick = () => {
						if (!rootNode.data) {
							rootNode.data = {};
						}
						gameInfoInputs.forEach(input => {
							const property = input.dataset.property;
							if (property && rootNode.data) {
								if (input.value.trim()) {
									rootNode.data[property] = [input.value];
								} else {
									delete rootNode.data[property];
								}
							}
						});
						renderBoard();
						saveGameInfoBtn.textContent = '✓ Saved!';
						setTimeout(() => {
							saveGameInfoBtn.textContent = '💾 Save Game Info';
						}, 1000);
					};

					controlsContainer.appendChild(gameInfoEditor);

					// Add delete button in edit mode
					const existingDeleteBtn = controlsContainer.querySelector('.goboard-delete-container');
					if (existingDeleteBtn) {
						existingDeleteBtn.remove();
					}

					const deleteContainer = controlsContainer.createDiv({ cls: 'goboard-delete-container' });
					const btnDeleteFromHere = deleteContainer.createEl('button');
					btnDeleteFromHere.className = 'goboard-btn goboard-btn-delete';
					btnDeleteFromHere.textContent = '🗑 Delete from here';
					btnDeleteFromHere.onclick = () => {
						const newMoveNumber = this.deleteFromCurrentNode(rootNode, allMoves, moveNumber, rebuildMoveTree);
						moveNumber = newMoveNumber;
						renderBoard();
					};

					controlsContainer.appendChild(deleteContainer);

					// Add SGF output
					const existingSgfOutput = controlsContainer.querySelector('.goboard-sgf-output');
					if (existingSgfOutput) {
						existingSgfOutput.remove();
					}

					const sgfOutputContainer = controlsContainer.createDiv({ cls: 'goboard-sgf-output' });
					const sgfLabel = sgfOutputContainer.createEl('strong');
					sgfLabel.textContent = 'SGF output:';

					const sgfTextarea = sgfOutputContainer.createEl('textarea');
					sgfTextarea.className = 'goboard-sgf-textarea';
					sgfTextarea.readOnly = true;
					sgfTextarea.value = sgf.stringify([rootNode]);

					// Add button container for write and copy buttons
					const btnContainer = sgfOutputContainer.createDiv({ cls: 'goboard-sgf-buttons' });

					// Add write to note button (only if ctx is available)
					if (ctx) {
						const writeBtn = btnContainer.createEl('button');
						writeBtn.className = 'goboard-btn goboard-btn-write';
						writeBtn.textContent = '💾 Write to Note';
						writeBtn.onclick = async () => {
							try {
								const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
								if (file instanceof TFile) {
									const content = await this.app.vault.read(file);
									const newSgf = sgfTextarea.value;

									// Find and replace the sgf-edit code block
									const regex = /```sgf-edit\n[\s\S]*?\n```/i;
									const newContent = content.replace(regex, `\`\`\`sgf-edit\n${newSgf}\n\`\`\``);

									await this.app.vault.modify(file, newContent);
									writeBtn.textContent = '✓ Written!';
									setTimeout(() => {
										writeBtn.textContent = '💾 Write to Note';
									}, 2000);
								}
							} catch (error) {
								console.error('Error writing to note:', error);
								writeBtn.textContent = '✗ Error';
								setTimeout(() => {
									writeBtn.textContent = '💾 Write to Note';
								}, 2000);
							}
						};
					}


					controlsContainer.appendChild(sgfOutputContainer);
				}

				// Update variation selection UI
				let variationContainer = controlsContainer.querySelector('.goboard-variations');

				// Remove existing variation container if present
				if (variationContainer) {
					variationContainer.remove();
				}

				// Add variation selection buttons if current position has variations
				if (hasVariations) {
					let variations: SGFNode[] = [];
					let pathIndex = -1;

					if (moveNumber === 0) {
						// Root node variations
						variations = rootNode?.children || [];
						pathIndex = -1; // Root variations don't use path index
					} else if (moveNumber > 0 && moveNumber <= allMoves.length) {
						// Move node variations
						const moveNode = allMoves[moveNumber - 1];
						variations = moveNode.node?.children || [];
						pathIndex = moveNumber - 1;
					}

					if (variations.length > 1) {
						variationContainer = document.createElement('div');
						variationContainer.className = 'goboard-variations';

						const label = document.createElement('div');
						label.className = 'goboard-variations-label';
						label.textContent = 'Select variation:';
						variationContainer.appendChild(label);

						const btnGroup = document.createElement('div');
						btnGroup.className = 'goboard-variations-buttons';

						// Get current selected variation for this position
						const currentVariationIndex = moveNumber === 0 ? rootVariationIndex : (pathIndex >= 0 ? (currentVariationPath[pathIndex] || 0) : 0);

						variations.forEach((_variation: SGFNode, index: number) => {
							const btn = document.createElement('button');
							btn.className = 'goboard-variation-btn';
							if (index === currentVariationIndex) {
								btn.className += ' selected';
							}
							btn.textContent = String.fromCharCode(65 + index); // A, B, C, ...
							btn.onclick = () => {
								if (moveNumber === 0) {
									// Root variation selection
									rootVariationIndex = index;
									currentVariationPath = []; // Reset path
									moveNumber = 0; // Stay at move 0
								} else if (pathIndex >= 0) {
									// Regular move variation selection
									currentVariationPath[pathIndex] = index;
								}

								// Rebuild move tree from this point
								rebuildMoveTree();

								// Re-render the board
								renderBoard();
							};
							btnGroup.appendChild(btn);
						});

						variationContainer.appendChild(btnGroup);
						controlsContainer.insertBefore(variationContainer, controlsContainer.querySelector('.goboard-btn-group'));
					}
				}
			};

			// Create control buttons
			const createButton = (text: string, onClick: () => void) => {
				const btn = document.createElement('button');
				btn.className = 'goboard-btn';
				btn.textContent = text;
				btn.onclick = () => {
					onClick();
					renderBoard();
				};
				return btn;
			};

			const btnFirst = createButton('⏮ First', () => {
				moveNumber = 0;
			});

			const btnPrev = createButton('◀ Prev', () => {
				if (moveNumber > 0) moveNumber--;
			});

			const btnNext = createButton('▶ Next', () => {
				const totalMoves = allMoves ? allMoves.length : 0;
				if (moveNumber < totalMoves) moveNumber++;
			});

			const btnLast = createButton('⏭ Last', () => {
				moveNumber = allMoves ? allMoves.length : 0;
			});

			const btnContainer = document.createElement('div');
			btnContainer.className = 'goboard-btn-group';
			btnContainer.appendChild(btnFirst);
			btnContainer.appendChild(btnPrev);
			btnContainer.appendChild(btnNext);
			btnContainer.appendChild(btnLast);

			controlsContainer.appendChild(btnContainer);

			// Initial render
			renderBoard();

			// Add resize listener for responsive behavior
			let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
			const resizeObserver = new ResizeObserver(() => {
				// Debounce resize events
				clearTimeout(resizeTimeout);
				resizeTimeout = setTimeout(() => {
					const gobanElement = boardContainer.querySelector('.shudan-goban') as HTMLElement;
					if (!gobanElement) return;

					// Recalculate container width
					const parentElement = container.parentElement;
					let availableContainerWidth = 700;

					if (parentElement) {
						const parentWidth = parentElement.clientWidth || parentElement.offsetWidth;
						if (parentWidth > 0) {
							availableContainerWidth = parentWidth;
						}
					}

					if (availableContainerWidth === 700) {
						const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
						const estimatedSidebarWidth = viewportWidth < 768 ? 0 : 350;
						availableContainerWidth = Math.max(300, viewportWidth - estimatedSidebarWidth - 40);
					}

					const newContainerWidth = Math.min(availableContainerWidth, 700);

					// Reset and remeasure
					gobanElement.setCssProps({ zoom: '1' })
					// Force layout (accessing offsetHeight triggers layout)
					void gobanElement.offsetHeight;

					const naturalWidth = gobanElement.scrollWidth || gobanElement.offsetWidth;
					const newAvailableWidth = newContainerWidth - 32;

					if (naturalWidth > newAvailableWidth) {
						const zoomFactor = newAvailableWidth / naturalWidth;
						gobanElement.setCssProps({ zoom: `${zoomFactor}` })
					} else {
						gobanElement.setCssProps({ zoom: '1' })
					}
				}, 100);
			});

			// Observe the wrapper for size changes
			resizeObserver.observe(wrapper);

		} catch (error) {
			console.error('Error rendering Go board:', error);
			const errorDiv = document.createElement('div');
			errorDiv.className = 'goboard-error';
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			errorDiv.textContent = 'Error rendering Go board: ' + errorMessage;
			container.appendChild(errorDiv);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyCSSVariables();
	}

	applyCSSVariables() {
		document.body.setCssProps({
			'--goboard-bg-color': this.settings.boardColor,
			'--goboard-line-color': this.settings.lineColor,
			'--goboard-coordinate-color': this.settings.coordinateColor,
			'--goboard-marker-color': this.settings.markerColor,
			'--goboard-variation-color': this.settings.variationColor
		});
	}
}

class GoBoardSettingTab extends PluginSettingTab {
	plugin: GoBoardViewerPlugin;

	constructor(app: App, plugin: GoBoardViewerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Go Board Viewer')
			.setHeading();

		new Setting(containerEl)
			.setName('Board background color')
			.setDesc('Color of the go board background')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.boardColor)
				.onChange(async (value) => {
					this.plugin.settings.boardColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Board line color')
			.setDesc('Color of the go board grid lines')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.lineColor)
				.onChange(async (value) => {
					this.plugin.settings.lineColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Coordinate color')
			.setDesc('Color of the board coordinates (A-T, 1-19)')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.coordinateColor)
				.onChange(async (value) => {
					this.plugin.settings.coordinateColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Marker color')
			.setDesc('Color of SGF markers (circles, triangles, squares, labels)')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.markerColor)
				.onChange(async (value) => {
					this.plugin.settings.markerColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Variation label color')
			.setDesc('Color of variation labels (A, B, C, etc.)')
			.addColorPicker(color => color
				.setValue(this.plugin.settings.variationColor)
				.onChange(async (value) => {
					this.plugin.settings.variationColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Reset colors')
			.setDesc('Reset all colors to default values')
			.addButton(button => button
				.setButtonText('Reset to defaults')
				.onClick(async () => {
					this.plugin.settings.boardColor = DEFAULT_SETTINGS.boardColor;
					this.plugin.settings.lineColor = DEFAULT_SETTINGS.lineColor;
					this.plugin.settings.coordinateColor = DEFAULT_SETTINGS.coordinateColor;
					this.plugin.settings.markerColor = DEFAULT_SETTINGS.markerColor;
					this.plugin.settings.variationColor = DEFAULT_SETTINGS.variationColor;
					await this.plugin.saveSettings();
					this.display(); // Refresh the settings display
				}));
	}
}
