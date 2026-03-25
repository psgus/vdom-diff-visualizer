(function () {
  const app = window.VDOMApp = window.VDOMApp || {};
  const vdom = app.vdom;

  function unmapDomSubtree(node, domByUid) {
    if (!node) {
      return;
    }

    if (node.__vdomUid) {
      domByUid.delete(node.__vdomUid);
    }

    Array.from(node.childNodes || []).forEach(function (childNode) {
      unmapDomSubtree(childNode, domByUid);
    });
  }

  function setDomProp(node, key, value) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    if (key === "value" && "value" in node) {
      node.value = value;
    }
    node.setAttribute(key, value);
  }

  function removeDomProp(node, key) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    if (key === "value" && "value" in node) {
      node.value = "";
    }
    node.removeAttribute(key);
  }

  function describeOperation(op, oldTree, newTree) {
    const oldIndex = oldTree ? vdom.buildIndex(oldTree) : new Map();
    const newIndex = newTree ? vdom.buildIndex(newTree) : new Map();
    const oldNode = op.uid && oldIndex.has(op.uid) ? oldIndex.get(op.uid).node : null;
    const newNode = op.uid && newIndex.has(op.uid) ? newIndex.get(op.uid).node : null;
    const parentNode = op.parentUid && newIndex.has(op.parentUid)
      ? newIndex.get(op.parentUid).node
      : op.parentUid && oldIndex.has(op.parentUid)
        ? oldIndex.get(op.parentUid).node
        : null;

    switch (op.op) {
      case "SET_PROP":
        return vdom.describeVNode(newNode || oldNode) + "의 " + op.key + ' 값을 "' + op.value + '"로 변경';
      case "REMOVE_PROP":
        return vdom.describeVNode(oldNode) + "에서 " + op.key + " 속성 제거";
      case "TEXT":
        return vdom.describeVNode(oldNode) + '의 텍스트를 "' + vdom.normalizeText(op.value).slice(0, 24) + '"로 변경';
      case "INSERT":
        return vdom.describeVNode(parentNode) + "의 index " + op.index + " 위치에 " + vdom.describeVNode(op.vnode) + " 추가";
      case "REMOVE":
        return vdom.describeVNode(parentNode) + "에서 " + vdom.describeVNode(oldNode) + " 삭제";
      case "MOVE":
        return vdom.describeVNode(newNode || oldNode) + "를 index " + op.fromIndex + "에서 " + op.toIndex + "로 이동";
      case "REPLACE":
        return vdom.describeVNode(oldNode) + "를 " + vdom.describeVNode(op.vnode) + "로 교체";
      default:
        return op.op;
    }
  }

  function applyPatches(options) {
    const oldTree = options.oldTree;
    const newTree = options.newTree;
    const patches = options.patches || [];
    const domByUid = options.domByUid;
    const logs = [];
    const affectedParents = new Set();
    const oldIndex = oldTree ? vdom.buildIndex(oldTree) : new Map();
    const newIndex = newTree ? vdom.buildIndex(newTree) : new Map();

    const propOps = patches.filter(function (patch) {
      return patch.op === "SET_PROP" || patch.op === "REMOVE_PROP" || patch.op === "TEXT";
    });
    const replaceOps = patches.filter(function (patch) {
      return patch.op === "REPLACE";
    });
    const removeOps = patches.filter(function (patch) {
      return patch.op === "REMOVE";
    }).sort(function (left, right) {
      const leftDepth = oldIndex.has(left.uid) ? oldIndex.get(left.uid).depth : 0;
      const rightDepth = oldIndex.has(right.uid) ? oldIndex.get(right.uid).depth : 0;
      return rightDepth - leftDepth;
    });
    const insertOps = patches.filter(function (patch) {
      return patch.op === "INSERT";
    }).sort(function (left, right) {
      if (left.parentUid === right.parentUid) {
        return left.index - right.index;
      }
      return 0;
    });
    const moveOps = patches.filter(function (patch) {
      return patch.op === "MOVE";
    });

    propOps.forEach(function (op) {
      const node = domByUid.get(op.uid);
      if (!node) {
        return;
      }

      if (op.op === "SET_PROP") {
        setDomProp(node, op.key, op.value);
      } else if (op.op === "REMOVE_PROP") {
        removeDomProp(node, op.key);
      } else if (op.op === "TEXT") {
        node.nodeValue = op.value;
      }

      logs.push(describeOperation(op, oldTree, newTree));
    });

    replaceOps.forEach(function (op) {
      const existingNode = domByUid.get(op.uid);
      if (!existingNode || !existingNode.parentNode) {
        return;
      }

      const nextEntries = new Map();
      const nextNode = vdom.vNodeToDom(vdom.cloneVNode(op.vnode), nextEntries);
      unmapDomSubtree(existingNode, domByUid);
      existingNode.parentNode.replaceChild(nextNode, existingNode);
      nextEntries.forEach(function (value, key) {
        domByUid.set(key, value);
      });
      affectedParents.add(op.parentUid);
      logs.push(describeOperation(op, oldTree, newTree));
    });

    removeOps.forEach(function (op) {
      const node = domByUid.get(op.uid);
      if (!node || !node.parentNode) {
        return;
      }

      node.parentNode.removeChild(node);
      unmapDomSubtree(node, domByUid);
      affectedParents.add(op.parentUid);
      logs.push(describeOperation(op, oldTree, newTree));
    });

    insertOps.forEach(function (op) {
      const parentNode = domByUid.get(op.parentUid);
      if (!parentNode) {
        return;
      }

      const nextNode = vdom.vNodeToDom(vdom.cloneVNode(op.vnode), domByUid);
      const anchorNode = parentNode.childNodes[op.index] || null;
      parentNode.insertBefore(nextNode, anchorNode);
      affectedParents.add(op.parentUid);
      logs.push(describeOperation(op, oldTree, newTree));
    });

    moveOps.forEach(function (op) {
      affectedParents.add(op.parentUid);
      logs.push(describeOperation(op, oldTree, newTree));
    });

    affectedParents.forEach(function (parentUid) {
      const parentNode = domByUid.get(parentUid);
      const parentEntry = newIndex.get(parentUid);

      if (!parentNode || !parentEntry) {
        return;
      }

      // Final order alignment uses insertBefore/appendChild semantics under the hood.
      parentEntry.node.children.forEach(function (childVNode) {
        const childNode = domByUid.get(childVNode.uid);
        if (!childNode) {
          return;
        }
        const anchorNode = parentNode.childNodes[parentEntry.node.children.indexOf(childVNode)] || null;
        if (childNode !== anchorNode) {
          parentNode.insertBefore(childNode, anchorNode);
        }
      });
    });

    return {
      logs: logs,
      opDescriptions: patches.map(function (patch) {
        return describeOperation(patch, oldTree, newTree);
      })
    };
  }

  app.patch = {
    applyPatches: applyPatches,
    describeOperation: describeOperation
  };
}());
