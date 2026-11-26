"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, plain } = require("./harness");

const TWO_TASKS = [
    { id: "a", name: "A", completed: false },
    { id: "b", name: "B", completed: true }
];

const oldBackups = (count, start = 1000) => {
    const entries = {};
    for (let i = 1; i <= count; i++) {
        entries["tasks_backup_" + (start + i)] = "old" + i;
    }
    return entries;
};

test.describe("loadTasks", () => {
    test("storage vazio resulta em lista vazia, sem backup", () => {
        const app = loadApp({});
        assert.deepEqual(plain(app.get("tasks")), []);
        assert.equal(app.backups().length, 0);
    });

    test("dados válidos são carregados intactos, sem backup", () => {
        const app = loadApp({ tasks: JSON.stringify(TWO_TASKS) });
        assert.deepEqual(plain(app.get("tasks")), TWO_TASKS);
        assert.equal(app.backups().length, 0);
    });

    test("JSON inválido gera backup do texto original e aviso", () => {
        const app = loadApp({ tasks: "{oops" });
        const [backup] = app.backups();

        assert.deepEqual(plain(app.get("tasks")), []);
        assert.equal(app.storage.map.get(backup), "{oops");
        assert.notEqual(app.get("loadNotice"), "");
    });

    for (const raw of ['{"a":1}', "42", "null", '"str"']) {
        test(`valor que não é lista (${raw}) é tratado sem exceção`, () => {
            const app = loadApp({ tasks: raw });
            const backups = app.backups();

            assert.deepEqual(plain(app.get("tasks")), []);
            assert.equal(backups.length, 1);
            assert.equal(app.storage.map.get(backups[0]), raw);
            assert.equal(app.stored(), "[]");
        });
    }
});

test.describe("normalizeTask", () => {
    const emoji = "😀".repeat(150);
    const items = [
        { id: "x", name: "ok", completed: true },
        { name: "sem id", completed: false },
        { id: "x", name: "dup" },
        { id: "n", name: 123 },
        { id: "e", name: "   " },
        { id: "long", name: emoji },
        { id: "c", name: "comp str", completed: "yes" },
        null,
        [1],
        "str",
        { id: "  ", name: "id branco" },
        { id: "sp", name: "  a   b  " }
    ];

    const app = loadApp({ tasks: JSON.stringify(items) });
    const tasks = plain(app.get("tasks"));
    const byName = (name) => tasks.find((t) => t.name === name);

    test("descarta itens inválidos e mantém os válidos", () => {
        assert.equal(tasks.length, 7);
        assert.ok(!tasks.some((t) => t.name === "123" || t.name === ""));
    });

    test("gera ids únicos para ids ausentes, duplicados ou em branco", () => {
        const ids = tasks.map((t) => t.id);
        assert.equal(new Set(ids).size, ids.length);
        assert.ok(ids.every((id) => typeof id === "string" && id.trim() !== ""));
        assert.equal(ids.filter((id) => id === "x").length, 1);
    });

    test("trunca em 100 code points sem cortar emoji", () => {
        const long = tasks.find((t) => t.id === "long");
        assert.equal(Array.from(long.name).length, 100);
        assert.equal(long.name, Array.from(emoji).slice(0, 100).join(""));
    });

    test("completed não booleano vira false", () => {
        assert.equal(byName("comp str").completed, false);
    });

    test("espaços internos são colapsados", () => {
        assert.ok(byName("a b"));
    });

    test("faz backup do original e salva a lista normalizada", () => {
        const [backup] = app.backups();
        assert.equal(app.storage.map.get(backup), JSON.stringify(items));
        assert.equal(app.stored(), JSON.stringify(tasks));
    });

    test("campos extras são descartados", () => {
        const extra = loadApp({ tasks: JSON.stringify([{ id: "a", name: "A", completed: false, x: 1 }]) });
        assert.deepEqual(plain(extra.get("tasks")), [{ id: "a", name: "A", completed: false }]);
    });
});

test.describe("backups", () => {
    test("mantém no máximo 3 e preserva o mais novo", () => {
        const app = loadApp({ ...oldBackups(5), tasks: "{bad" });
        const backups = app.backups();

        assert.equal(backups.length, 3);
        assert.ok(backups.includes("tasks_backup_1004"));
        assert.ok(backups.includes("tasks_backup_1005"));
        assert.ok(backups.some((k) => app.storage.map.get(k) === "{bad"));
    });

    test("preserva o backup novo mesmo com relógio atrasado", () => {
        const app = loadApp({ ...oldBackups(5, Date.now() + 1e9), tasks: "{bad" });
        const backups = app.backups();

        assert.equal(backups.length, 3);
        assert.ok(backups.some((k) => app.storage.map.get(k) === "{bad"));
    });

    test("com cota cheia, poda backups antigos e tenta de novo", () => {
        const app = loadApp({ ...oldBackups(5), tasks: "{bad" }, { maxBackups: 3 });
        const backups = app.backups();

        assert.equal(app.get("saveBlocked"), false);
        assert.equal(backups.length, 3);
        assert.ok(backups.some((k) => app.storage.map.get(k) === "{bad"));
        assert.equal(app.stored(), "[]");
    });
});

test.describe("falhas de armazenamento", () => {
    test("leitura bloqueada impede qualquer gravação na sessão", () => {
        const app = loadApp({ tasks: JSON.stringify(TWO_TASKS) }, { getThrows: true });

        assert.equal(app.get("saveBlocked"), true);
        assert.notEqual(app.get("loadNotice"), "");

        app.get("addTask('x'); saveTasks()");
        assert.equal(app.stored(), JSON.stringify(TWO_TASKS));
    });

    test("falha no backup não sobrescreve os dados originais", () => {
        const app = loadApp({ tasks: "{bad" }, { setThrowsPrefix: "tasks_backup_" });

        assert.equal(app.get("saveBlocked"), true);
        assert.equal(app.backups().length, 0);

        app.get("addTask('y'); saveTasks()");
        assert.equal(app.stored(), "{bad");
    });

    test("falha no backup com itens parcialmente inválidos também bloqueia", () => {
        const raw = JSON.stringify([{ id: "a", name: "ok" }, { name: 5 }]);
        const app = loadApp({ tasks: raw }, { setThrowsPrefix: "tasks_backup_" });

        assert.equal(app.get("saveBlocked"), true);
        assert.equal(app.stored(), raw);
    });

    test("cota cheia ao salvar: retorna false, avisa e mantém em memória", () => {
        const app = loadApp({}, { setThrowsAll: true });
        app.get("addTask('q')");

        assert.equal(app.get("saveTasks()"), false);
        assert.notEqual(app.get("saveNotice"), "");
        assert.equal(app.get("tasks.length"), 1);
    });
});
