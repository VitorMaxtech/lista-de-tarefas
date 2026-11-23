const form = document.getElementById("task-form");
const input = document.getElementById("task-input");
const list = document.getElementById("task-list");

let tasks = JSON.parse(localStorage.getItem("tasks")) || [];

function saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(tasks));
}

function renderTasks() {
    list.innerHTML = "";

    tasks.forEach((task, index) => {
        const item = document.createElement("li");

        if (task.completed) {
            item.classList.add("completed");
        }

        const text = document.createElement("span");
        text.textContent = task.name;
        text.style.cursor = "pointer";

        text.addEventListener("click", () => {
            tasks[index].completed = !tasks[index].completed;
            saveTasks();
            renderTasks();
        });

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Excluir";
        deleteButton.classList.add("delete-button");

        deleteButton.addEventListener("click", () => {
            tasks.splice(index, 1);
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
        name: name,
        completed: false
    });

    saveTasks();

    input.value = "";
    renderTasks();
});

renderTasks();