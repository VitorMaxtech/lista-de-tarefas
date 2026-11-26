const STORAGE_KEY = "tasks";
const BACKUP_PREFIX = "tasks_backup_";
const MAX_BACKUPS = 3;
const MAX_TASK_LENGTH = 100;
const VALID_FILTERS = ["all", "pending", "completed"];

const form = document.getElementById("task-form");
const input = document.getElementById("task-input");
const list = document.getElementById("task-list");
const counter = document.getElementById("task-counter");
const filters = document.getElementById("task-filters");
const notice = document.getElementById("storage-message");
const emptyState = document.getElementById("task-empty");

let tasks = [];
let currentFilter = "all";
// true when backing up invalid data failed: nothing is written to "tasks".
let saveBlocked = false;
// Persistent notice produced while loading.
let loadNotice = "";
// Notice about a failed write; cleared when a later write succeeds.
let saveNotice = "";

/* ---------- Safe storage access ---------- */

function safeGetItem(key) {
    try {
        return { ok: true, value: window.localStorage.getItem(key) };
    } catch (error) {
        return { ok: false, value: null };
    }
}

function safeSetItem(key, value) {
    try {
        window.localStorage.setItem(key, value);
        return true;
    } catch (error) {
        return false;
    }
}

function safeRemoveItem(key) {
    try {
        window.localStorage.removeItem(key);
    } catch (error) {
        // Ignored: removal is best effort.
    }
}

/* ---------- Helpers ---------- */

function plural(count, singular, pluralForm) {
    return count === 1 ? singular : pluralForm;
}

function generateId(usedIds) {
    let id;

    do {
        id = "";

        try {
            if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
                id = crypto.randomUUID();
            }
        } catch (error) {
            id = "";
        }

        if (!id) {
            id = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        }
    } while (
        tasks.some(task => task.id === id) ||
        (usedIds && usedIds.has(id))
    );

    return id;
}

// The HTML maxlength attribute counts UTF-16 code units, so an emoji can
// count as 2. Array.from splits by code point and never cuts an emoji in half.
function truncateName(str) {
    return Array.from(str).slice(0, MAX_TASK_LENGTH).join("");
}

function cleanName(str) {
    return truncateName(str.trim().replace(/\s+/g, " "));
}

function normalizeTask(raw, usedIds) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return null;
    }

    if (typeof raw.name !== "string") {
        return null;
    }

    const name = cleanName(raw.name);

    if (!name) {
        return null;
    }

    let fixed = name !== raw.name;

    let completed = false;

    if (raw.completed === true) {
        completed = true;
    } else if (raw.completed !== undefined && typeof raw.completed !== "boolean") {
        fixed = true;
    }

    let id;

    if (
        typeof raw.id === "string" &&
        raw.id.trim() !== "" &&
        raw.id.length <= 100 &&
        !usedIds.has(raw.id)
    ) {
        id = raw.id;
    } else {
        id = generateId(usedIds);
        fixed = true;
    }

    usedIds.add(id);

    return { task: { id, name, completed }, fixed };
}

/* ---------- Backup and persistence ---------- */

// keepKey is never removed, even if the system clock went backwards and it
// sorts as one of the oldest backups.
function pruneBackups(keepKey) {
    const keys = [];

    try {
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);

            if (key !== null && key !== keepKey && key.startsWith(BACKUP_PREFIX)) {
                keys.push(key);
            }
        }
    } catch (error) {
        return;
    }

    const parse = (key) => {
        const parts = key.slice(BACKUP_PREFIX.length).split("_");
        return [Number(parts[0]) || 0, Number(parts[1]) || 0];
    };

    keys.sort((a, b) => {
        const [timeA, suffixA] = parse(a);
        const [timeB, suffixB] = parse(b);
        return timeA - timeB || suffixA - suffixB;
    });

    // The kept key counts toward MAX_BACKUPS.
    keys.slice(0, Math.max(0, keys.length - (MAX_BACKUPS - 1))).forEach(safeRemoveItem);
}

function backupRawData(raw) {
    const base = BACKUP_PREFIX + Date.now();
    let key = base;
    let suffix = 1;

    while (true) {
        const existing = safeGetItem(key);

        if (!existing.ok) {
            return null;
        }

        if (existing.value === null) {
            break;
        }

        key = base + "_" + suffix;
        suffix++;
    }

    // Pruning first frees space if the quota is full; retry once.
    if (!safeSetItem(key, raw)) {
        pruneBackups(key);

        if (!safeSetItem(key, raw)) {
            return null;
        }
    }

    pruneBackups(key);

    return key;
}

