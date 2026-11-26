// Loads script.js into an isolated VM context with a minimal fake DOM and
// an in-memory localStorage. No dependencies: only Node built-ins.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SCRIPT_PATH = path.join(__dirname, "..", "script.js");
const SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

const BACKUP_PREFIX = "tasks_backup_";

function createElement(tagName = "div") {
    const listeners = {};
    const attributes = {};
    const classes = new Set();

    const element = {
        tagName: tagName.toUpperCase(),
        children: [],
        dataset: {},
        hidden: false,
        textContent: "",
        value: "",
        listeners,
        attributes,
        classList: {
            add: (...names) => names.forEach((n) => classes.add(n)),
            remove: (...names) => names.forEach((n) => classes.delete(n)),
            toggle: (name, force) => {
                const on = force === undefined ? !classes.has(name) : force;
                if (on) {
                    classes.add(name);
                } else {
                    classes.delete(name);
                }
                return on;
            },
            contains: (name) => classes.has(name)
        },
        addEventListener(type, handler) {
            listeners[type] = handler;
        },
        replaceChildren(...nodes) {
            element.children = nodes;
        },
        appendChild(node) {
            element.children.push(node);
            return node;
        },
        append(...nodes) {
            element.children.push(...nodes);
        },
        setAttribute(name, value) {
            attributes[name] = String(value);
        },
        getAttribute(name) {
            return name in attributes ? attributes[name] : null;
        },
        focus() {},
        querySelector: () => null,
        querySelectorAll: () => [],
        matches: () => false,
        closest: () => null,
        contains: () => false
    };

    return element;
}

// mode:
//   getThrows      - every getItem throws (storage blocked)
//   setThrowsAll   - every setItem throws (quota full)
//   setThrowsPrefix- setItem throws for keys starting with this prefix
//   maxBackups     - setItem of a NEW backup throws once this many exist
//   noCrypto       - (loadApp only) no crypto global
function createStorage(initial = {}, mode = {}) {
    const map = new Map(Object.entries(initial));
    const backupCount = () => [...map.keys()].filter((k) => k.startsWith(BACKUP_PREFIX)).length;

    return {
        map,
        get length() {
            return map.size;
        },
        key(i) {
            return [...map.keys()][i] ?? null;
        },
        getItem(key) {
            if (mode.getThrows) {
                throw new Error("SecurityError");
            }
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            if (mode.setThrowsAll) {
                throw new Error("QuotaExceededError");
            }
            if (mode.setThrowsPrefix !== undefined && key.startsWith(mode.setThrowsPrefix)) {
                throw new Error("QuotaExceededError");
            }
            if (
                mode.maxBackups !== undefined &&
                key.startsWith(BACKUP_PREFIX) &&
                !map.has(key) &&
                backupCount() >= mode.maxBackups
            ) {
                throw new Error("QuotaExceededError");
            }
            map.set(key, String(value));
        },
        removeItem(key) {
            map.delete(key);
        }
    };
}

function loadApp(initialStorage, mode) {
    const storage = createStorage(initialStorage, mode);
    const elements = {};

    // Filter buttons, so updateFilterButtons() has something to update.
    const filterButtons = ["all", "pending", "completed"].map((filter) => {
        const button = createElement("button");
        button.dataset.filter = filter;
        button.closest = (selector) => (selector === "button[data-filter]" ? button : null);
        return button;
    });

    const getElement = (id) => {
        if (!elements[id]) {
            elements[id] = createElement();
            if (id === "task-filters") {
                elements[id].querySelectorAll = () => filterButtons;
            }
        }
        return elements[id];
    };

    const sandbox = {
        console,
        // mode.noCrypto exercises generateId()'s fallback path.
        crypto: mode && mode.noCrypto ? undefined : globalThis.crypto,
        localStorage: storage,
        document: {
            getElementById: getElement,
            createElement: (tag) => createElement(tag)
        }
    };
    sandbox.window = sandbox;

    const context = vm.createContext(sandbox);
    vm.runInContext(SOURCE, context, { filename: SCRIPT_PATH });

    return {
        storage,
        elements: getElement,
        filterButtons,
        // Top-level let/const are not context properties, so evaluate them.
        get: (expression) => vm.runInContext(expression, context),
        stored: () => storage.map.get("tasks"),
        backups: () => [...storage.map.keys()].filter((k) => k.startsWith(BACKUP_PREFIX)),
        submit(value) {
            getElement("task-input").value = value;
            getElement("task-form").listeners.submit({ preventDefault() {} });
        },
        clickFilter(filter) {
            const button = filterButtons.find((b) => b.dataset.filter === filter);
            getElement("task-filters").listeners.click({ target: button });
        }
    };
}

// Values from the VM come from another realm, so normalize before deepEqual.
const plain = (value) => JSON.parse(JSON.stringify(value));

module.exports = { loadApp, plain, BACKUP_PREFIX };
