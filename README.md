# Virtual DOM & Diff Algorithm Demo

## Overview

이 프로젝트는 **Virtual DOM과 diff 알고리즘의 필요성**을 이해하기 위해
제작된 발표 자료 및 데모입니다.

발표는 다음 두 가지 데모를 기반으로 진행됩니다.

1. **DOM vs Virtual DOM 비교 데모**
2. **[vdom-diff-visualizer](https://github.com/psgus/vdom-diff-visualizer)**를 활용한
   diff / patch 시각화

---

## Goal

- DOM 직접 조작의 한계를 이해한다
- Fragment / MutationObserver의 역할과 한계를 이해한다
- Virtual DOM이 왜 필요한지 설명할 수 있다
- diff -> patch -> DOM 반영 흐름을 시각적으로 이해한다

---

## What is DOM?

DOM(Document Object Model)은 브라우저가 웹 페이지를 트리 구조로 표현한 것입니다.

```html
<body>
  <h1>안녕</h1>
  <p>오늘 날씨 좋다</p>
</body>
```

```text
body
 ├── h1 ("안녕")
 └── p ("오늘 날씨 좋다")
```

## Problem: Why DOM is slow?

DOM은 단순한 JavaScript 객체가 아니라 브라우저 엔진 내부에서 관리되는 구조입니다.

따라서 DOM을 변경하면 다음과 같은 비용이 발생합니다.

- Layout 계산 (Reflow)
- 화면 다시 그리기 (Repaint)

이 과정은 누적될수록 비용이 커집니다.

---

## Demo 1: DOM vs Virtual DOM

### DOM 직접 조작

- 노드를 직접 추가 / 삭제 / 변경
- 변경이 많아질수록 로직이 복잡해짐
- 불필요한 업데이트 발생

### Virtual DOM 방식

- 메모리에서 가짜 DOM 생성
- 이전 상태와 비교
- 변경된 부분만 실제 DOM에 반영

---

## DocumentFragment

DocumentFragment는 DOM 삽입을 효율적으로 처리하기 위한 도구입니다.

### 장점

- 여러 DOM 조작을 메모리에서 수행
- 마지막에 한 번만 실제 DOM에 삽입
- Reflow 최소화

### 한계

- 어떤 노드를 변경해야 하는지 판단하지 못함
- diff 전략을 제공하지 않음

---

## MutationObserver

MutationObserver는 DOM 변화를 감지하는 브라우저 API입니다.

### 장점

- DOM 변경 감지 가능
- 추가 / 삭제 / 변경 추적 가능

### 한계

- 이미 변경된 이후에 감지
- 최적의 변경 전략을 제공하지 않음

---

## Virtual DOM

Virtual DOM은 실제 DOM을 직접 변경하지 않고,
메모리에서 상태를 비교한 뒤 최소 변경만 적용하는 방식입니다.

### 핵심 아이디어

1. 상태 변경
2. 새로운 Virtual DOM 생성
3. 이전 Virtual DOM과 비교 (diff)
4. 변경된 부분만 실제 DOM에 반영 (patch)

---

## Diff Algorithm

diff 알고리즘은 두 트리를 비교하여 변경된 부분을 찾는 과정입니다.

### 비교 결과

- 변경 (Update)
- 추가 (Insert)
- 삭제 (Remove)
- 이동 (Move)

---

## React Diff Rules

React는 성능을 위해 다음 규칙을 사용합니다.

- 태그가 다르면 전체 교체
- 태그가 같으면 속성 / 텍스트 비교
- 리스트는 `key` 기반 비교

---

## Key의 중요성

리스트에서 `key`는 요소를 식별하는 기준입니다.

### key가 없을 경우

`[A, B, C] -> [C, B, A]`

- 전체 변경으로 인식
- 불필요한 DOM 업데이트 발생

### key가 있을 경우

- 요소를 정확히 추적
- 이동으로 처리
- 성능 최적화

---

## Demo 2: vdom-diff-visualizer

[vdom-diff-visualizer](https://github.com/psgus/vdom-diff-visualizer)

이 도구는 Virtual DOM의 내부 동작을 시각적으로 보여줍니다.

### Draft vs Commit

- Draft: 변경 중인 상태
- Commit: 실제 DOM에 반영된 상태

### 특징

- Draft는 비교 영역에만 반영됨
- 실제 DOM은 유지됨
- Patch 버튼으로 최종 반영

### Diff Visualization

이 도구는 다음 상태를 시각화합니다.

- 변경 (Update)
- 추가 (Insert)
- 삭제 (Remove)
- 이동 (Move)

### Reorder & Key

- 드래그 앤 드롭으로 노드 이동 가능
- 이동 패치 확인 가능

`key`가 있으면:

- 이동으로 인식

`key`가 없으면:

- 삭제 + 생성으로 인식

---

## Patch

Patch는 diff 결과를 실제 DOM에 반영하는 과정입니다.

- Patch 버튼 클릭 -> 실제 DOM 반영
- Undo / Redo 지원

---

## Fragment vs MutationObserver vs Virtual DOM

| 기술 | 역할 | 한계 |
| --- | --- | --- |
| Fragment | DOM 삽입 최적화 | 비교 전략 없음 |
| MutationObserver | DOM 변화 감지 | 변경 후 감지 |
| Virtual DOM | 변경 전 비교 + 최소 업데이트 | 구현 복잡 |

---

## 핵심 정리

- DOM 직접 조작은 비용이 크다
- Fragment는 삽입을 최적화한다
- MutationObserver는 변화를 감지한다
- Virtual DOM은 변경 전에 비교하고 최소 변경만 적용한다

---

## 핵심 한 문장

Fragment는 조립을 도와주고, MutationObserver는 감시를 도와주지만,
Virtual DOM은 무엇을 최소한으로 바꿔야 하는지 판단해준다.

---

## Conclusion

Virtual DOM의 핵심은 단순히 빠르게 만드는 것이 아니라,

**"무엇을 바꿔야 하는지를 먼저 계산하는 것"**

입니다.



# Geo-Camo Rendering Engine

## Value Proposition

**미션**  
위성사진 한 장이면 주변 지형을 자동으로 샘플링해서, 은폐하려는 대상을 최소한의 DOM 조작만으로 감쪽같이 위장하는 렌더링 엔진을 만든다.

**비전**  
사막이든 바다든 숲이든 도시든, 어떤 환경의 사진이 들어와도 사람 손을 최소화하고 스스로 읽고 스스로 덮는 시스템을 만든다.

---

## 1분 기술 설명

### 1. Virtual DOM
이 프로젝트에서는 위성사진 위의 마커, 정보 패널 같은 화면 정보를 바로 수정하지 않고 먼저 JavaScript 객체 형태의 Virtual DOM으로 바꾼다.

즉, 화면을 단순한 픽셀이 아니라 구조로 이해하기 때문에 어떤 요소가 바뀌었는지 추적할 수 있고, 서비스 입장에서는 전체를 다시 그리지 않고도 필요한 부분만 다룰 수 있다.

### 2. Diff
이전 상태의 Virtual DOM과 변경 이후의 Virtual DOM을 비교해서 실제로 바뀐 부분만 찾는다.

- 어떤 노드, 속성, 요소가 변경되었는지
를 계산하고, 최소 변경만 Actual DOM에 반영한다.

### 3. 테스트 케이스

이 테스트 케이스에서 Diff가 정확한지, Patch가 최소 변경으로 반영되는지, Undo / Redo가 안정적으로 복원되는지 확인했습니다.

| 구분 | 테스트 방식 | 확인한 내용 | 결과 |
| --- | --- | --- | --- |
| `No-op Patch` | 아무 변경 없이 `Patch` 실행 | 불필요한 패치가 발생하지 않는지 확인 | `PASS` |
| `Text Node Change` | 마커 이름표 텍스트 수정 | 텍스트 변경만 정확히 감지하는지 확인 | `UPDATE` |
| `Attribute Update` | 마커 색상 또는 `class` 변경 | 속성만 최소 단위로 반영되는지 확인 | `UPDATE(props)` |
| `Node Create` | 새 마커 노드 추가 | 새 요소가 실제 DOM에 정확히 추가되는지 확인 | `CREATE` |
| `Node Remove` | 기존 마커 노드 삭제 | 삭제 대상만 정확히 제거되는지 확인 | `REMOVE` |
| `Element Replace` | `h3 → h2` 태그 교체 | 노드 타입 교체를 올바르게 판별하는지 확인 | `REPLACE` |
| `Undo / Redo` | 변경 후 `Undo`, 다시 `Redo` 실행 | 상태 이력이 안정적으로 복원되는지 확인 | `PASS` |
---
