(function () {
  const app = window.VDOMApp = window.VDOMApp || {};
  const vdom = app.vdom;

  const STATUS_PRIORITY = {
    unchanged: 0,
    changed: 1,
    moved: 2,
    added: 3,
    removed: 3
  };

  function setStatus(map, uid, status) {
    if (!uid) {
      return;
    }

    const current = map[uid] || "unchanged";
    if (STATUS_PRIORITY[status] >= STATUS_PRIORITY[current]) {
      map[uid] = status;
    }
  }

  function markSubtree(map, vnode, status) {
    vdom.walkVNode(vnode, function (node) {
      setStatus(map, node.uid, status);
    });
  }

  function countByType(patches) {
    return patches.reduce(function (result, patch) {
      result[patch.op] = (result[patch.op] || 0) + 1;
      return result;
    }, {});
  }

  function countRenderedNodesFromPatches(patches) {
    return patches.reduce(function (total, patch) {
      if (patch.op === "INSERT" || patch.op === "REPLACE") {
        return total + vdom.countNodes(patch.vnode);
      }

      return total;
    }, 0);
  }

  function lisIndexes(sequence) {
    if (!sequence.length) {
      return [];
    }

    const parents = new Array(sequence.length);
    const tails = [];

    for (let i = 0; i < sequence.length; i += 1) {
      const value = sequence[i];
      let low = 0;
      let high = tails.length;

      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (sequence[tails[middle]] < value) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }

      parents[i] = low > 0 ? tails[low - 1] : -1;
      tails[low] = i;
    }

    let cursor = tails[tails.length - 1];
    const lis = [];

    while (cursor >= 0 && cursor !== undefined) {
      lis.push(cursor);
      cursor = parents[cursor];
    }

    return lis.reverse();
  }

  // Diff compares the previous and next VDOM trees, emitting minimal patch ops
  // for type changes, props, text, insertions, removals, and sibling reorders.
  function diff(oldTree, newTree) {
    const patches = [];
    const oldStatusByUid = {};
    const newStatusByUid = {};
    const touchedNodes = new Set();

    function touch(uid) {
      if (uid) {
        touchedNodes.add(uid);
      }
    }

    function touchSubtree(vnode) {
      vdom.walkVNode(vnode, function (node) {
        touch(node.uid);
      });
    }

    function markChanged(oldNode, newNode, options) {
      const config = options || {};

      if (oldNode) {
        if (config.markOldSubtree) {
          markSubtree(oldStatusByUid, oldNode, "changed");
          touchSubtree(oldNode);
        } else {
          setStatus(oldStatusByUid, oldNode.uid, "changed");
          touch(oldNode.uid);
        }
      }
      if (newNode) {
        if (config.markNewSubtree) {
          markSubtree(newStatusByUid, newNode, "changed");
          touchSubtree(newNode);
        } else {
          setStatus(newStatusByUid, newNode.uid, "changed");
          touch(newNode.uid);
        }
      }
    }

    function diffProps(oldNode, newNode) {
      const oldProps = oldNode.props || {};
      const newProps = newNode.props || {};
      const keys = new Set(Object.keys(oldProps).concat(Object.keys(newProps)));

      keys.forEach(function (key) {
        if (!(key in newProps)) {
          patches.push({
            op: "REMOVE_PROP",
            uid: oldNode.uid,
            key: key
          });
          markChanged(oldNode, newNode);
        } else if (!(key in oldProps) || oldProps[key] !== newProps[key]) {
          patches.push({
            op: "SET_PROP",
            uid: oldNode.uid,
            key: key,
            value: newProps[key]
          });
          markChanged(oldNode, newNode);
        }
      });
    }

    function diffChildren(oldNode, newNode) {
      const oldChildren = oldNode.children || [];
      const newChildren = newNode.children || [];
      const oldByUid = new Map();
      const newByUid = new Map();

      oldChildren.forEach(function (child, index) {
        oldByUid.set(child.uid, { child: child, index: index });
      });

      newChildren.forEach(function (child, index) {
        newByUid.set(child.uid, { child: child, index: index });
      });

      oldChildren.forEach(function (oldChild, oldIndex) {
        if (!newByUid.has(oldChild.uid)) {
          patches.push({
            op: "REMOVE",
            uid: oldChild.uid,
            parentUid: oldNode.uid,
            index: oldIndex
          });
          markSubtree(oldStatusByUid, oldChild, "removed");
          touch(oldChild.uid);
        }
      });

      newChildren.forEach(function (newChild, newIndex) {
        const oldEntry = oldByUid.get(newChild.uid);

        if (!oldEntry) {
          patches.push({
            op: "INSERT",
            parentUid: oldNode.uid,
            index: newIndex,
            vnode: vdom.cloneVNode(newChild)
          });
          setStatus(oldStatusByUid, oldNode.uid, "added");
          touch(oldNode.uid);
          markSubtree(newStatusByUid, newChild, "added");
          touch(newChild.uid);
          return;
        }

        diffNode(oldEntry.child, newChild, oldNode.uid, newIndex);
      });

      const retainedNew = newChildren.filter(function (child) {
        return oldByUid.has(child.uid);
      });

      const oldIndexSequence = retainedNew.map(function (child) {
        return oldByUid.get(child.uid).index;
      });

      const stableIndexes = new Set(lisIndexes(oldIndexSequence));

      retainedNew.forEach(function (child, retainedIndex) {
        const oldIndex = oldByUid.get(child.uid).index;
        const newIndex = newByUid.get(child.uid).index;

        if (oldIndex !== newIndex && !stableIndexes.has(retainedIndex)) {
          patches.push({
            op: "MOVE",
            uid: child.uid,
            parentUid: oldNode.uid,
            fromIndex: oldIndex,
            toIndex: newIndex
          });
          setStatus(oldStatusByUid, child.uid, "moved");
          setStatus(newStatusByUid, child.uid, "moved");
          touch(child.uid);
        }
      });
    }

    function diffNode(oldNode, newNode, parentUid, index) {
      if (!oldNode && newNode) {
        patches.push({
          op: "INSERT",
          parentUid: parentUid,
          index: index,
          vnode: vdom.cloneVNode(newNode)
        });
        markSubtree(newStatusByUid, newNode, "added");
        touch(newNode.uid);
        return;
      }

      if (oldNode && !newNode) {
        patches.push({
          op: "REMOVE",
          uid: oldNode.uid,
          parentUid: parentUid,
          index: index
        });
        markSubtree(oldStatusByUid, oldNode, "removed");
        touch(oldNode.uid);
        return;
      }

      if (oldNode.type !== newNode.type) {
        patches.push({
          op: "REPLACE",
          uid: oldNode.uid,
          parentUid: parentUid,
          index: index,
          vnode: vdom.cloneVNode(newNode)
        });
        markChanged(oldNode, newNode, {
          markOldSubtree: true,
          markNewSubtree: true
        });
        return;
      }

      if (oldNode.type === "#text") {
        const oldText = oldNode.props.nodeValue || "";
        const newText = newNode.props.nodeValue || "";

        if (oldText !== newText) {
          patches.push({
            op: "TEXT",
            uid: oldNode.uid,
            value: newText
          });
          markChanged(oldNode, newNode);
        }

        return;
      }

      diffProps(oldNode, newNode);
      diffChildren(oldNode, newNode);
    }

    diffNode(oldTree, newTree, null, 0);

    return {
      patches: patches,
      oldStatusByUid: oldStatusByUid,
      newStatusByUid: newStatusByUid,
      summary: {
        patchCount: patches.length,
        touchedNodes: touchedNodes.size,
        renderedNodes: countRenderedNodesFromPatches(patches),
        fullRenderBaseline: vdom.countNodes(newTree),
        opCounts: countByType(patches)
      }
    };
  }

  app.diff = {
    diff: diff
  };
}());