function loadTasks() {
    const result = safeGetItem(STORAGE_KEY);

    if (!result.ok) {
        // Data may exist but be unreadable: never overwrite it this session.
        saveBlocked = true;
        loadNotice = "Não foi possível acessar o armazenamento do navegador. Suas tarefas funcionam, mas não serão salvas ao fechar a página.";
        return [];
    }

    const raw = result.value;

    if (raw === null) {
        return [];
    }

    let parsed;
    let corrupted = false;

    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        corrupted = true;
    }

    if (!corrupted && !Array.isArray(parsed)) {
        corrupted = true;
    }

    const loaded = [];
    let discarded = 0;
    let fixed = 0;

    if (!corrupted) {
        const usedIds = new Set();

        parsed.forEach((item) => {
            const normalized = normalizeTask(item, usedIds);

            if (normalized === null) {
                discarded++;
                return;
            }

            if (normalized.fixed) {
                fixed++;
            }

            loaded.push(normalized.task);
        });
    }

    if (!corrupted && discarded === 0 && fixed === 0) {
        return loaded;
    }

    const backupKey = backupRawData(raw);

    if (backupKey === null) {
        saveBlocked = true;
        loadNotice = "Atenção: dados salvos inválidos foram encontrados, mas não foi possível guardar uma cópia. Para proteger os dados originais, as alterações desta sessão não serão salvas.";
        return loaded;
    }

    if (corrupted) {
        loadNotice = "Atenção: os dados salvos estavam corrompidos e não puderam ser lidos. Uma cópia foi guardada no navegador com a chave «" + backupKey + "».";
    } else {
        loadNotice = "Atenção: alguns dados salvos eram inválidos (" +
            discarded + " " + plural(discarded, "descartado", "descartados") + ", " +
            fixed + " " + plural(fixed, "corrigido", "corrigidos") +
            "). Uma cópia dos dados originais foi guardada com a chave «" + backupKey + "».";
    }

    tasks = loaded;
    saveTasks();

    return loaded;
}

function saveTasks() {
    if (saveBlocked) {
        return false;
    }

    const saved = safeSetItem(STORAGE_KEY, JSON.stringify(tasks));

    saveNotice = saved
        ? ""
        : "Não foi possível salvar as alterações (armazenamento cheio ou indisponível). Elas ficarão apenas nesta sessão.";

    renderNotice();

    return saved;
}

/* ---------- Rendering ---------- */

function renderNotice() {
    const text = [loadNotice, saveNotice].filter(Boolean).join(" ");

    if (!text) {
        notice.hidden = true;
        notice.textContent = "";
        return;
    }

    if (notice.textContent !== text) {
        notice.textContent = text;
    }

    notice.hidden = false;
}

function getFilteredTasks() {
    if (currentFilter === "pending") {
        return tasks.filter(task => !task.completed);
    }

    if (currentFilter === "completed") {
        return tasks.filter(task => task.completed);
    }

    return tasks;
}

function countTasks() {
    let completed = 0;

    tasks.forEach((task) => {
        if (task.completed === true) {
            completed++;
        }
    });

    return {
        total: tasks.length,
        completed,
        pending: tasks.length - completed
    };
}

function updateCounter() {
    const { total, completed, pending } = countTasks();
    let text;

    if (total === 0) {
        text = "Nenhuma tarefa.";
    } else {
        text = total + " " + plural(total, "tarefa", "tarefas") + " no total, " +
            pending + " " + plural(pending, "pendente", "pendentes") + ", " +
            completed + " " + plural(completed, "concluída", "concluídas") + ".";
    }

    if (counter.textContent !== text) {
        counter.textContent = text;
    }
}

function updateFilterButtons() {
    filters.querySelectorAll("button[data-filter]").forEach((button) => {
        const isActive = button.dataset.filter === currentFilter;

        button.setAttribute("aria-pressed", String(isActive));
        button.classList.toggle("active", isActive);
    });
}

