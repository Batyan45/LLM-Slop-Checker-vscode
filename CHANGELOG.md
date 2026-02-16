# Changelog

All notable changes to the "llm-slop-checker" extension will be documented in this file.

## [0.0.2] - 2026-02-16

### Added
- Added `LLM Slop: Fix Symbols` command to automatically replace suspicious symbols and remove emojis.
- Added integration with the Problems view (Diagnostics) to see issues across the whole workspace.
- Added support for removing default words and emojis using the `-` prefix in settings.
- Added support for custom symbol replacements using the `symbol:replacement` format.
- Added `llmSlopChecker.enableProblemsIntegration` setting.

### Improved
- Improved emoji detection regex to handle variation selectors.
- Optimized performance by adding a check for binary files to avoid unnecessary processing.
- Theme-aware highlighting (uses theme colors for decorations).


## [0.0.1] - 2026-02-16

### Added

- Initial release of LLM Slop Checker.
- Added highlighting for suspicious symbols (smart quotes, dashes, etc.).
- Added highlighting for suspicious words (common LLM phrases).
- Added optional emoji highlighting.
- Added status bar item to show count of slop items found.
- Added command `llmSlopChecker.showIssues` to list and jump to slop items.
