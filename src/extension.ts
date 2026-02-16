import * as vscode from 'vscode';
import { DEFAULT_SYMBOL_REPLACEMENTS, DEFAULT_SUSPICIOUS_WORDS, DEFAULT_EMOJI_EXCEPTIONS } from './defaults';

let symbolDecorationType: vscode.TextEditorDecorationType;
let wordDecorationType: vscode.TextEditorDecorationType;
let statusBarItem: vscode.StatusBarItem;
let diagnosticCollection: vscode.DiagnosticCollection;

interface SlopMatch {
    range: vscode.Range;
    message: string;
    text: string;
    type: 'symbol' | 'word' | 'emoji';
    replacement?: string;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('LLM Slop Checker is active');

    // Create decoration types
    symbolDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.wordHighlightStrongBackground'),
        overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.warningForeground'), // Changed to warning as requested
        overviewRulerLane: vscode.OverviewRulerLane.Right
    });

    wordDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
        overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.warningForeground'),
        overviewRulerLane: vscode.OverviewRulerLane.Right
    });

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'llmSlopChecker.showIssues';
    context.subscriptions.push(statusBarItem);

    // Create diagnostic collection
    diagnosticCollection = vscode.languages.createDiagnosticCollection('llmSlopChecker');
    context.subscriptions.push(diagnosticCollection);

    // Register commands
    const showIssuesCommand = vscode.commands.registerCommand('llmSlopChecker.showIssues', () => {
        showIssues();
    });
    
    const fixIssuesCommand = vscode.commands.registerCommand('llmSlopChecker.fixIssues', () => {
        fixIssues();
    });

    context.subscriptions.push(showIssuesCommand, fixIssuesCommand);

    // Initial update
    if (vscode.window.activeTextEditor) {
        updateDecorations(vscode.window.activeTextEditor);
    }

    // Event listeners
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
            // Update diagnostics for the changed document if enabled
            const config = vscode.workspace.getConfiguration('llmSlopChecker');
            if (config.get<boolean>('enableProblemsIntegration', false)) {
                 updateDiagnostics(event.document, config);
            }
        }),
        vscode.workspace.onDidOpenTextDocument(document => {
             const config = vscode.workspace.getConfiguration('llmSlopChecker');
             if (config.get<boolean>('enableProblemsIntegration', false)) {
                  updateDiagnostics(document, config);
             }
        }),
        vscode.workspace.onDidSaveTextDocument(document => {
             // Re-scan ensures everything is up to date on save
             const config = vscode.workspace.getConfiguration('llmSlopChecker');
             if (config.get<boolean>('enableProblemsIntegration', false)) {
                  updateDiagnostics(document, config);
             }
        }),
        vscode.workspace.onDidDeleteFiles(event => {
            event.files.forEach(file => {
                diagnosticCollection.delete(file);
            });
        }),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('llmSlopChecker')) {
                const config = vscode.workspace.getConfiguration('llmSlopChecker');
                if (vscode.window.activeTextEditor) {
                    updateDecorations(vscode.window.activeTextEditor);
                }
                
                if (config.get<boolean>('enableProblemsIntegration', false)) {
                    // unexpected side effect: if specific setting changed, we might need to re-scan
                    // scanWorkspace handles everything
                    scanWorkspace(config);
                } else {
                    diagnosticCollection.clear();
                }
            }
        })
    );

    // Initial workspace scan if enabled
    const config = vscode.workspace.getConfiguration('llmSlopChecker');
    if (config.get<boolean>('enableProblemsIntegration', false)) {
        scanWorkspace(config);
    }
}

function getSymbolReplacements(config: vscode.WorkspaceConfiguration): { [key: string]: string } {
    const userReplacementsRaw = config.get('symbolReplacements');
    const finalReplacements = { ...DEFAULT_SYMBOL_REPLACEMENTS };
    
    // Check if it's the old format (array of objects) or new format (array of strings)
    // We'll prioritize the new format but try to be safe.
    if (Array.isArray(userReplacementsRaw)) {
        for (const item of userReplacementsRaw) {
             if (typeof item === 'string') {
                const parts = item.split(':');
                if (parts.length >= 2) {
                    const symbol = parts[0];
                    // Join the rest back in case replacement has a colon, though unlikely for this use case
                    const replacement = parts.slice(1).join(':');
                    
                    if (replacement === "") {
                        delete finalReplacements[symbol];
                    } else {
                        finalReplacements[symbol] = replacement;
                    }
                }
             } else if (typeof item === 'object' && item !== null && 'symbol' in item && 'replacement' in item) {
                 // Legacy format support attempt
                 const symbol = (item as any).symbol;
                 const replacement = (item as any).replacement;
                 if (replacement === "") {
                    delete finalReplacements[symbol];
                } else {
                    finalReplacements[symbol] = replacement;
                }
             }
        }
    }

    return finalReplacements;
}

