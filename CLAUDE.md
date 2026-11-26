# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A to-do list app in plain HTML/CSS/JavaScript with no build step, framework or dependencies. The UI text is in Brazilian Portuguese (`lang="pt-BR"`), so keep new user-facing strings in Portuguese.

## Running

- Open `index.html` directly in a browser, or serve the folder statically (e.g. `npx serve .` or `python3 -m http.server`).
- There are no tests or linter. `package.json` is the default `npm init` stub, and `npm test` just exits with an error.
- Quick syntax check: `node --check script.js`

## Architecture

All logic is in `script.js` and runs in one global scope:

- **State:** `tasks` is an array of `{ id, name, completed }`, saved to `localStorage` under the key `"tasks"`. `generateId()` uses `crypto.randomUUID()` and falls back to a timestamp plus random string, regenerating on collisions. Names are limited to `MAX_TASK_LENGTH` (100) code points by `cleanName()`/`truncateName()`. `currentFilter` is one of `"all"`, `"pending"` or `"completed"` (`VALID_FILTERS`), and it is not saved.
- **Storage:** all `localStorage` access goes through `safeGetItem`, `safeSetItem` and `safeRemoveItem` (try/catch, since access can throw). `loadTasks()` never throws: it parses and validates the data, and `normalizeTask()` discards or fixes invalid items. It rebuilds each task with only `id`, `name` and `completed`: extra fields are silently dropped, and a missing `completed` defaults to `false` without counting as a fix (a present non-boolean value does count). When anything invalid is found, the original raw string is copied to `tasks_backup_<timestamp>` by `backupRawData()` (at most `MAX_BACKUPS` = 3 are kept; if the write fails, older backups are pruned and the write is retried once), then the normalized list is saved. The newest backup is never pruned. If that backup fails, or if reading `localStorage` fails, `saveBlocked` becomes true and nothing is written to `"tasks"` for the session. `loadNotice` (persistent) and `saveNotice` (cleared by the next successful write) are shown in `#storage-message` by `renderNotice()`. `saveTasks()` returns a boolean.
- **Render loop:** each change updates `tasks`, calls `saveTasks()`, then calls `renderTasks(focusRequest)`. `renderTasks()` clears `#task-list` with `replaceChildren()`, rebuilds the filtered `<li>` items (never use `innerHTML` with user data), then updates `#task-counter`, the filter buttons and `#task-empty`. `focusRequest` is `{ type: "toggle" | "delete", id, index }` and restores keyboard focus after the rebuild; the initial render never moves focus. Look up tasks by `id`, not by array index, because the rendered list is filtered.
- **Events:** listeners are registered once, using delegation. `#task-list` handles `change` on `.task-checkbox` and `click` on `.delete-button`, with no per-item listeners. `#task-filters` handles clicks on `button[data-filter]`. `aria-pressed` and the `active` class on the filter buttons are derived from `currentFilter` in `updateFilterButtons()`.
- **Styling:** `style.css` defines design tokens as CSS custom properties in `:root`. The JS and CSS share these class names, so keep them in sync: `li.completed` (strike-through), `.task-checkbox`, `.task-label`, `.delete-button` and `#task-filters button.active` (also styled via `[aria-pressed="true"]`). `#task-empty` (`.empty-state`) and `#storage-message` (`.notice`) use the `hidden` attribute.
