const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModules } = require("./helpers/load-browser-modules");

const app = loadModules([
  "vdom.js",
  "diff.js",
  "history.js",
  "patch.js",
  "interaction.js"
]);

const vdom = app.vdom;
const diff = app.diff;
const history = app.history;
const patch = app.patch;
const interaction = app.interaction;

function text(uid, value) {
  return {
    uid,
    type: "#text",
    props: { nodeValue: value },
    children: []
  };
}

function node(uid, type, props, children) {
  return {
    uid,
    type,
    props: Object.assign({}, props),
    children: children || []
  };
}

test("ensureStableKeys adds data-key to element nodes but keeps the root untouched", function () {
  const tree = node("root", "div", { id: "playground-root" }, [
    node("section-1", "section", {}, [
      text("text-1", "hello")
    ])
  ]);

  vdom.ensureStableKeys(tree);

  assert.equal(tree.props["data-key"], undefined);
  assert.equal(tree.children[0].props["data-key"], "key-section-1");
  assert.equal(tree.children[0].children[0].props["data-key"], undefined);
});

test("diff reports text updates and sibling moves", function () {
  const oldTree = node("root", "div", {}, [
    node("a", "p", {}, [text("a-text", "one")]),
    node("b", "p", {}, [text("b-text", "two")])
  ]);
  const newTree = node("root", "div", {}, [
    node("b", "p", {}, [text("b-text", "two changed")]),
    node("a", "p", {}, [text("a-text", "one")])
  ]);

  const result = diff.diff(oldTree, newTree);
  const ops = result.patches.map(function (entry) {
    return entry.op;
  });

  assert.ok(ops.includes("TEXT"));
  assert.ok(ops.includes("MOVE"));
  assert.equal(result.summary.patchCount, 2);
});

test("diff marks the full subtree as changed when a tag changes", function () {
  const oldTree = node("root", "div", {}, [
    node("branch", "section", {}, [
      node("leaf", "p", {}, [text("leaf-text", "hello")])
    ])
  ]);
  const newTree = node("root", "div", {}, [
    node("branch", "article", {}, [
      node("leaf", "p", {}, [text("leaf-text", "hello")])
    ])
  ]);

  const result = diff.diff(oldTree, newTree);

  assert.equal(result.patches.length, 1);
  assert.equal(result.patches[0].op, "REPLACE");
  assert.equal(result.oldStatusByUid.branch, "changed");
  assert.equal(result.oldStatusByUid.leaf, "changed");
  assert.equal(result.oldStatusByUid["leaf-text"], "changed");
  assert.equal(result.newStatusByUid.branch, "changed");
  assert.equal(result.newStatusByUid.leaf, "changed");
  assert.equal(result.newStatusByUid["leaf-text"], "changed");
  assert.equal(result.summary.touchedNodes, 3);
});

test("history supports undo and redo with cloned snapshots", function () {
  const initialTree = node("root", "div", {}, [node("a", "p", {}, [])]);
  const nextTree = node("root", "div", {}, [node("b", "section", {}, [])]);
  const timeline = history.createHistory(initialTree);

  history.push(timeline, nextTree);
  const undoTransition = history.undo(timeline);

  assert.equal(undoTransition.from.children[0].uid, "b");
  assert.equal(undoTransition.to.children[0].uid, "a");
  assert.equal(history.canRedo(timeline), true);

  undoTransition.to.children[0].uid = "mutated";
  const redoTransition = history.redo(timeline);
  assert.equal(redoTransition.to.children[0].uid, "b");
});

test("interaction.reorderNode reorders siblings around a target node", function () {
  const tree = node("root", "div", {}, [
    node("a", "p", {}, []),
    node("b", "p", {}, []),
    node("c", "p", {}, [])
  ]);

  const result = interaction.reorderNode(tree, "a", "c", "after");

  assert.ok(result);
  assert.deepEqual(
    result.tree.children.map(function (child) {
      return child.uid;
    }),
    ["b", "c", "a"]
  );
  assert.equal(result.selectedUid, "a");
});

test("patch.describeOperation returns readable descriptions", function () {
  const oldTree = node("root", "div", {}, [
    node("title", "h1", {}, [text("title-text", "old")])
  ]);
  const newTree = node("root", "div", {}, [
    node("title", "h1", {}, [text("title-text", "새 제목")])
  ]);

  const description = patch.describeOperation({
    op: "TEXT",
    uid: "title-text",
    value: "새 제목"
  }, oldTree, newTree);

  assert.match(description, /text/i);
  assert.match(description, /새 제목/);
});
