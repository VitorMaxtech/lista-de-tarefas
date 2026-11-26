"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./harness");

const visibleIds = (app) => app.elements("task-list").children.map((li) => li.dataset.id);

test.describe("operações de tarefa", () => {
    test("addTask limpa espaços e adiciona como pendente", () => {
        const app = loadApp({});

        assert.equal(app.get("addTask('  Comprar   pão ')"), true);
        const [task] = plain(app.get("tasks"));
        assert.equal(task.name, "Comprar pão");
        assert.equal(task.completed, false);
    });

    test("addTask rejeita nome vazio ou só espaços", () => {
        const app = loadApp({});

        assert.equal(app.get("addTask('')"), false);
        assert.equal(app.get("addTask('   \\t ')"), false);
        assert.equal(app.get("tasks.length"), 0);
    });

    test("toggleTask e deleteTask atualizam a lista e o storage", () => {
        const app = loadApp({});
        app.get("addTask('a'); saveTasks()");
        const id = JSON.stringify(app.get("tasks[0].id"));

        app.get(`toggleTask(${id}); saveTasks()`);
        assert.equal(JSON.parse(app.stored())[0].completed, true);

        app.get(`deleteTask(${id}); saveTasks()`);
        assert.equal(app.stored(), "[]");
    });

    test("ids inexistentes retornam false", () => {
        const app = loadApp({});
        assert.equal(app.get("toggleTask('zzz')"), false);
        assert.equal(app.get("deleteTask('zzz')"), false);
    });

    test("gera ids únicos também sem crypto.randomUUID", () => {
        const app = loadApp({}, { noCrypto: true });
        for (let i = 0; i < 50; i++) {
            app.get(`addTask('t${i}')`);
        }
        const ids = plain(app.get("tasks")).map((t) => t.id);
        assert.equal(new Set(ids).size, 50);
    });
});

test.describe("formulário", () => {
    test("enviar adiciona, salva e limpa o campo", () => {
        const app = loadApp({});
        app.submit("  via form ");

        assert.equal(app.get("tasks.length"), 1);
        assert.match(app.stored(), /via form/);
        assert.equal(app.elements("task-input").value, "");
    });

    test("com filtro Concluídas, adicionar volta para Todas", () => {
        const app = loadApp({});
        app.clickFilter("completed");
        app.submit("nova");

        assert.equal(app.get("currentFilter"), "all");
        assert.equal(visibleIds(app).length, 1);
    });

    test("com filtro Pendentes, adicionar mantém o filtro", () => {
        const app = loadApp({});
        app.clickFilter("pending");
        app.submit("nova");

        assert.equal(app.get("currentFilter"), "pending");
        assert.equal(visibleIds(app).length, 1);
    });
});

test.describe("renderização", () => {
    const TASKS = [
        { id: "p1", name: "Pendente 1", completed: false },
        { id: "c1", name: "Concluída 1", completed: true },
        { id: "p2", name: "Pendente 2", completed: false }
    ];

    test("filtros mostram as tarefas certas e marcam o botão ativo", () => {
        const app = loadApp({ tasks: JSON.stringify(TASKS) });
        const pressed = () => app.filterButtons.map((b) => b.getAttribute("aria-pressed"));

        assert.deepEqual(visibleIds(app), ["p1", "c1", "p2"]);
        assert.deepEqual(pressed(), ["true", "false", "false"]);

        app.clickFilter("pending");
        assert.deepEqual(visibleIds(app), ["p1", "p2"]);
        assert.deepEqual(pressed(), ["false", "true", "false"]);

        app.clickFilter("completed");
        assert.deepEqual(visibleIds(app), ["c1"]);
        assert.ok(app.filterButtons[2].classList.contains("active"));
    });

    test("tarefa concluída recebe a classe completed", () => {
        const app = loadApp({ tasks: JSON.stringify(TASKS) });
        const [, done] = app.elements("task-list").children;
        assert.ok(done.classList.contains("completed"));
    });

    test("nome do usuário vai para textContent, nunca como HTML", () => {
        const name = "<img src=x onerror=alert(1)>";
        const app = loadApp({ tasks: JSON.stringify([{ id: "x", name, completed: false }]) });
        const [item] = app.elements("task-list").children;
        const label = item.children.find((c) => c.className === "task-label");

        assert.equal(label.textContent, name);
        assert.equal(label.innerHTML, undefined);
    });

    test("contador usa singular e plural corretamente", () => {
        assert.equal(loadApp({}).elements("task-counter").textContent, "Nenhuma tarefa.");

        const app = loadApp({ tasks: JSON.stringify(TASKS) });
        assert.equal(
            app.elements("task-counter").textContent,
            "3 tarefas no total, 2 pendentes, 1 concluída."
        );
    });

    test("estado vazio aparece com a mensagem do filtro", () => {
        const app = loadApp({ tasks: JSON.stringify([TASKS[0]]) });
        const empty = app.elements("task-empty");

        assert.equal(empty.hidden, true);

        app.clickFilter("completed");
        assert.equal(empty.hidden, false);
        assert.equal(empty.textContent, "Nenhuma tarefa concluída ainda.");
    });
});