function getSuspiciousWords(config: vscode.WorkspaceConfiguration): string[] {
    const userWords = config.get<string[]>('suspiciousWords') || [];
    const finalWords = new Set(DEFAULT_SUSPICIOUS_WORDS);

    for (const rawWord of userWords) {
        const word = rawWord.trim();
        if (word.startsWith('-')) {
            const wordToRemove = word.substring(1).trim();
            finalWords.delete(wordToRemove);
        } else {
            finalWords.add(word);
        }
    }
    return Array.from(finalWords);
}

function getEmojiExceptions(config: vscode.WorkspaceConfiguration): string[] {
    const userExceptions = config.get<string[]>('emojiExceptions') || [];
    const finalExceptions = new Set(DEFAULT_EMOJI_EXCEPTIONS);

    for (const rawException of userExceptions) {
        const exception = rawException.trim();
        if (exception.startsWith('-')) {
            const exceptionToRemove = exception.substring(1).trim();
            finalExceptions.delete(exceptionToRemove);
        } else {
            finalExceptions.add(exception);
        }
    }
    return Array.from(finalExceptions);
}

function scanDocument(document: vscode.TextDocument, config: vscode.WorkspaceConfiguration): SlopMatch[] {
    const text = document.getText();
    const slopMatches: SlopMatch[] = [];

    // Check Emojis
    if (config.get<boolean>('checkEmojis', true)) {
        const emojiExceptions = getEmojiExceptions(config);
        // Fixed regex to include variation selectors
        const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?/gu;
        let match;
        while ((match = emojiRegex.exec(text))) {
            if (emojiExceptions.includes(match[0])) {
                continue;
            }
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            const message = `Suspicious Emoji: ${match[0]}`;
            // For emojis, we want to remove them (replacement is empty string or handled specifically)
            slopMatches.push({ range, message, text: match[0], type: 'emoji' });
        }
    }

    // Check Suspicious Symbols
    const symbolReplacements = getSymbolReplacements(config);
    const suspiciousSymbols = Object.keys(symbolReplacements);
    
    for (const symbol of suspiciousSymbols) {
        let index = text.indexOf(symbol);
        while (index !== -1) {
            const startPos = document.positionAt(index);
            const endPos = document.positionAt(index + symbol.length);
            const range = new vscode.Range(startPos, endPos);
            const replacement = symbolReplacements[symbol];
            const message = `Suspicious Symbol: ${symbol} (Suggestion: ${replacement})`;
            slopMatches.push({ range, message, text: symbol, type: 'symbol', replacement });
            index = text.indexOf(symbol, index + 1);
        }
    }

    // Check Suspicious Words
    const suspiciousWords = getSuspiciousWords(config);

    for (const word of suspiciousWords) {
        // Use word boundary regex to avoid partial matches
        // Escape special regex characters in the word if any (though words usually don't have them)
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
        let match;
        while ((match = regex.exec(text))) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            const range = new vscode.Range(startPos, endPos);
            const message = `Suspicious Word: ${match[0]}`;
            slopMatches.push({ range, message, text: match[0], type: 'word' });
        }
    }

    return slopMatches;
}

async function scanWorkspace(config: vscode.WorkspaceConfiguration) {
    if (!config.get<boolean>('enableProblemsIntegration', false)) {
        return;
    }

    // Find all files, excluding gitignored and typical unwanted folders (node_modules is usually gitignored)
    // We can use a glob pattern if needed, but default findFiles is good.
    const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');

    for (const uri of files) {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            updateDiagnostics(document, config);
        } catch (error) {
            console.error(`Error processing file ${uri}:`, error);
        }
    }
}

