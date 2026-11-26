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

- **State:** `tasks` is an array of `{ id, name, completed }`, where `id` comes from `crypto.randomUUID()`. It is loaded from and saved to `localStorage` under the key `"tasks"`. `currentFilter` is one of `"all"`, `"pending"` or `"completed"`, and it is not saved.
- **Render loop:** each change updates `tasks`, calls `saveTasks()`, then calls `renderTasks()`. `renderTasks()` clears `#task-list`, updates `#task-counter`, applies the filter and rebuilds every `<li>`, attaching new listeners each time. Look up tasks by `id`, not by array index, because the rendered list is filtered.
- **Filters:** one delegated click listener on `#task-filters` reads each button's `data-filter` and moves the `active` class to the clicked button.
- **Styling:** `style.css` uses the classes `li.completed` (strike-through), `.delete-button` and `#task-filters button.active`. Keep the class names the same in JS and CSS.
