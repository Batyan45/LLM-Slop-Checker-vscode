import * as vscode from 'vscode';

let slopDecorationType: vscode.TextEditorDecorationType;
let statusBarItem: vscode.StatusBarItem;

interface SlopMatch {
    range: vscode.Range;
    message: string;
    text: string;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('LLM Slop Checker is active');

    // Create decoration type
    slopDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.3)', // Yellowish highlight
        overviewRulerColor: 'rgba(255, 255, 0, 0.8)',
        overviewRulerLane: vscode.OverviewRulerLane.Right
    });

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'llmSlopChecker.showIssues';
    context.subscriptions.push(statusBarItem);

    // Register command
    const showIssuesCommand = vscode.commands.registerCommand('llmSlopChecker.showIssues', () => {
        showIssues();
    });
    context.subscriptions.push(showIssuesCommand);

    // Initial update
    if (vscode.window.activeTextEditor) {
        updateDecorations(vscode.window.activeTextEditor);
    }

    // Event listeners
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                updateDecorations(editor);
            } else {
                statusBarItem.hide();
            }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
                updateDecorations(vscode.window.activeTextEditor);
            }
        }),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('llmSlopChecker')) {
                if (vscode.window.activeTextEditor) {
                    updateDecorations(vscode.window.activeTextEditor);
                }
            }
        })
    );
}

function scanDocument(document: vscode.TextDocument, config: vscode.WorkspaceConfiguration): SlopMatch[] {
    const text = document.getText();
    const slopMatches: SlopMatch[] = [];

    // Check Emojis
    if (config.get<boolean>('checkEmojis', true)) {
        const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
        let match;
        while ((match = emojiRegex.exec(text))) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            const message = `Suspicious Emoji: ${match[0]}`;
            slopMatches.push({ range, message, text: match[0] });
        }
    }

    // Check Suspicious Symbols
    const suspiciousSymbols = config.get<string[]>('suspiciousSymbols', []);
    for (const symbol of suspiciousSymbols) {
        let index = text.indexOf(symbol);
        while (index !== -1) {
            const startPos = document.positionAt(index);
            const endPos = document.positionAt(index + symbol.length);
            const range = new vscode.Range(startPos, endPos);
            const message = `Suspicious Symbol: ${symbol}`;
            slopMatches.push({ range, message, text: symbol });
            index = text.indexOf(symbol, index + 1);
        }
    }

    // Check Suspicious Words
    const suspiciousWords = config.get<string[]>('suspiciousWords', []);
    for (const word of suspiciousWords) {
        // Use word boundary regex to avoid partial matches
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        let match;
        while ((match = regex.exec(text))) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            const message = `Suspicious Word: ${match[0]}`;
            slopMatches.push({ range, message, text: match[0] });
        }
    }

    return slopMatches;
}

function updateDecorations(editor: vscode.TextEditor) {
    const config = vscode.workspace.getConfiguration('llmSlopChecker');
    if (!config.get<boolean>('enable', true)) {
        editor.setDecorations(slopDecorationType, []);
        statusBarItem.hide();
        return;
    }

    const slopMatches = scanDocument(editor.document, config);
    const decorations: vscode.DecorationOptions[] = slopMatches.map(match => ({
        range: match.range,
        hoverMessage: match.message
    }));

    editor.setDecorations(slopDecorationType, decorations);
    updateStatusBar(slopMatches.length);
}

function updateStatusBar(count: number) {
    if (count > 0) {
        statusBarItem.text = `$(alert) ${count} Slop`;
        statusBarItem.tooltip = `Found ${count} suspicious items. Click to list.`;
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

async function showIssues() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const config = vscode.workspace.getConfiguration('llmSlopChecker');
    const slopMatches = scanDocument(editor.document, config);

    slopMatches.sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character);

    if (slopMatches.length === 0) {
        vscode.window.showInformationMessage('No suspicious items found.');
        return;
    }

    const items = slopMatches.map(match => ({
        label: `${match.range.start.line + 1}:${match.range.start.character + 1} - ${match.message}`,
        description: '',
        match: match
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an issue to jump to',
    });

    if (selected) {
        editor.selection = new vscode.Selection(selected.match.range.start, selected.match.range.end);
        editor.revealRange(selected.match.range, vscode.TextEditorRevealType.InCenter);
    }
}

export function deactivate() {}
