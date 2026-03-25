# React VDOM Visualizer

브라우저에서 직접 Virtual DOM 트리를 보고, 수정하고, `diff -> patch -> 실제 DOM 반영` 흐름을 단계별로 확인할 수 있는 학습용 시각화 프로젝트입니다.

단순히 결과만 보여주는 데서 끝나지 않고, 초안(`draft`)과 확정(`patch`) 상태를 분리해서 비교할 수 있도록 만들어져 있습니다. 그래서 "무엇이 바뀌었는지", "언제 실제 DOM에 반영되는지", "이동(move) 패치가 어떻게 보이는지"를 한 번에 이해하기 좋습니다.

## 어떤 프로젝트인가요?

이 프로젝트는 Virtual DOM의 핵심 개념을 손으로 만져보듯 이해할 수 있게 만든 작은 워크스페이스입니다.

할 수 있는 것:

- 트리 노드 선택 및 편집
- 노드 추가 / 삭제 / 이동
- 오른쪽 작업 트리에서 드래그앤드롭으로 형제 노드 순서 변경
- HTML 초안 편집 후 별도 `Patch` 버튼으로 상단 워크스페이스에 반영
- 최종 `Patch`로 실제 DOM에만 반영
- 이전 트리 / 현재 트리 비교
- 변경 / 추가 / 삭제 / 이동 상태 시각화
- Undo / Redo 히스토리 확인

## 화면에서 볼 수 있는 흐름

이 프로젝트는 일부러 `draft`와 `commit`을 나눠서 보여줍니다.

1. 트리에서 노드를 수정하거나, 하단 HTML 편집기에 초안을 작성합니다.
2. 초안은 먼저 상단 비교 워크스페이스에만 반영됩니다.
3. 이 상태에서는 실제 DOM은 아직 유지됩니다.
4. 오른쪽 패널의 `Patch`를 누르면 실제 DOM과 커밋 상태가 갱신됩니다.

즉, "수정 중인 상태"와 "실제로 반영된 상태"를 분리해서 볼 수 있습니다.

## 실행 방법

### 1. 저장소 이동

```bash
cd react-vdom-visualizer
```

### 2. 로컬 서버 실행

```bash
npm start
```

기본 주소:

```text
http://127.0.0.1:8123
```

## 테스트 실행

```bash
npm test
```

직접 실행이 필요하면:

```bash
node tests/core.test.js
```

현재 테스트는 다음 핵심 로직을 확인합니다.

- stable key 부여
- diff 결과 계산
- history undo / redo
- reorderNode 재정렬 로직
- patch 설명 문자열 생성

## 사용 가이드

### 트리 편집

- 오른쪽 트리에서 노드를 선택합니다.
- `Edit`로 현재 노드 내용을 수정합니다.
- 노드 주변 퀵 액션으로 추가 / 삭제 / 이동 초안을 만들 수 있습니다.
- 형제 노드끼리는 드래그앤드롭으로 순서를 바꿀 수 있습니다.

### HTML 초안 편집

- 하단 `HTML Draft Editor`에서 HTML을 직접 수정합니다.
- 입력 즉시 반영되지 않습니다.
- 하단 `Patch` 버튼을 눌러야 상단 워크스페이스에 초안이 반영됩니다.

### 실제 DOM 반영

- 상단 오른쪽 패널의 `Patch` 버튼을 누르면 실제 DOM에 확정 반영됩니다.
- `Reset Draft`는 현재 초안을 버리고 마지막 커밋 상태로 되돌립니다.
- `Undo / Redo`는 커밋된 이력을 기준으로 동작합니다.

## 프로젝트 구조

```text
react-vdom-visualizer/
├─ index.html
├─ style.css
├─ main.js
├─ vdom.js
├─ diff.js
├─ patch.js
├─ history.js
├─ interaction.js
├─ tree.js
├─ serve.js
├─ package.json
└─ tests/
```

파일 역할:

- `vdom.js`: VDOM 생성, 직렬화, HTML 파싱, UID 정렬
- `diff.js`: 이전 / 다음 트리 비교 및 patch 목록 생성
- `patch.js`: patch 적용 및 설명 로그 생성
- `history.js`: undo / redo 기록 관리
- `interaction.js`: 노드 편집, 추가, 삭제, 이동, 재정렬
- `tree.js`: SVG 트리 렌더링과 선택 / 드래그 상호작용
- `main.js`: 전체 상태 관리와 화면 연결
- `serve.js`: 로컬 정적 서버

## 이런 분께 추천합니다

- Virtual DOM 개념을 눈으로 확인하고 싶은 분
- diff / patch 과정을 직접 만져보며 배우고 싶은 분
- DOM 반영 시점과 draft 상태를 분리해서 이해하고 싶은 분
- 프론트엔드 학습용 미니 프로젝트를 찾는 분

## 앞으로 더 확장할 수 있는 아이디어

- 노드 속성 패널 강화
- patch 로그 타임라인 시각화
- 드래그앤드롭의 부모 간 이동 지원
- 테스트 케이스 확장
- 예제 프리셋 추가

## License

학습 및 개인 포트폴리오 용도로 자유롭게 참고할 수 있습니다.
