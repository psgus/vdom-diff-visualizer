(function () {
  const app = window.VDOMApp = window.VDOMApp || {};
  const vdom = app.vdom;

  function getMeta(tree, uid) {
    const index = vdom.buildIndex(tree);
    return index.get(uid) || null;
  }

  function sanitizeTag(tag) {
    const value = String(tag || "").trim().toLowerCase();
    return /^[a-z][a-z0-9-]*$/.test(value) ? value : "div";
  }

  function createTextNode(value, uid) {
    return {
      uid: uid || vdom.nextUid("t"),
      type: "#text",
      props: { nodeValue: value || "" },
      children: []
    };
  }

  function createNodeFromForm(data) {
    const tag = sanitizeTag(data.tag);
    const props = {};

    if (data.id && data.id.trim()) {
      props.id = data.id.trim();
    }
    if (data.className && data.className.trim()) {
      props.class = data.className.trim();
    }

    const node = {
      uid: vdom.nextUid("n"),
      type: tag,
      props: props,
      children: []
    };

    if (data.text && data.text.trim()) {
      node.children.push(createTextNode(data.text));
    }

    return node;
  }

  function getFirstDirectText(node) {
    return (node.children || []).find(function (child) {
      return child.type === "#text";
    }) || null;
  }

  function replaceDirectText(node, textValue) {
    const children = node.children || [];
    const hasText = Boolean(String(textValue || "").trim());
    const nextChildren = [];
    let inserted = false;
    let preservedTextUid = null;

    children.forEach(function (child) {
      if (child.type === "#text") {
        if (!inserted && hasText) {
          preservedTextUid = preservedTextUid || child.uid;
          nextChildren.push(createTextNode(textValue, preservedTextUid));
          inserted = true;
        }
        return;
      }

      nextChildren.push(child);
    });

    if (!inserted && hasText) {
      nextChildren.unshift(createTextNode(textValue));
    }

    node.children = nextChildren;
  }

  function getEditorState(tree, uid) {
    const meta = tree && uid ? getMeta(tree, uid) : null;
    if (!meta) {
      return null;
    }

    const node = meta.node;
    const directText = getFirstDirectText(node);
    const isRoot = node.uid === tree.uid;
    const isText = node.type === "#text";

    return {
      uid: node.uid,
      isRoot: isRoot,
      isText: isText,
      canAddChild: !isText,
      canRemove: !isRoot,
      canEditStructure: !isRoot && !isText,
      tag: isText ? "" : node.type,
      text: isText ? (node.props.nodeValue || "") : (directText ? directText.props.nodeValue || "" : ""),
      id: !isText && node.props && node.props.id ? node.props.id : "",
      className: !isText && node.props && node.props.class ? node.props.class : "",
      hasNestedElements: Boolean((node.children || []).some(function (child) {
        return child.type !== "#text";
      })),
      description: vdom.describeVNode(node)
    };
  }

  // Tree editing actions operate on cloned VDOM snapshots so every commit can be
  // diffed, patched, and pushed into history without mutating the previous state.
  function addChildNode(tree, parentUid, formData) {
    const nextTree = vdom.cloneVNode(tree);
    const parentMeta = getMeta(nextTree, parentUid);

    if (!parentMeta || parentMeta.node.type === "#text") {
      return null;
    }

    const childNode = createNodeFromForm(formData);
    parentMeta.node.children.push(childNode);

    return {
      tree: nextTree,
      selectedUid: childNode.uid
    };
  }

  function updateNode(tree, uid, formData) {
    const nextTree = vdom.cloneVNode(tree);
    const meta = getMeta(nextTree, uid);

    if (!meta) {
      return null;
    }

    const node = meta.node;
    if (node.uid === nextTree.uid) {
      return null;
    }

    if (node.type === "#text") {
      node.props.nodeValue = formData.text || "";
      return {
        tree: nextTree,
        selectedUid: uid
      };
    }

    node.type = sanitizeTag(formData.tag || node.type);
    node.props = node.props || {};

    if (formData.id && formData.id.trim()) {
      node.props.id = formData.id.trim();
    } else {
      delete node.props.id;
    }

    if (formData.className && formData.className.trim()) {
      node.props.class = formData.className.trim();
    } else {
      delete node.props.class;
    }

    replaceDirectText(node, formData.text || "");

    return {
      tree: nextTree,
      selectedUid: uid
    };
  }

  function removeNode(tree, uid) {
    const nextTree = vdom.cloneVNode(tree);
    if (nextTree.uid === uid) {
      return null;
    }

    const meta = getMeta(nextTree, uid);
    if (!meta || !meta.parent) {
      return null;
    }

    meta.parent.children.splice(meta.index, 1);

    return {
      tree: nextTree,
      fallbackUid: meta.parent.uid
    };
  }

  function moveNode(tree, uid, direction) {
    const nextTree = vdom.cloneVNode(tree);
    const meta = getMeta(nextTree, uid);

    if (!meta || !meta.parent) {
      return null;
    }

    const targetIndex = meta.index + direction;
    if (targetIndex < 0 || targetIndex >= meta.parent.children.length) {
      return null;
    }

    const siblings = meta.parent.children;
    const movingNode = siblings.splice(meta.index, 1)[0];
    siblings.splice(targetIndex, 0, movingNode);

    return {
      tree: nextTree,
      selectedUid: uid
    };
  }

  function reorderNode(tree, sourceUid, targetUid, placement) {
    const nextTree = vdom.cloneVNode(tree);
    const sourceMeta = getMeta(nextTree, sourceUid);
    const targetMeta = getMeta(nextTree, targetUid);

    if (!sourceMeta || !targetMeta || !sourceMeta.parent || !targetMeta.parent) {
      return null;
    }

    if (sourceUid === targetUid || sourceMeta.parent.uid !== targetMeta.parent.uid) {
      return null;
    }

    if (placement !== "before" && placement !== "after") {
      return null;
    }

    const siblings = sourceMeta.parent.children;
    const movingNode = siblings.splice(sourceMeta.index, 1)[0];
    let targetIndex = targetMeta.index;

    if (sourceMeta.index < targetMeta.index) {
      targetIndex -= 1;
    }

    if (placement === "after") {
      targetIndex += 1;
    }

    if (targetIndex < 0) {
      targetIndex = 0;
    }
    if (targetIndex > siblings.length) {
      targetIndex = siblings.length;
    }

    if (targetIndex === sourceMeta.index) {
      siblings.splice(sourceMeta.index, 0, movingNode);
      return null;
    }

    siblings.splice(targetIndex, 0, movingNode);

    return {
      tree: nextTree,
      selectedUid: sourceUid
    };
  }

  function getFirstSelectableUid(tree) {
    if (!tree) {
      return null;
    }

    return tree.children && tree.children.length ? tree.children[0].uid : tree.uid;
  }

  function resolveSelection(oldTree, newTree, selectedUid) {
    if (!newTree) {
      return null;
    }

    if (selectedUid && vdom.getNodeByUid(newTree, selectedUid)) {
      return selectedUid;
    }

    if (oldTree && selectedUid) {
      const oldIndex = vdom.buildIndex(oldTree);
      let cursor = oldIndex.get(selectedUid);

      while (cursor && cursor.parent) {
        if (vdom.getNodeByUid(newTree, cursor.parent.uid)) {
          return cursor.parent.uid;
        }
        cursor = oldIndex.get(cursor.parent.uid);
      }
    }

    return getFirstSelectableUid(newTree);
  }

  app.interaction = {
    getMeta: getMeta,
    getEditorState: getEditorState,
    addChildNode: addChildNode,
    updateNode: updateNode,
    removeNode: removeNode,
    moveNode: moveNode,
    reorderNode: reorderNode,
    getFirstSelectableUid: getFirstSelectableUid,
    resolveSelection: resolveSelection
  };
}());
