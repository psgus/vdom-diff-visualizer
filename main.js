(function () {
  const app = window.VDOMApp = window.VDOMApp || {};
  const vdom = app.vdom;
  const diff = app.diff;
  const patch = app.patch;
  const history = app.history;
  const tree = app.tree;
  const interaction = app.interaction;

  const SAMPLE_HTML = [
    '<section id="lesson-board" class="study-board">',
    '  <header class="intro">',
    '    <h1>React 코어 비주얼라이저</h1>',
    '    <p>패치가 실제로 어떤 노드만 바꾸는지 단계별로 추적해보세요.</p>',
    '  </header>',
    '  <article class="concept">',
    '    <h2>Virtual DOM</h2>',
    '    <p>스냅샷을 비교하면 diff와 patch의 흐름을 더 쉽게 이해할 수 있습니다.</p>',
    '  </article>',
    '  <ul class="steps">',
    '    <li>노드를 선택해보세요</li>',
    '    <li>props나 텍스트를 바꿔보세요</li>',
    '    <li>패치 로그를 확인해보세요</li>',
    '  </ul>',
    '</section>'
  ].join("\n");

  const state = {
    previousTree: null,
    committedTree: null,
    candidateTree: null,
    history: null,
    selectedUid: null,
    lastDiff: null,
    patchLog: [],
    domByUid: new Map(),
    previewDirty: false,
    commitVersion: 0
  };

  const refs = {};

  function getRefs() {
    refs.htmlInput = document.getElementById("html-input");
    refs.htmlPreviewBtn = document.getElementById("html-preview-btn");
    refs.patchBtn = document.getElementById("patch-btn");
    refs.resetDraftBtn = document.getElementById("reset-draft-btn");
    refs.undoBtn = document.getElementById("undo-btn");
    refs.redoBtn = document.getElementById("redo-btn");
    refs.applyNodeBtn = document.getElementById("apply-node-btn");
    refs.actionHelpText = document.getElementById("action-help-text");
    refs.selectionLabel = document.getElementById("selection-label");
    refs.selectionMeta = document.getElementById("selection-meta");
    refs.nodeFormDialog = document.getElementById("node-form-dialog");
    refs.nodeForm = document.getElementById("node-form");
    refs.nodeFormTitle = document.getElementById("node-form-title");
    refs.nodeFormTag = document.getElementById("node-form-tag");
    refs.nodeFormText = document.getElementById("node-form-text");
    refs.nodeFormClass = document.getElementById("node-form-class");
    refs.nodeFormCancel = document.getElementById("node-form-cancel");
    refs.commitStateChip = document.getElementById("commit-state-chip");
    refs.commitPreviewList = document.getElementById("commit-preview-list");
    refs.summaryMetrics = document.getElementById("summary-metrics");
    refs.domStage = document.getElementById("dom-stage");
    refs.leftTreeStage = document.getElementById("left-tree-stage");
    refs.rightTreeStage = document.getElementById("right-tree-stage");
    refs.leftTreeTitle = document.getElementById("left-tree-title");
    refs.rightTreeTitle = document.getElementById("right-tree-title");
    refs.modeChip = document.getElementById("mode-chip");
    refs.summaryChip = document.getElementById("summary-chip");
    refs.heroSelectionValue = document.getElementById("hero-selection-value");
    refs.heroSelectionNote = document.getElementById("hero-selection-note");
    refs.heroModeValue = document.getElementById("hero-mode-value");
    refs.heroModeNote = document.getElementById("hero-mode-note");
    refs.heroPatchValue = document.getElementById("hero-patch-value");
    refs.heroPatchNote = document.getElementById("hero-patch-note");
    refs.heroDomValue = document.getElementById("hero-dom-value");
    refs.heroDomNote = document.getElementById("hero-dom-note");
  }

  function createDomCanvas() {
    const canvas = document.createElement("div");
    canvas.className = "dom-canvas";
    return canvas;
  }

  function renderInitialDom(treeSnapshot) {
    state.domByUid = new Map();
    const rootNode = vdom.vNodeToDom(vdom.cloneVNode(treeSnapshot), state.domByUid);
    const canvas = createDomCanvas();
    canvas.appendChild(rootNode);
    refs.domStage.replaceChildren(canvas);
    return rootNode;
  }

  function getWorkingTree() {
    return state.candidateTree || state.committedTree;
  }

  function syncTextareaFromTree(treeSnapshot) {
    vdom.ensureStableKeys(treeSnapshot);
    refs.htmlInput.value = vdom.serializeVNodeToHTML(treeSnapshot);
  }

  function getSelectedMetaFromWorking() {
    const workingTree = getWorkingTree();
    if (!workingTree || !state.selectedUid) {
      return null;
    }

    return interaction.getMeta(workingTree, state.selectedUid);
  }

  function getEditableSelection() {
    const workingTree = getWorkingTree();
    if (!workingTree || !state.selectedUid) {
      return null;
    }

    return interaction.getEditorState(workingTree, state.selectedUid);
  }

  function getInspectableSelection() {
    const workingTree = getWorkingTree();
    const uid = state.selectedUid;

    if (!uid || !workingTree) {
      return null;
    }

    const workingNode = vdom.getNodeByUid(workingTree, uid);
    if (workingNode) {
      return {
        node: workingNode,
        source: state.previewDirty ? "draft" : "current"
      };
    }

    const committedNode = state.committedTree && vdom.getNodeByUid(state.committedTree, uid);
    if (committedNode) {
      return {
        node: committedNode,
        source: "committed"
      };
    }

    const previousNode = state.previousTree && vdom.getNodeByUid(state.previousTree, uid);
    if (previousNode) {
      return {
        node: previousNode,
        source: "reference"
      };
    }

    return null;
  }

  function shortenLabel(value, maxLength) {
    const text = String(value || "");
    if (text.length <= maxLength) {
      return text;
    }

    return text.slice(0, maxLength - 1) + "…";
  }

  function cloneGhostSubtree(vnode, prefix) {
    const cloned = vdom.cloneVNode(vnode);

    vdom.walkVNode(cloned, function (node) {
      node.uid = prefix + "-" + node.uid;
      node.props = Object.assign({}, node.props, {
        "__ghost": "true"
      });
    });

    return cloned;
  }

  function insertChildAt(parent, index, child) {
    if (!parent || !parent.children) {
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, parent.children.length));
    parent.children.splice(safeIndex, 0, child);
  }

  function buildCommittedComparisonView(oldTree, newTree, diffResult) {
    const leftTree = vdom.cloneVNode(oldTree);
    const rightTree = vdom.cloneVNode(newTree);
    const leftIndex = vdom.buildIndex(leftTree);
    const rightIndex = vdom.buildIndex(rightTree);
    const originalOldIndex = oldTree ? vdom.buildIndex(oldTree) : new Map();
    const originalNewIndex = newTree ? vdom.buildIndex(newTree) : new Map();
    const leftStatusByUid = Object.assign({}, diffResult.oldStatusByUid || {});
    const rightStatusByUid = Object.assign({}, diffResult.newStatusByUid || {});

    (diffResult.patches || []).forEach(function (op) {
      if (op.op === "INSERT") {
        const parentEntry = leftIndex.get(op.parentUid);
        if (!parentEntry) {
          return;
        }

        const ghostNode = cloneGhostSubtree(op.vnode, "ghost-add");
        insertChildAt(parentEntry.node, op.index, ghostNode);
        vdom.walkVNode(ghostNode, function (node) {
          leftStatusByUid[node.uid] = "added";
        });
      }

      if (op.op === "REMOVE") {
        const parentEntry = rightIndex.get(op.parentUid);
        const oldEntry = oldTree ? vdom.buildIndex(oldTree).get(op.uid) : null;
        if (!parentEntry || !oldEntry) {
          return;
        }

        const ghostNode = cloneGhostSubtree(oldEntry.node, "ghost-remove");
        insertChildAt(parentEntry.node, op.index, ghostNode);
        vdom.walkVNode(ghostNode, function (node) {
          rightStatusByUid[node.uid] = "removed";
        });
      }

      if (op.op === "MOVE") {
        const leftParentEntry = leftIndex.get(op.parentUid);
        const rightParentEntry = rightIndex.get(op.parentUid);
        const oldEntry = originalOldIndex.get(op.uid);
        const newEntry = originalNewIndex.get(op.uid);

        if (leftParentEntry && newEntry) {
          const moveGhostOnLeft = cloneGhostSubtree(newEntry.node, "ghost-move-target");
          insertChildAt(leftParentEntry.node, op.toIndex, moveGhostOnLeft);
          vdom.walkVNode(moveGhostOnLeft, function (node) {
            leftStatusByUid[node.uid] = "moved";
          });
        }

        if (rightParentEntry && oldEntry) {
          const moveGhostOnRight = cloneGhostSubtree(oldEntry.node, "ghost-move-origin");
          insertChildAt(rightParentEntry.node, op.fromIndex, moveGhostOnRight);
          vdom.walkVNode(moveGhostOnRight, function (node) {
            rightStatusByUid[node.uid] = "moved";
          });
        }
      }
    });

    return {
      leftTree: leftTree,
      rightTree: rightTree,
      leftStatusByUid: leftStatusByUid,
      rightStatusByUid: rightStatusByUid
    };
  }

  function requestNodePayload(mode) {
    const editable = getEditableSelection();
    if (!editable) {
      return Promise.resolve(null);
    }

    if (mode === "edit" && editable.isText) {
      return openNodeForm({
        title: "Edit Text Node",
        tag: "",
        text: editable.text || "",
        className: "",
        lockTag: true
      }).then(function (result) {
        if (!result) {
          return null;
        }

        return {
          tag: "",
          text: result.text,
          id: "",
          className: ""
        };
      });
    }

    const defaults = mode === "add"
      ? { tag: "div", text: "", className: "" }
      : {
          tag: editable.tag || "div",
          text: editable.text || "",
          className: editable.className || ""
        };

    return openNodeForm({
      title: mode === "add" ? "Add Child Node" : "Edit Node",
      tag: defaults.tag,
      text: defaults.text,
      className: defaults.className,
      lockTag: false
    }).then(function (result) {
      if (!result) {
        return null;
      }

      return {
        tag: result.tag,
        text: result.text,
        id: "",
        className: result.className
      };
    });
  }

  function openNodeForm(options) {
    return new Promise(function (resolve) {
      refs.nodeFormTitle.textContent = options.title;
      refs.nodeFormTag.value = options.tag || "";
      refs.nodeFormText.value = options.text || "";
      refs.nodeFormClass.value = options.className || "";
      refs.nodeFormTag.disabled = Boolean(options.lockTag);

      function cleanup(result) {
        refs.nodeForm.removeEventListener("submit", handleSubmit);
        refs.nodeFormCancel.removeEventListener("click", handleCancel);
        refs.nodeFormDialog.removeEventListener("cancel", handleCancel);
        refs.nodeFormDialog.close();
        resolve(result);
      }

      function handleSubmit(event) {
        event.preventDefault();
        cleanup({
          tag: refs.nodeFormTag.value.trim() || "div",
          text: refs.nodeFormText.value.trim(),
          className: refs.nodeFormClass.value.trim()
        });
      }

      function handleCancel(event) {
        if (event) {
          event.preventDefault();
        }
        cleanup(null);
      }

      refs.nodeForm.addEventListener("submit", handleSubmit);
      refs.nodeFormCancel.addEventListener("click", handleCancel);
      refs.nodeFormDialog.addEventListener("cancel", handleCancel);
      refs.nodeFormDialog.showModal();
      refs.nodeFormText.focus();
    });
  }

  function summarizeDiff(diffResult) {
    const summary = diffResult.summary;
    const opCounts = summary.opCounts;

    return [
      {
        label: "패치 수",
        value: summary.patchCount,
        note: summary.patchCount ? "실제 반영 후보 연산 수" : "아직 반영할 패치 없음"
      },
      {
        label: "변경 노드",
        value: summary.touchedNodes,
        note: summary.touchedNodes ? "색상으로 표시된 노드 수" : "영향받는 노드 없음"
      },
      {
        label: "렌더 노드",
        value: summary.renderedNodes || 0,
        note: summary.renderedNodes ? "이번 Patch에서 새로 그린 노드 수" : "Move/prop 변경만 있으면 0"
      },
      {
        label: "전체 렌더 기준",
        value: summary.fullRenderBaseline,
        note: "새 트리를 통째로 그릴 때 필요한 노드 수"
      },
      {
        label: "이동 수",
        value: opCounts.MOVE || 0,
        note: opCounts.MOVE ? "형제 순서 변경 감지" : "순서 이동 없음"
      }
    ];
  }

  function summarizeOperations(diffResult, oldTree, newTree, prefix) {
    if (!diffResult || !diffResult.patches.length) {
      return [];
    }

    return diffResult.patches.slice(0, 3).map(function (op) {
      return (prefix ? prefix + ": " : "") + patch.describeOperation(op, oldTree, newTree);
    });
  }

  function renderSummary(display) {
    const metrics = summarizeDiff(display.diff);
    refs.summaryMetrics.innerHTML = "";

    metrics.forEach(function (metric) {
      const item = document.createElement("article");
      item.className = "metric";

      const value = document.createElement("strong");
      value.textContent = metric.value;

      const label = document.createElement("span");
      label.className = "metric-label";
      label.textContent = metric.label;

      const note = document.createElement("small");
      note.className = "metric-note";
      note.textContent = metric.note;

      item.appendChild(value);
      item.appendChild(label);
      item.appendChild(note);
      refs.summaryMetrics.appendChild(item);
    });
    refs.summaryChip.textContent = display.modeLabel;
  }

  function renderHeroStats(display) {
    const inspected = getInspectableSelection();
    const patchCount = display.diff.summary.patchCount;
    const touchedNodes = display.diff.summary.touchedNodes;

    refs.heroSelectionValue.textContent = inspected
      ? shortenLabel(vdom.describeVNode(inspected.node), 18)
      : "없음";
    refs.heroSelectionNote.textContent = !inspected
      ? "현재 트리에서 노드를 고르세요"
      : state.previewDirty && inspected.source === "draft"
        ? "우측 초안 트리에서 편집 중"
        : inspected.source === "reference"
          ? "왼쪽 기준 트리에서만 보이는 노드"
          : "작업 바와 현재 트리가 함께 따라갑니다";

    refs.heroModeValue.textContent = state.previewDirty ? "초안 미리보기" : "현재 트리";
    refs.heroModeNote.textContent = state.previewDirty
      ? "Patch를 누르면 왼쪽 기준과 실제 DOM이 함께 갱신됩니다"
      : "확정된 상태만 Undo / Redo에 저장됩니다";

    refs.heroPatchValue.textContent = String(patchCount);
    refs.heroPatchNote.textContent = patchCount
      ? touchedNodes + "개 노드가 영향 범위에 있습니다"
      : "초안 변경이 없어 Patch가 비활성화됩니다";

    refs.heroDomValue.textContent = state.previewDirty ? "대기중" : "동기화";
    refs.heroDomNote.textContent = state.previewDirty
      ? "실제 DOM은 마지막 Patch 상태를 유지합니다"
      : "마지막 Patch 결과가 DOM에 반영되었습니다";
  }

  function renderCommitPreview(display) {
    let items = [];

    if (state.previewDirty) {
      refs.commitStateChip.textContent = "Draft Pending";
      items = summarizeOperations(display.diff, state.committedTree, state.candidateTree, "Queued");
      items.push("Left tree updates only after pressing Patch.");
      items.push("Added nodes appear in green on the current tree because they do not exist in the previous tree yet.");
    } else if (state.lastDiff && state.lastDiff.patches.length) {
      refs.commitStateChip.textContent = "Last Commit";
      items = summarizeOperations(
        state.lastDiff,
        state.previousTree || state.committedTree,
        state.committedTree,
        "Committed"
      );
      items.push("Current left tree already reflects the latest Patch.");
      items.push("Added nodes are visualized in green on the current tree only.");
    } else {
      refs.commitStateChip.textContent = "No Draft";
      items = [
        "No pending draft changes.",
        "The left tree stays unchanged until Patch is pressed."
      ];
    }

    refs.commitPreviewList.innerHTML = "";
    items.forEach(function (entry) {
      const item = document.createElement("li");
      item.textContent = entry;
      refs.commitPreviewList.appendChild(item);
    });
  }

  function getDisplayState() {
    if (state.previewDirty && state.candidateTree) {
      const previewDiff = diff.diff(state.committedTree, state.candidateTree);

      return {
        leftTree: state.committedTree,
        rightTree: state.candidateTree,
        diff: previewDiff,
        leftStatusByUid: {},
        rightStatusByUid: previewDiff.newStatusByUid,
        leftTitle: "패치 전 기준 트리",
        rightTitle: "패치 예정 트리",
        modeChip: "초안 미리보기",
        modeLabel: "Patch 전 예상 변경"
      };
    }

    const committedDiff = state.lastDiff || diff.diff(state.committedTree, state.committedTree);
    const comparisonView = buildCommittedComparisonView(
      state.previousTree || state.committedTree,
      state.committedTree,
      committedDiff
    );

    return {
      leftTree: comparisonView.leftTree,
      rightTree: comparisonView.rightTree,
      diff: committedDiff,
      leftStatusByUid: comparisonView.leftStatusByUid,
      rightStatusByUid: comparisonView.rightStatusByUid,
      leftTitle: "이전 트리",
      rightTitle: "현재 트리",
      modeChip: "현재 트리",
      modeLabel: "적용된 패치"
    };
  }

  function buildQuickActions() {
    const editable = getEditableSelection();
    const meta = getSelectedMetaFromWorking();

    if (!editable || !meta) {
      return [];
    }

    return [
      {
        id: "add",
        icon: "+",
        label: "자식 추가 초안",
        className: "tool-add",
        disabled: !editable.canAddChild
      },
      {
        id: "remove",
        icon: "-",
        label: "삭제 초안",
        className: "tool-remove",
        disabled: !editable.canRemove
      },
      {
        id: "move-up",
        icon: "^",
        label: "위로 이동 초안",
        className: "tool-move",
        disabled: !meta.parent || meta.index === 0
      },
      {
        id: "move-down",
        icon: "v",
        label: "아래로 이동 초안",
        className: "tool-move",
        disabled: !meta.parent || meta.index === meta.parent.children.length - 1
      }
    ];
  }

  function renderTrees(display) {
    refs.leftTreeTitle.textContent = display.leftTitle;
    refs.rightTreeTitle.textContent = display.rightTitle;
    refs.modeChip.textContent = display.modeChip;

    tree.renderTree({
      container: refs.leftTreeStage,
      tree: display.leftTree,
      statusByUid: display.leftStatusByUid || {},
      selectedUid: state.selectedUid,
      onSelect: selectNode
    });

    tree.renderTree({
      container: refs.rightTreeStage,
      tree: display.rightTree,
      statusByUid: display.rightStatusByUid || {},
      selectedUid: state.selectedUid,
      onSelect: selectNode,
      quickActions: buildQuickActions(),
      onAction: handleTreeAction
    });

    renderSummary(display);
  }

  function renderDomSelection() {
    refs.domStage.querySelectorAll(".dom-selected").forEach(function (element) {
      element.classList.remove("dom-selected");
    });

    let node = state.selectedUid ? state.domByUid.get(state.selectedUid) : null;
    if (node && node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode;
    }

    if (node && node.nodeType === Node.ELEMENT_NODE) {
      node.classList.add("dom-selected");
    }
  }

  function renderSelectionPanel() {
    const inspected = getInspectableSelection();
    const editable = getEditableSelection();

    refs.selectionLabel.textContent = inspected
      ? vdom.describeVNode(inspected.node)
      : "선택된 노드가 없습니다.";

    if (!inspected) {
      refs.selectionMeta.textContent = "현재 트리에서 노드를 클릭하세요. Add/Delete/Move는 트리에서 직접, Edit와 Patch는 위 작업 바에서 진행합니다.";
      return;
    }

    if (state.previewDirty && inspected.source === "draft") {
      refs.selectionMeta.textContent = "이 노드는 draft 상태입니다. 트리에서 계속 조작한 뒤 위의 Patch 버튼을 누르면 이전 트리와 실제 DOM에 반영됩니다.";
      return;
    }

    if (state.previewDirty && inspected.source === "committed") {
      refs.selectionMeta.textContent = "이 노드는 현재 실제 DOM에는 남아 있지만, 초안에서는 변경되었거나 삭제될 수 있습니다.";
      return;
    }

    if (!editable && inspected.source === "reference") {
      refs.selectionMeta.textContent = "이 노드는 이전 스냅샷에 속합니다. 현재 트리와 비교하면서 삭제와 이동을 관찰해보세요.";
      return;
    }

    if (!editable) {
      refs.selectionMeta.textContent = "현재 상태에서는 이 노드를 직접 편집할 수 없습니다.";
      return;
    }

    if (editable.isRoot) {
      refs.selectionMeta.textContent = "#playground-root 래퍼는 고정 루트입니다. 태그와 props는 잠겨 있지만 자식 추가는 가능합니다.";
      return;
    }

    if (editable.isText) {
      refs.selectionMeta.textContent = "이 노드는 text node입니다. Edit 버튼으로 텍스트만 수정할 수 있고 Patch 전까지는 draft로 유지됩니다.";
      return;
    }

    refs.selectionMeta.textContent = editable.hasNestedElements
      ? "Edit 버튼을 누르면 tag | text | class를 한 번에 입력할 수 있습니다. Add/Delete/Move는 트리의 빠른 버튼을 사용하세요."
      : "Edit 버튼으로 tag | text | class를 한 번에 바꾼 뒤 위의 Patch 버튼으로 확정할 수 있습니다.";
  }

  function renderControls() {
    const editable = getEditableSelection();
    const rootLocked = !editable || editable.isRoot;
    const workingTree = getWorkingTree();
    const serializedWorkingTree = workingTree
      ? vdom.serializeVNodeToHTML(vdom.cloneVNode(workingTree))
      : "";
    const htmlDraftDirty = refs.htmlInput.value !== serializedWorkingTree;

    refs.patchBtn.disabled = !state.previewDirty;
    refs.resetDraftBtn.disabled = !state.previewDirty;
    refs.undoBtn.disabled = state.previewDirty || !history.canUndo(state.history);
    refs.redoBtn.disabled = state.previewDirty || !history.canRedo(state.history);
    if (refs.htmlPreviewBtn) {
      refs.htmlPreviewBtn.disabled = !htmlDraftDirty;
    }

    if (refs.applyNodeBtn) {
      refs.applyNodeBtn.disabled = !editable || rootLocked;
    }

    if (refs.actionHelpText) {
      if (!editable) {
        refs.actionHelpText.textContent = "Select a node first. Use this panel to edit the current selection, then patch or reset the draft.";
      } else if (editable.isText) {
        refs.actionHelpText.textContent = "This is a text node. You can edit its content here, then patch the draft when you are ready.";
      } else if (editable.isRoot) {
        refs.actionHelpText.textContent = "You are on the root wrapper. The root itself cannot be edited or removed, but patch state is still tracked here.";
      } else {
        refs.actionHelpText.textContent = "Edit updates the current selection as a draft. The lower HTML button stages textarea edits into the top workspace, and Patch commits them to the live DOM.";
      }
    }
  }

  function renderAll() {
    const display = getDisplayState();
    renderSelectionPanel();
    renderControls();
    renderDomSelection();
    renderHeroStats(display);
    renderCommitPreview(display);
    renderTrees(display);
  }

  function selectNode(uid) {
    state.selectedUid = uid;
    renderAll();
  }

  function stageTree(nextTree, options) {
    const baseTree = getWorkingTree();
    const nextSnapshot = vdom.cloneVNode(nextTree);
    vdom.ensureStableKeys(nextSnapshot);
    const previewDiff = diff.diff(state.committedTree, nextSnapshot);

    state.candidateTree = nextSnapshot;
    state.previewDirty = previewDiff.patches.length > 0;
    state.selectedUid = interaction.resolveSelection(
      baseTree,
      nextSnapshot,
      options.selectedUid || state.selectedUid
    );

    syncTextareaFromTree(nextSnapshot);
    renderAll();
  }

  function commitTree(nextTree, options) {
    const oldTree = state.committedTree;
    const nextSnapshot = vdom.cloneVNode(nextTree);
    vdom.ensureStableKeys(nextSnapshot);
    const diffResult = diff.diff(oldTree, nextSnapshot);
    const patchResult = patch.applyPatches({
      oldTree: oldTree,
      newTree: nextSnapshot,
      patches: diffResult.patches,
      domByUid: state.domByUid
    });

    state.previousTree = oldTree ? vdom.cloneVNode(oldTree) : vdom.cloneVNode(nextSnapshot);
    state.committedTree = nextSnapshot;
    state.candidateTree = vdom.cloneVNode(nextSnapshot);
    state.lastDiff = diffResult;
    state.patchLog = diffResult.patches.length
      ? patchResult.logs
      : ["실제 DOM에 적용할 변경이 없었습니다."];
    state.previewDirty = false;
    state.selectedUid = interaction.resolveSelection(
      oldTree,
      nextSnapshot,
      options.selectedUid || state.selectedUid
    );
    state.commitVersion += 1;

    if (diffResult.patches.length > 0) {
      history.push(state.history, nextSnapshot);
    }

    syncTextareaFromTree(nextSnapshot);
    renderAll();
  }

  function handleHtmlPreview() {
    const baseTree = getWorkingTree();
    const draftTree = vdom.reconcileUids(
      baseTree,
      vdom.parseHTMLToVNode(refs.htmlInput.value)
    );
    vdom.ensureStableKeys(draftTree);
    const previewDiff = diff.diff(state.committedTree, draftTree);

    state.candidateTree = draftTree;
    state.previewDirty = previewDiff.patches.length > 0;
    state.selectedUid = interaction.resolveSelection(baseTree, draftTree, state.selectedUid);

    renderAll();
  }

  function handlePatch() {
    const baseTree = getWorkingTree();
    const draftTree = vdom.reconcileUids(
      baseTree,
      vdom.parseHTMLToVNode(refs.htmlInput.value)
    );
    vdom.ensureStableKeys(draftTree);

    commitTree(draftTree, {
      selectedUid: state.selectedUid
    });
  }

  function handleResetDraft() {
    const oldDraft = getWorkingTree();

    state.candidateTree = vdom.cloneVNode(state.committedTree);
    state.previewDirty = false;
    state.selectedUid = interaction.resolveSelection(oldDraft, state.committedTree, state.selectedUid);

    syncTextareaFromTree(state.committedTree);
    renderAll();
  }

  function handleApplyNodeEdit() {
    requestNodePayload("edit").then(function (payload) {
      if (!payload) {
        return;
      }

      const result = interaction.updateNode(getWorkingTree(), state.selectedUid, payload);
      if (!result) {
        return;
      }

      stageTree(result.tree, {
        selectedUid: result.selectedUid
      });
    });
  }

  function handleAddNode(targetUid) {
    requestNodePayload("add").then(function (payload) {
      if (!payload) {
        return;
      }

      const result = interaction.addChildNode(
        getWorkingTree(),
        targetUid || state.selectedUid,
        payload
      );

      if (!result) {
        return;
      }

      stageTree(result.tree, {
        selectedUid: result.selectedUid
      });
    });
  }

  function handleRemoveNode(targetUid) {
    const result = interaction.removeNode(getWorkingTree(), targetUid || state.selectedUid);
    if (!result) {
      return;
    }

    stageTree(result.tree, {
      selectedUid: result.fallbackUid
    });
  }

  function handleMove(direction, targetUid) {
    const result = interaction.moveNode(getWorkingTree(), targetUid || state.selectedUid, direction);
    if (!result) {
      return;
    }

    stageTree(result.tree, {
      selectedUid: result.selectedUid
    });
  }

  function handleTreeAction(actionId, uid) {
    if (uid && uid !== state.selectedUid) {
      state.selectedUid = uid;
    }

    if (actionId === "add") {
      handleAddNode(uid);
      return;
    }

    if (actionId === "remove") {
      handleRemoveNode(uid);
      return;
    }

    if (actionId === "move-up") {
      handleMove(-1, uid);
      return;
    }

    if (actionId === "move-down") {
      handleMove(1, uid);
    }
  }

  function handleUndo() {
    if (state.previewDirty) {
      return;
    }

    const transition = history.undo(state.history);
    if (!transition) {
      return;
    }

    const diffResult = diff.diff(transition.from, transition.to);
    const patchResult = patch.applyPatches({
      oldTree: transition.from,
      newTree: transition.to,
      patches: diffResult.patches,
      domByUid: state.domByUid
    });

    state.previousTree = vdom.cloneVNode(transition.from);
    state.committedTree = vdom.cloneVNode(transition.to);
    state.candidateTree = vdom.cloneVNode(transition.to);
    state.lastDiff = diffResult;
    state.patchLog = diffResult.patches.length
      ? patchResult.logs
      : ["실행 취소 시 실제 DOM 변경은 없었습니다."];
    state.previewDirty = false;
    state.selectedUid = interaction.resolveSelection(transition.from, transition.to, state.selectedUid);
    state.commitVersion += 1;

    syncTextareaFromTree(state.committedTree);
    renderAll();
  }

  function handleRedo() {
    if (state.previewDirty) {
      return;
    }

    const transition = history.redo(state.history);
    if (!transition) {
      return;
    }

    const diffResult = diff.diff(transition.from, transition.to);
    const patchResult = patch.applyPatches({
      oldTree: transition.from,
      newTree: transition.to,
      patches: diffResult.patches,
      domByUid: state.domByUid
    });

    state.previousTree = vdom.cloneVNode(transition.from);
    state.committedTree = vdom.cloneVNode(transition.to);
    state.candidateTree = vdom.cloneVNode(transition.to);
    state.lastDiff = diffResult;
    state.patchLog = diffResult.patches.length
      ? patchResult.logs
      : ["다시 실행 시 실제 DOM 변경은 없었습니다."];
    state.previewDirty = false;
    state.selectedUid = interaction.resolveSelection(transition.from, transition.to, state.selectedUid);
    state.commitVersion += 1;

    syncTextareaFromTree(state.committedTree);
    renderAll();
  }

  function handleDomClick(event) {
    let cursor = event.target;

    while (cursor && cursor !== refs.domStage) {
      if (cursor.__vdomUid) {
        selectNode(cursor.__vdomUid);
        return;
      }
      cursor = cursor.parentNode;
    }
  }

  function init() {
    getRefs();

    refs.htmlInput.value = SAMPLE_HTML;
    const initialTree = vdom.parseHTMLToVNode(SAMPLE_HTML);
    const rootNode = renderInitialDom(initialTree);
    const committedTree = vdom.domToVNode(rootNode);
    vdom.ensureStableKeys(committedTree);

    state.previousTree = vdom.cloneVNode(committedTree);
    state.committedTree = committedTree;
    state.candidateTree = vdom.cloneVNode(committedTree);
    state.history = history.createHistory(committedTree);
    state.lastDiff = diff.diff(committedTree, committedTree);
    state.patchLog = [
      "현재 트리에서 초안을 누적한 뒤 Patch를 누르면 왼쪽 이전 트리와 실제 DOM에 함께 반영됩니다."
    ];
    state.selectedUid = interaction.getFirstSelectableUid(committedTree);

    syncTextareaFromTree(committedTree);

    refs.htmlInput.addEventListener("input", renderControls);
    if (refs.htmlPreviewBtn) {
      refs.htmlPreviewBtn.addEventListener("click", handleHtmlPreview);
    }
    refs.patchBtn.addEventListener("click", handlePatch);
    refs.resetDraftBtn.addEventListener("click", handleResetDraft);
    refs.undoBtn.addEventListener("click", handleUndo);
    refs.redoBtn.addEventListener("click", handleRedo);
    if (refs.applyNodeBtn) {
      refs.applyNodeBtn.addEventListener("click", handleApplyNodeEdit);
    }
    refs.domStage.addEventListener("click", handleDomClick);

    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
}());
