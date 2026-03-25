(function () {
  const app = window.VDOMApp = window.VDOMApp || {};
  const vdom = app.vdom;
  const SVG_NS = "http://www.w3.org/2000/svg";

  function createSvgElement(name, attributes) {
    const element = document.createElementNS(SVG_NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      element.setAttribute(key, attributes[key]);
    });
    return element;
  }

  function previewText(node) {
    if (!node) {
      return "";
    }

    if (node.type === "#text") {
      return (vdom.normalizeText(node.props.nodeValue) || "text").slice(0, 14);
    }

    const textChild = (node.children || []).find(function (child) {
      return child.type === "#text";
    });

    return textChild ? (vdom.normalizeText(textChild.props.nodeValue) || "").slice(0, 14) : "";
  }

  // The layout uses subtree leaf span so wide branches receive more horizontal room
  // while depth directly maps to y-position for easy visual scanning.
  function computeLayout(tree) {
    const nodes = [];
    const links = [];
    const positionsByUid = new Map();
    const gapX = 206;
    const gapY = 164;
    const originX = 156;
    const originY = 136;
    let cursor = 0;
    let maxDepth = 0;

    function visit(node, depth) {
      maxDepth = Math.max(maxDepth, depth);
      let currentX = cursor;

      if (!node.children || node.children.length === 0) {
        currentX = cursor;
        cursor += 1;
      } else {
        const childPositions = node.children.map(function (child) {
          return visit(child, depth + 1);
        });
        const first = childPositions[0];
        const last = childPositions[childPositions.length - 1];
        currentX = (first.xIndex + last.xIndex) / 2;

        childPositions.forEach(function (childPosition) {
          links.push({
            fromX: originX + currentX * gapX,
            fromY: originY + depth * gapY,
            toX: originX + childPosition.xIndex * gapX,
            toY: originY + childPosition.depth * gapY
          });
        });
      }

      const position = {
        node: node,
        xIndex: currentX,
        depth: depth,
        x: originX + currentX * gapX,
        y: originY + depth * gapY
      };

      nodes.push(position);
      positionsByUid.set(node.uid, position);
      return position;
    }

    if (tree) {
      visit(tree, 0);
    }

    return {
      nodes: nodes,
      links: links,
      positionsByUid: positionsByUid,
      width: Math.max(420, originX * 2 + Math.max(0, cursor - 1) * gapX),
      height: Math.max(280, originY * 2 + maxDepth * gapY)
    };
  }

  function renderQuickActions(svg, layout, selectedUid, actions, onAction) {
    if (!selectedUid || !actions || !actions.length) {
      return;
    }

    const selectedPosition = layout.positionsByUid.get(selectedUid);
    if (!selectedPosition) {
      return;
    }

    const actionLayer = createSvgElement("g", { class: "tree-tools" });
    const placements = [
      { dx: -104, dy: -84 },
      { dx: 104, dy: -84 },
      { dx: -104, dy: 84 },
      { dx: 104, dy: 84 }
    ];

    actions.forEach(function (action, index) {
      const placement = placements[index] || placements[placements.length - 1];
      const group = createSvgElement("g", {
        class: [
          "tree-tool",
          action.className || "",
          action.disabled ? "is-disabled" : ""
        ].join(" ").trim(),
        transform: "translate(" + (selectedPosition.x + placement.dx) + " " + (selectedPosition.y + placement.dy) + ")",
        role: "button",
        "aria-label": action.label
      });

      if (!action.disabled) {
        group.setAttribute("tabindex", "0");
      }

      group.addEventListener("click", function (event) {
        event.stopPropagation();
        if (!action.disabled && typeof onAction === "function") {
          onAction(action.id, selectedUid);
        }
      });

      group.addEventListener("keydown", function (event) {
        if ((event.key === "Enter" || event.key === " ") && !action.disabled) {
          event.preventDefault();
          if (typeof onAction === "function") {
            onAction(action.id, selectedUid);
          }
        }
      });

      const circle = createSvgElement("circle", {
        r: 24,
        class: "tree-tool-circle"
      });
      const label = createSvgElement("text", {
        y: "7",
        class: "tree-tool-label"
      });

      label.textContent = action.icon;
      group.appendChild(circle);
      group.appendChild(label);
      actionLayer.appendChild(group);
    });

    svg.appendChild(actionLayer);
  }

  function renderTree(options) {
    const container = options.container;
    const tree = options.tree;
    const statusByUid = options.statusByUid || {};
    const selectedUid = options.selectedUid;
    const onSelect = options.onSelect;
    const quickActions = options.quickActions || [];
    const onAction = options.onAction;
    const onReorder = options.onReorder;
    const enableDrag = Boolean(options.enableDrag);
    const dragState = {
      pointerId: null,
      sourceUid: null,
      sourceGroup: null,
      currentTargetUid: null,
      currentPlacement: null,
      moved: false,
      startX: 0,
      startY: 0,
      suppressClick: false
    };

    container.innerHTML = "";

    if (!tree) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.textContent = "표시할 트리가 아직 없습니다.";
      container.appendChild(empty);
      return;
    }

    const layout = computeLayout(tree);
    const treeIndex = vdom.buildIndex(tree);
    const svg = createSvgElement("svg", {
      viewBox: "0 0 " + layout.width + " " + layout.height,
      role: "img",
      "aria-label": "Virtual DOM 트리"
    });

    const linkLayer = createSvgElement("g");
    layout.links.forEach(function (link) {
      const line = createSvgElement("line", {
        x1: link.fromX,
        y1: link.fromY,
        x2: link.toX,
        y2: link.toY,
        class: "tree-link"
      });
      linkLayer.appendChild(line);
    });

    const nodeLayer = createSvgElement("g");
    layout.nodes.forEach(function (position) {
      const status = statusByUid[position.node.uid] || "unchanged";
      const isGhost = Boolean(position.node.props && position.node.props.__ghost);
      const group = createSvgElement("g", {
        class: [
          "tree-node",
          isGhost ? "is-ghost" : "",
          selectedUid === position.node.uid ? "selected" : "",
          status !== "unchanged" ? "status-" + status : ""
        ].join(" ").trim(),
        transform: "translate(" + position.x + " " + position.y + ")",
        tabindex: "0",
        role: "button",
        "data-uid": position.node.uid,
        "aria-label": vdom.describeVNode(position.node)
      });
      const meta = treeIndex.get(position.node.uid);
      const canDrag = enableDrag && !isGhost && meta && meta.parent;

      if (meta && meta.parent) {
        group.setAttribute("data-parent-uid", meta.parent.uid);
        group.setAttribute("data-index", String(meta.index));
      }
      if (canDrag) {
        group.classList.add("is-draggable");
      }

      group.addEventListener("click", function () {
        if (dragState.suppressClick) {
          dragState.suppressClick = false;
          return;
        }

        if (!isGhost && typeof onSelect === "function") {
          onSelect(position.node.uid);
        }
      });

      group.addEventListener("keydown", function (event) {
        if ((event.key === "Enter" || event.key === " ") && !isGhost) {
          event.preventDefault();
          if (typeof onSelect === "function") {
            onSelect(position.node.uid);
          }
        }
      });

      if (canDrag) {
        group.addEventListener("pointerdown", function (event) {
          if (event.button !== 0) {
            return;
          }

          dragState.pointerId = event.pointerId;
          dragState.sourceUid = position.node.uid;
          dragState.sourceGroup = group;
          dragState.currentTargetUid = null;
          dragState.currentPlacement = null;
          dragState.moved = false;
          dragState.startX = event.clientX;
          dragState.startY = event.clientY;
          dragState.suppressClick = false;
          group.setPointerCapture(event.pointerId);
        });
      }

      const circle = createSvgElement("circle", {
        r: 58,
        class: "tree-node-circle"
      });

      const label = createSvgElement("text", {
        y: "10",
        class: "tree-label"
      });
      label.textContent = position.node.type === "#text" ? "#text" : position.node.type;

      group.appendChild(circle);
      group.appendChild(label);

      if (status === "added" || status === "removed" || status === "moved") {
        const badge = createSvgElement("g", {
          class: "tree-status-badge badge-" + status,
          transform: "translate(34 -34)"
        });
        const badgeCircle = createSvgElement("circle", {
          r: 15,
          class: "tree-status-badge-circle"
        });
        const badgeLabel = createSvgElement("text", {
          y: "5",
          class: "tree-status-badge-label"
        });
        badgeLabel.textContent = status === "added" ? "+" : status === "removed" ? "-" : ">";
        badge.appendChild(badgeCircle);
        badge.appendChild(badgeLabel);
        group.appendChild(badge);
      }

      const preview = previewText(position.node);
      if (preview) {
        const subLabel = createSvgElement("text", {
          y: "92",
          class: "tree-sub-label"
        });
        subLabel.textContent = preview;
        group.appendChild(subLabel);
      }

      nodeLayer.appendChild(group);
    });

    svg.appendChild(linkLayer);
    svg.appendChild(nodeLayer);
    renderQuickActions(svg, layout, selectedUid, quickActions, onAction);

    if (enableDrag && typeof onReorder === "function") {
      function clearDropState() {
        svg.querySelectorAll(".tree-node.drop-before, .tree-node.drop-after, .tree-node.is-dragging").forEach(function (node) {
          node.classList.remove("drop-before", "drop-after", "is-dragging");
        });
      }

      svg.addEventListener("pointermove", function (event) {
        if (dragState.pointerId !== event.pointerId || !dragState.sourceGroup) {
          return;
        }

        const deltaX = event.clientX - dragState.startX;
        const deltaY = event.clientY - dragState.startY;
        if (!dragState.moved && Math.hypot(deltaX, deltaY) < 8) {
          return;
        }

        dragState.moved = true;
        dragState.suppressClick = true;
        dragState.sourceGroup.classList.add("is-dragging");

        const hovered = document.elementFromPoint(event.clientX, event.clientY);
        const targetGroup = hovered && hovered.closest ? hovered.closest(".tree-node") : null;
        clearDropState();
        dragState.sourceGroup.classList.add("is-dragging");

        if (!targetGroup || targetGroup === dragState.sourceGroup) {
          dragState.currentTargetUid = null;
          dragState.currentPlacement = null;
          return;
        }

        if (targetGroup.getAttribute("data-parent-uid") !== dragState.sourceGroup.getAttribute("data-parent-uid")) {
          dragState.currentTargetUid = null;
          dragState.currentPlacement = null;
          return;
        }

        const rect = targetGroup.getBoundingClientRect();
        const placement = event.clientX < rect.left + rect.width / 2 ? "before" : "after";
        targetGroup.classList.add(placement === "before" ? "drop-before" : "drop-after");
        dragState.currentTargetUid = targetGroup.getAttribute("data-uid");
        dragState.currentPlacement = placement;
      });

      function finishDrag(event) {
        if (dragState.pointerId !== event.pointerId || !dragState.sourceGroup) {
          return;
        }

        const sourceUid = dragState.sourceUid;
        const targetUid = dragState.currentTargetUid;
        const placement = dragState.currentPlacement;
        const moved = dragState.moved;
        const sourceGroup = dragState.sourceGroup;

        clearDropState();
        if (sourceGroup.hasPointerCapture && sourceGroup.hasPointerCapture(event.pointerId)) {
          sourceGroup.releasePointerCapture(event.pointerId);
        }

        dragState.pointerId = null;
        dragState.sourceUid = null;
        dragState.sourceGroup = null;
        dragState.currentTargetUid = null;
        dragState.currentPlacement = null;
        dragState.moved = false;

        if (moved && sourceUid && targetUid && placement) {
          onReorder({
            sourceUid: sourceUid,
            targetUid: targetUid,
            placement: placement
          });
        }
      }

      svg.addEventListener("pointerup", finishDrag);
      svg.addEventListener("pointercancel", finishDrag);
    }

    container.appendChild(svg);
  }

  app.tree = {
    renderTree: renderTree
  };
}());