function updateDiagnostics(document: vscode.TextDocument, config: vscode.WorkspaceConfiguration) {
    // optimization: check for binary files
    if (document.getText(new vscode.Range(0, 0, 0, 1024)).includes('\0')) {
        return;
    }

    if (!config.get<boolean>('enableProblemsIntegration', false)) {
        diagnosticCollection.delete(document.uri);
        return;
    }

    const slopMatches = scanDocument(document, config);
    const diagnostics: vscode.Diagnostic[] = slopMatches.map(match => {
        const diagnostic = new vscode.Diagnostic(
            match.range,
            match.message,
            vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'LLM Slop Checker';
        diagnostic.code = match.type;
        return diagnostic;
    });

    diagnosticCollection.set(document.uri, diagnostics);
}

function updateDecorations(editor: vscode.TextEditor) {
    const config = vscode.workspace.getConfiguration('llmSlopChecker');
    if (!config.get<boolean>('enable', true)) {
        editor.setDecorations(symbolDecorationType, []);
        editor.setDecorations(wordDecorationType, []);
        statusBarItem.hide();
        return;
    }

    const slopMatches = scanDocument(editor.document, config);
    
    const symbolDecorations: vscode.DecorationOptions[] = slopMatches
        .filter(m => m.type === 'symbol' || m.type === 'emoji')
        .map(match => ({
            range: match.range,
            hoverMessage: match.message
        }));

    const wordDecorations: vscode.DecorationOptions[] = slopMatches
        .filter(m => m.type === 'word')
        .map(match => ({
            range: match.range,
            hoverMessage: match.message
        }));

    editor.setDecorations(symbolDecorationType, symbolDecorations);
    editor.setDecorations(wordDecorationType, wordDecorations);
    
    updateStatusBar(slopMatches.length);
}

function updateStatusBar(count: number) {
    if (count > 0) {
        statusBarItem.text = `$(alert) ${count} Slop`;
         // Add a "Fix" button if there are issues? Use command for now.
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
        description: match.type.toUpperCase(),
        match: match
    }));

     // Add "Fix All Symbols" option at the top
    const fixOption = {
        label: '$(wrench) Fix All Symbols & Emojis',
        description: 'Automatically fix symbols and remove emojis',
        match: null
    };
    
    const quickPickItems = [fixOption, ...items];

    const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select an issue to jump to, or fix all symbols',
    });

    if (selected) {
        if (selected.match === null) {
            // Fix all
            fixIssues();
        } else {
            editor.selection = new vscode.Selection(selected.match.range.start, selected.match.range.end);
            editor.revealRange(selected.match.range, vscode.TextEditorRevealType.InCenter);
        }
    }
}

async function fixIssues() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const config = vscode.workspace.getConfiguration('llmSlopChecker');
    const slopMatches = scanDocument(editor.document, config);
    
    const fixableMatches = slopMatches.filter(m => m.type === 'symbol' || m.type === 'emoji');

    if (fixableMatches.length === 0) {
        vscode.window.showInformationMessage('No fixable symbols or emojis found.');
        return;
    }

    // Apply edits in reverse order to keep ranges valid
    fixableMatches.sort((a, b) => b.range.start.compareTo(a.range.start));

    await editor.edit(editBuilder => {
        for (const match of fixableMatches) {
            if (match.type === 'emoji') {
                // Remove emoji. Check for surrounding spaces to clean up.
                const start = match.range.start;
                const end = match.range.end;
                
                // Check character before
                let rangeToDelete = match.range;
                
                // Simple heuristic: if space before AND space after, delete one space
                // formatted like: "word 🚀 word" -> "word word" (one space match)
                // actually we want "word word".
                
                if (start.character > 0) {
                    const charBeforeRange = new vscode.Range(start.translate(0, -1), start);
                    const charBefore = editor.document.getText(charBeforeRange);
                    
                    const charAfterRange = new vscode.Range(end, end.translate(0, 1));
                    const charAfter = editor.document.getText(charAfterRange);

                    if (charBefore === ' ' && charAfter === ' ') {
                        // Remove the emoji and the PRECEDING space
                        rangeToDelete = new vscode.Range(start.translate(0, -1), end);
                    } else if (charBefore === ' ' && charAfter !== ' ') {
                        // "word 🚀" -> "word" (remove space before)
                        rangeToDelete = new vscode.Range(start.translate(0, -1), end);
                    } else if (charBefore !== ' ' && charAfter === ' ') {
                         // "🚀 word" -> "word" (remove space after)
                         // Actually better to remove the space AFTER if it exists?
                         // Let's stick to removing the emoji itself, and if double spaces are created, maybe that's okay or we handle it?
                         // The user asked "carefully, with or without space depending on context".
                         
                         // If "Word 🚀 Word", removing emoji gives "Word  Word".
                         // So if space on both sides, include one space in deletion.
                         // My logic above: if space before and after, delete space before + emoji. Result: "Word Word". Correct.
                         
                         rangeToDelete = new vscode.Range(start, end.translate(0, 1));
                    }
                }
                
                editBuilder.delete(rangeToDelete);
            } else if (match.type === 'symbol' && match.replacement !== undefined) {
                editBuilder.replace(match.range, match.replacement);
            }
        }
    });
}

export function deactivate() {}

