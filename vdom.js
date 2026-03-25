(function () {
  const app = window.VDOMApp = window.VDOMApp || {};

  const VOID_ELEMENTS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"
  ]);

  let uidCounter = 0;

  function nextUid(prefix) {
    uidCounter += 1;
    return (prefix || "v") + "-" + uidCounter;
  }

  function ensureUid(vnode) {
    if (!vnode.uid) {
      vnode.uid = nextUid(vnode.type === "#text" ? "t" : "n");
    }
    return vnode.uid;
  }

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function isIgnorableText(value) {
    return /^\s*$/.test(value || "");
  }

  function isTextNode(vnode) {
    return Boolean(vnode) && vnode.type === "#text";
  }

  function cloneVNode(vnode) {
    if (!vnode) {
      return null;
    }

    return {
      uid: vnode.uid,
      type: vnode.type,
      props: Object.assign({}, vnode.props),
      children: (vnode.children || []).map(cloneVNode)
    };
  }

  function walkVNode(vnode, visitor, meta) {
    if (!vnode) {
      return;
    }

    const nextMeta = meta || { parent: null, index: 0, depth: 0 };
    visitor(vnode, nextMeta);

    (vnode.children || []).forEach(function (child, index) {
      walkVNode(child, visitor, {
        parent: vnode,
        index: index,
        depth: nextMeta.depth + 1
      });
    });
  }

  function buildIndex(tree) {
    const index = new Map();

    walkVNode(tree, function (node, meta) {
      index.set(node.uid, {
        node: node,
        parent: meta.parent,
        index: meta.index,
        depth: meta.depth
      });
    });

    return index;
  }

  function getNodeByUid(tree, uid) {
    const index = buildIndex(tree);
    return index.has(uid) ? index.get(uid).node : null;
  }

  function countNodes(tree) {
    let total = 0;

    walkVNode(tree, function () {
      total += 1;
    });

    return total;
  }

  function collectDirectText(node) {
    if (!node || !node.children) {
      return "";
    }

    return node.children
      .filter(isTextNode)
      .map(function (child) {
        return normalizeText(child.props.nodeValue);
      })
      .join(" ")
      .trim();
  }

  function identitySignature(node) {
    if (!node) {
      return "";
    }

    if (node.type === "#text") {
      return "#text|" + normalizeText(node.props.nodeValue);
    }

    return [
      node.type,
      node.props && node.props.id ? node.props.id : "",
      node.props && node.props["data-key"] ? node.props["data-key"] : "",
      collectDirectText(node)
    ].join("|");
  }

  function ensureStableKeys(tree) {
    if (!tree) {
      return tree;
    }

    walkVNode(tree, function (node) {
      if (node.type === "#text") {
        return;
      }

      node.props = node.props || {};
      if (node.props.id === "playground-root") {
        return;
      }

      if (!node.props["data-key"]) {
        node.props["data-key"] = "key-" + ensureUid(node);
      }
    });

    return tree;
  }

  // Actual DOM -> VDOM conversion. Text nodes are preserved unless they are
  // formatting-only whitespace, which would add noise to the visualizer.
  function domToVNode(node) {
    if (!node) {
      return null;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      if (isIgnorableText(node.nodeValue)) {
        return null;
      }

      const textUid = node.__vdomUid || nextUid("t");
      node.__vdomUid = textUid;

      return {
        uid: textUid,
        type: "#text",
        props: { nodeValue: node.nodeValue },
        children: []
      };
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const props = {};
    Array.from(node.attributes).forEach(function (attribute) {
      props[attribute.name] = attribute.value;
    });

    const vnode = {
      uid: node.__vdomUid || nextUid("n"),
      type: node.tagName.toLowerCase(),
      props: props,
      children: []
    };

    node.__vdomUid = vnode.uid;

    Array.from(node.childNodes).forEach(function (childNode) {
      const childVNode = domToVNode(childNode);
      if (childVNode) {
        vnode.children.push(childVNode);
      }
    });

    return vnode;
  }

  function setDomProp(node, key, value) {
    if (key === "value" && "value" in node) {
      node.value = value;
    }
    node.setAttribute(key, value);
  }

  function vNodeToDom(vnode, domByUid) {
    ensureUid(vnode);

    let node;

    if (vnode.type === "#text") {
      node = document.createTextNode(vnode.props.nodeValue || "");
    } else {
      node = document.createElement(vnode.type);
      Object.keys(vnode.props || {}).forEach(function (key) {
        setDomProp(node, key, vnode.props[key]);
      });

      (vnode.children || []).forEach(function (child) {
        node.appendChild(vNodeToDom(child, domByUid));
      });
    }

    node.__vdomUid = vnode.uid;
    if (domByUid) {
      domByUid.set(vnode.uid, node);
    }

    return node;
  }

  function escapeText(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttribute(value) {
    return escapeText(value).replace(/"/g, "&quot;");
  }

  function serializeNode(node, depth) {
    if (!node) {
      return "";
    }

    if (node.type === "#text") {
      return "  ".repeat(depth) + escapeText(node.props.nodeValue);
    }

    const attributes = Object.keys(node.props || {})
      .map(function (key) {
        return key + '="' + escapeAttribute(node.props[key]) + '"';
      })
      .join(" ");

    const opening = "<" + node.type + (attributes ? " " + attributes : "") + ">";
    const closing = "</" + node.type + ">";

    if (!node.children || node.children.length === 0) {
      if (VOID_ELEMENTS.has(node.type)) {
        return "  ".repeat(depth) + opening;
      }
      return "  ".repeat(depth) + opening + closing;
    }

    const onlyTextChild = node.children.length === 1 && node.children[0].type === "#text";
    if (onlyTextChild) {
      return "  ".repeat(depth) + opening + escapeText(node.children[0].props.nodeValue) + closing;
    }

    const body = node.children
      .map(function (child) {
        return serializeNode(child, depth + 1);
      })
      .join("\n");

    return [
      "  ".repeat(depth) + opening,
      body,
      "  ".repeat(depth) + closing
    ].join("\n");
  }

  function serializeVNodeToHTML(vnode) {
    if (!vnode || !vnode.children) {
      return "";
    }

    return vnode.children
      .map(function (child) {
        return serializeNode(child, 0);
      })
      .join("\n");
  }

  function parseHTMLToVNode(html) {
    const template = document.createElement("template");
    template.innerHTML = html || "";

    const wrapper = document.createElement("div");
    wrapper.id = "playground-root";
    wrapper.appendChild(template.content.cloneNode(true));

    return ensureStableKeys(domToVNode(wrapper));
  }

  function findChildMatch(newChild, oldChildren, usedOldUids, newIndex) {
    let best = null;
    let bestScore = -1;

    oldChildren.forEach(function (oldChild, oldIndex) {
      if (!oldChild || usedOldUids.has(oldChild.uid)) {
        return;
      }

      let score = 0;

      if (newChild.uid && oldChild.uid === newChild.uid) {
        score = 100;
      } else if (
        newChild.props &&
        oldChild.props &&
        newChild.props.id &&
        newChild.props.id === oldChild.props.id
      ) {
        score = 92;
      } else if (
        newChild.props &&
        oldChild.props &&
        newChild.props["data-key"] &&
        newChild.props["data-key"] === oldChild.props["data-key"]
      ) {
        score = 84;
      } else if (identitySignature(newChild) && identitySignature(newChild) === identitySignature(oldChild)) {
        score = 70;
      } else if (oldIndex === newIndex && normalizeText(collectDirectText(newChild)) === normalizeText(collectDirectText(oldChild))) {
        score = 56;
      } else if (oldIndex === newIndex) {
        score = 45;
      }

      if (score > bestScore) {
        bestScore = score;
        best = oldChild;
      }
    });

    return best;
  }

  // UID reconciliation keeps textarea edits comparable to the committed tree so
  // the diff algorithm can detect moves and prop updates instead of replacing everything.
  function reconcileUids(oldTree, draftTree) {
    if (!draftTree) {
      return null;
    }

    const nextTree = cloneVNode(draftTree);

    if (!oldTree) {
      walkVNode(nextTree, function (node) {
        ensureUid(node);
      });
      return nextTree;
    }

    function syncNode(oldNode, newNode) {
      if (oldNode) {
        newNode.uid = oldNode.uid;
      } else {
        ensureUid(newNode);
      }

      const oldChildren = oldNode ? oldNode.children || [] : [];
      const usedOldUids = new Set();

      (newNode.children || []).forEach(function (newChild, newIndex) {
        const matchedOldChild = findChildMatch(newChild, oldChildren, usedOldUids, newIndex);

        if (matchedOldChild) {
          usedOldUids.add(matchedOldChild.uid);
          syncNode(matchedOldChild, newChild);
        } else {
          walkVNode(newChild, function (descendant) {
            ensureUid(descendant);
          });
        }
      });
    }

    syncNode(oldTree, nextTree);
    return nextTree;
  }

  function describeVNode(vnode) {
    if (!vnode) {
      return "unknown";
    }

    if (vnode.type === "#text") {
      const text = normalizeText(vnode.props.nodeValue).slice(0, 18) || "(empty)";
      return '#text "' + text + '"';
    }

    const idSuffix = vnode.props && vnode.props.id ? "#" + vnode.props.id : "";
    const classSuffix = vnode.props && vnode.props.class
      ? "." + vnode.props.class.trim().split(/\s+/).filter(Boolean).join(".")
      : "";

    return "<" + vnode.type + idSuffix + classSuffix + ">";
  }

  app.vdom = {
    nextUid: nextUid,
    cloneVNode: cloneVNode,
    walkVNode: walkVNode,
    buildIndex: buildIndex,
    getNodeByUid: getNodeByUid,
    countNodes: countNodes,
    normalizeText: normalizeText,
    isTextNode: isTextNode,
    domToVNode: domToVNode,
    vNodeToDom: vNodeToDom,
    parseHTMLToVNode: parseHTMLToVNode,
    serializeVNodeToHTML: serializeVNodeToHTML,
    reconcileUids: reconcileUids,
    describeVNode: describeVNode,
    ensureStableKeys: ensureStableKeys
  };
}());
