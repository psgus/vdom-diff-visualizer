(function () {
  const app = window.VDOMApp = window.VDOMApp || {};
  const vdom = app.vdom;

  function createHistory(initialTree) {
    return {
      past: [],
      present: vdom.cloneVNode(initialTree),
      future: []
    };
  }

  function push(history, nextTree) {
    history.past.push(vdom.cloneVNode(history.present));
    history.present = vdom.cloneVNode(nextTree);
    history.future = [];
    return history;
  }

  function canUndo(history) {
    return Boolean(history && history.past.length);
  }

  function canRedo(history) {
    return Boolean(history && history.future.length);
  }

  function undo(history) {
    if (!canUndo(history)) {
      return null;
    }

    const previous = history.past.pop();
    history.future.unshift(vdom.cloneVNode(history.present));
    const from = vdom.cloneVNode(history.present);
    history.present = vdom.cloneVNode(previous);

    return {
      from: from,
      to: vdom.cloneVNode(previous)
    };
  }

  function redo(history) {
    if (!canRedo(history)) {
      return null;
    }

    const next = history.future.shift();
    history.past.push(vdom.cloneVNode(history.present));
    const from = vdom.cloneVNode(history.present);
    history.present = vdom.cloneVNode(next);

    return {
      from: from,
      to: vdom.cloneVNode(next)
    };
  }

  app.history = {
    createHistory: createHistory,
    push: push,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo
  };
}());