function createTaskElement(task, index) {
    const item = document.createElement("li");
    item.dataset.id = task.id;

    if (task.completed) {
        item.classList.add("completed");
    }

    const checkboxId = "task-cb-" + index;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.id = checkboxId;
    checkbox.checked = task.completed;

    const label = document.createElement("label");
    label.className = "task-label";
    label.setAttribute("for", checkboxId);
    label.textContent = task.name;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "Excluir";
    deleteButton.setAttribute("aria-label", "Excluir tarefa: " + task.name);

    item.append(checkbox, label, deleteButton);

    return item;
}

function updateEmptyState(visibleCount) {
    if (visibleCount > 0) {
        emptyState.hidden = true;
        return;
    }

    if (tasks.length === 0) {
        emptyState.textContent = "Nenhuma tarefa por aqui. Adicione a primeira acima.";
    } else if (currentFilter === "pending") {
        emptyState.textContent = "Nenhuma tarefa pendente.";
    } else {
        emptyState.textContent = "Nenhuma tarefa concluída ainda.";
    }

    emptyState.hidden = false;
}

function focusActiveFilterButton() {
    const button = filters.querySelector('button[data-filter="' + currentFilter + '"]');

    if (button) {
        button.focus();
    }
}

function focusItemAt(index) {
    const items = list.children;
    const target = items[Math.min(index, items.length - 1)];
    const checkbox = target && target.querySelector(".task-checkbox");

    if (checkbox) {
        checkbox.focus();
    }
}

function applyFocus(request) {
    const items = list.children;

    if (request.type === "toggle") {
        for (const item of items) {
            if (item.dataset.id === request.id) {
                item.querySelector(".task-checkbox").focus();
                return;
            }
        }

        if (items.length > 0) {
            focusItemAt(request.index);
        } else {
            focusActiveFilterButton();
        }

        return;
    }

    if (request.type === "delete") {
        if (items.length > 0) {
            focusItemAt(request.index);
        } else if (currentFilter === "all") {
            input.focus();
        } else {
            focusActiveFilterButton();
        }
    }
}

function renderTasks(focusRequest) {
    list.replaceChildren();

    const visibleTasks = getFilteredTasks();

    visibleTasks.forEach((task, index) => {
        list.appendChild(createTaskElement(task, index));
    });

    updateCounter();
    updateFilterButtons();
    updateEmptyState(visibleTasks.length);

    if (focusRequest) {
        applyFocus(focusRequest);
    }
}

/* ---------- Actions ---------- */

function toggleTask(id) {
    const task = tasks.find(item => item.id === id);

    if (!task) {
        return false;
    }

    task.completed = !task.completed;

    return true;
}

function deleteTask(id) {
    const index = tasks.findIndex(item => item.id === id);

    if (index === -1) {
        return false;
    }

    tasks.splice(index, 1);

    return true;
}

function addTask(rawName) {
    const name = cleanName(rawName);

    if (!name) {
        return false;
    }

    tasks.push({ id: generateId(), name, completed: false });

    return true;
}

/* ---------- Event handlers ---------- */

function handleTaskAction(item, action, type) {
    const id = item.dataset.id;
    const index = Array.prototype.indexOf.call(list.children, item);

    if (action(id)) {
        saveTasks();
        renderTasks({ type, id, index });
    } else {
        renderTasks();
    }
}

list.addEventListener("change", (event) => {
    if (!event.target.matches(".task-checkbox")) {
        return;
    }

    const item = event.target.closest("li");

    if (item) {
        handleTaskAction(item, toggleTask, "toggle");
    }
});

list.addEventListener("click", (event) => {
    const button = event.target.closest(".delete-button");

    if (!button || !list.contains(button)) {
        return;
    }

    const item = button.closest("li");

    if (item) {
        handleTaskAction(item, deleteTask, "delete");
    }
});

filters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");

    if (!button || !VALID_FILTERS.includes(button.dataset.filter)) {
        return;
    }

    currentFilter = button.dataset.filter;
    renderTasks();
});

form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (addTask(input.value)) {
        saveTasks();
        input.value = "";

        // A new task is pending, so it would be hidden by this filter.
        if (currentFilter === "completed") {
            currentFilter = "all";
        }

        renderTasks();
    } else {
        input.value = "";
    }

    input.focus();
});

/* ---------- Initialization ---------- */

tasks = loadTasks();
renderNotice();
renderTasks();
