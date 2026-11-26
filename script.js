const form = document.getElementById("task-form");
const input = document.getElementById("task-input");
const list = document.getElementById("task-list");
const counter = document.getElementById("task-counter");
const filters = document.getElementById("task-filters");

let currentFilter = "all";  

let tasks = JSON.parse(localStorage.getItem("tasks")) || [];

function saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(tasks));
}
function updateCounter() {
    const concluidas = tasks.filter(task => task.completed === true);
    const pendentes = tasks.filter(task => task.completed === false);

    counter.textContent = `Total: ${tasks.length} | Pendentes: ${pendentes.length} | Concluídas: ${concluidas.length}`;
}
filters.addEventListener("click", (event) => {
    if (event.target.tagName === "BUTTON") {
        currentFilter = event.target.dataset.filter;

        filters.querySelectorAll("button").forEach(button => {
            button.classList.remove("active");
        });

        event.target.classList.add("active");

        renderTasks();
    }
});

function renderTasks() {
    list.innerHTML = "";
    updateCounter();

    const filteredTasks = tasks.filter(task => {
    if (currentFilter === "pending") {
        return !task.completed;
    }

    if (currentFilter === "completed") {
        return task.completed;
    }

    return true;
});

filteredTasks.forEach((task) => {
        const item = document.createElement("li");

        if (task.completed) {
            item.classList.add("completed");
        }

        const text = document.createElement("span");
        text.textContent = task.name;
        text.style.cursor = "pointer";

        text.addEventListener("click", () => {
    const selectedTask = tasks.find(item => item.id === task.id);

    selectedTask.completed = !selectedTask.completed;

    saveTasks();
    renderTasks();
});

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Excluir";
        deleteButton.classList.add("delete-button");

        deleteButton.addEventListener("click", () => {
    tasks = tasks.filter(item => item.id !== task.id);

    saveTasks();
    renderTasks();
});

        item.appendChild(text);
        item.appendChild(deleteButton);

        list.appendChild(item);
    });
}

form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = input.value.trim();

    if (!name) return;

    tasks.push({
        id: crypto.randomUUID(),
        name: name,
        completed: false
    });

    saveTasks();

    input.value = "";
    renderTasks();
});

renderTasks();