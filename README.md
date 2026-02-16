# LLM Slop Checker

![Icon](images/icon.png)

**Slop:** *noun.* Unwanted, low-quality, or generated content that clutters your codebase.

**LLM Slop Checker** is a VS Code extension designed to help you spot and highlight text artifacts that are commonly associated with AI-generated code (LLM slop). It scans your files for suspicious symbols, "AI-favored" vocabulary, and emojis that might indicate copy-pasted or machine-generated content without proper review.

## Features

- **Highlight Suspicious Symbols**: Automatically highlights characters like smart quotes (`“`, `”`), long dashes (`—`, `–`), and ellipses (`…`) that are often introduced by LLMs but are rarely desired in source code.
- **Spot "AI Words"**: Flags words that are disproportionately used by AI models (e.g., "delve", "tapestry", "leverage", "spearhead").
- **Emoji Detection**: Optionally highlights emojis, with improved detection for variation selectors.
- **Problem View Integration**: New in 0.0.2! View all slop items across your entire workspace in the VS Code Problems panel.
- **Quick Fixes**: Automatically fix all suspicious symbols and remove emojis with one command.
- **Status Bar Indicator**: Shows a count of suspicious items found in the current file.
- **Quick Navigation**: Click the status bar item or run the command `LLM Slop: Show Issues` to see a list of all findings and jump directly to them.

## Extension Settings

This extension contributes the following settings:

* `llmSlopChecker.enable`: Enable or disable the extension (default: `true`).
* `llmSlopChecker.checkEmojis`: Specific setting to enable highlighting of emojis (default: `true`).
* `llmSlopChecker.symbolReplacements`: List of suspicious symbols and their replacements. Format: `"symbol:replacement"`. Extends defaults. Use empty replacement (e.g. `"—:"`) to disable a default symbol.
* `llmSlopChecker.suspiciousWords`: List of suspicious words to highlight. Extends defaults. Prefix with `"-"` to remove a word from defaults. Examples: `"delve"`, `"ensure"`, `"-tapestry"`.
* `llmSlopChecker.emojiExceptions`: List of emojis to ignore/allow. Extends defaults. Prefix with `"-"` to remove an emoji from defaults. Examples: `"🚀"`, `"✨"`, `"-⚠️"`.
* `llmSlopChecker.enableProblemsIntegration`: Enable integration with the Problems view (Diagnostics) to show issues across the workspace.

## Commands

* **LLM Slop: Show Issues** (`llmSlopChecker.showIssues`): Opens a Quick Pick interface listing all suspicious items in the current file.
* **LLM Slop: Fix Symbols** (`llmSlopChecker.fixIssues`): Automatically replaces suspicious symbols and removes emojis in the current file.

## Important

- The extension uses simple text searching and regex, so it may flag legitimate uses of these words or symbols (false positives). You can customize the lists in your settings to reduce noise.

---

**Enjoy a cleaner codebase!**
