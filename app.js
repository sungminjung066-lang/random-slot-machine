const slotRoot = document.getElementById("slotRoot");

const reelEl = document.getElementById("reel");
const spinBtn = document.getElementById("spinBtn");
const leverBtn = document.getElementById("lever");

const resultEl = document.getElementById("result");
const historyEl = document.getElementById("historyList");
const statsEl = document.getElementById("statsList");

const itemInput = document.getElementById("itemInput");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");
const menuListEl = document.getElementById("menuList");

// ===== 저장/기본값 =====
const STORAGE_KEY = "slot_items_v2";
const DEFAULT_ITEMS = ["🍕 피자", "🍜 라면", "🍣 초밥", "🍔 버거", "🥗 샐러드"];

let items = loadItems();

// 룰렛 설정
const ROW_H = 64;
const REPEAT = 14;

let isSpinning = false;

// 히스토리/통계
let history = [];
let stats = Object.create(null);

// ===== Web Audio (딸깍/레버) =====
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function tickSound() {
  ensureAudio();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  o.type = "square";
  o.frequency.value = 900;

  g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.03);

  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.035);
}

function leverSound() {
  ensureAudio();

  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sawtooth";

  const t = audioCtx.currentTime;
  o.frequency.setValueAtTime(500, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.12);

  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t);
  o.stop(t + 0.16);

  // 마지막 클릭
  setTimeout(() => {
    try {
      tickSound();
    } catch (e) {}
  }, 120);
}

// translateY 읽기
function getTranslateY(el) {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  const m = new DOMMatrixReadOnly(t);
  return m.m42;
}

// ===== 저장/불러오기 =====
function loadItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length >= 2) return saved;
  } catch (e) {}
  return [...DEFAULT_ITEMS];
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// 여러 개 입력 파싱(줄바꿈/쉼표)
function parseItems(raw) {
  return raw
    .split(/[\n,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ===== 렌더링 =====
function renderReel() {
  reelEl.innerHTML = "";
  for (let r = 0; r < REPEAT; r++) {
    for (const it of items) {
      const li = document.createElement("li");
      li.className = "item";
      li.textContent = it;
      reelEl.appendChild(li);
    }
  }
  reelEl.style.transition = "none";
  reelEl.style.transform = `translateY(0px)`;
}

function renderMenuList() {
  menuListEl.innerHTML = "";

  items.forEach((name, idx) => {
    const li = document.createElement("li");
    li.className = "menu-row";

    const span = document.createElement("span");
    span.className = "name";
    span.textContent = name;

    const btn = document.createElement("button");
    btn.className = "del-btn";
    btn.textContent = "삭제";
    btn.onclick = () => deleteItem(idx);

    li.appendChild(span);
    li.appendChild(btn);
    menuListEl.appendChild(li);
  });
}

function renderHistory() {
  historyEl.innerHTML = "";
  history.slice(0, 10).forEach((h) => {
    const li = document.createElement("li");
    li.textContent = h;
    historyEl.appendChild(li);
  });
}

function renderStats() {
  statsEl.innerHTML = "";
  const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    const li = document.createElement("li");
    li.textContent = "아직 없음";
    statsEl.appendChild(li);
    return;
  }

  for (const [name, count] of sorted) {
    const li = document.createElement("li");
    li.textContent = `${name}: ${count}회`;
    statsEl.appendChild(li);
  }
}

function renderAll() {
  renderReel();
  renderMenuList();
  renderHistory();
  renderStats();
}

renderAll();

// ===== 메뉴 추가/삭제 =====
function addItems() {
  const raw = itemInput.value.trim();
  if (!raw) return;

  const incoming = parseItems(raw);

  const newOnes = [];
  for (const it of incoming) {
    if (!items.includes(it) && !newOnes.includes(it)) newOnes.push(it);
  }

  if (newOnes.length === 0) {
    alert("추가할 새 메뉴가 없어요! (중복일 수 있어요)");
    return;
  }

  items.push(...newOnes);
  itemInput.value = "";
  saveItems();
  renderAll();
}

function deleteItem(index) {
  if (isSpinning) return;

  if (items.length <= 2) {
    alert("메뉴는 최소 2개 이상 있어야 룰렛이 돌아가요!");
    return;
  }

  const name = items[index];
  if (!confirm(`"${name}" 을(를) 삭제할까요?`)) return;

  // items에서 제거
  items.splice(index, 1);

  // 히스토리/통계에서 해당 항목 제거(깔끔하게)
  history = history.filter((h) => h !== name);
  delete stats[name];

  saveItems();
  renderAll();
}

function clearAllToDefault() {
  if (isSpinning) return;
  if (!confirm("메뉴를 전부 삭제하고 기본값으로 되돌릴까요?")) return;

  items = [...DEFAULT_ITEMS];
  history = [];
  stats = Object.create(null);
  saveItems();

  resultEl.textContent = "결과: -";
  renderAll();
}

// ===== 스핀(2단 애니메이션 + 딸깍) =====
function spin() {
  if (isSpinning) return;

  if (items.length < 2) {
    alert("항목을 2개 이상 넣어줘!");
    return;
  }

  isSpinning = true;
  spinBtn.disabled = true;

  // 진짜 결과
  const winIndex = Math.floor(Math.random() * items.length);

  // 연출용 이동 인덱스
  const extraRounds = 7 + Math.floor(Math.random() * 4); // 7~10
  const totalIndex = extraRounds * items.length + winIndex;

  const targetY = -totalIndex * ROW_H;

  // 2단: 1) 빠르게 멀리 2) 천천히 목표로
  const stage1Index =
    (extraRounds - 2) * items.length + Math.floor(Math.random() * items.length);
  const stage1Y = -stage1Index * ROW_H;

  // 딸깍: 줄이 바뀔 때마다 재생
  let lastStep = null;
  let ticking = true;

  function rafTick() {
    if (!ticking) return;
    const y = getTranslateY(reelEl);
    const step = Math.floor(-y / ROW_H);
    if (step !== lastStep) {
      lastStep = step;
      tickSound();
    }
    requestAnimationFrame(rafTick);
  }
  requestAnimationFrame(rafTick);

  // 1단(빠름)
  reelEl.style.transition = "transform 0.9s cubic-bezier(.1,.8,.2,1)";
  reelEl.style.transform = `translateY(${stage1Y}px)`;

  reelEl.addEventListener(
    "transitionend",
    () => {
      // 2단(느려지며 멈춤)
      reelEl.style.transition = "transform 1.9s cubic-bezier(.12,.68,.12,1)";
      reelEl.style.transform = `translateY(${targetY}px)`;

      reelEl.addEventListener(
        "transitionend",
        () => {
          ticking = false;

          const winText = items[winIndex];
          resultEl.textContent = `결과: ${winText}`;

          // 히스토리/통계 업데이트
          history.unshift(winText);
          stats[winText] = (stats[winText] ?? 0) + 1;
          renderHistory();
          renderStats();

          // 당첨 반짝
          slotRoot.classList.add("win");
          setTimeout(() => slotRoot.classList.remove("win"), 700);

          // 끊김 방지 리셋(보이는 항목 유지)
          const normalizedY = -winIndex * ROW_H;
          reelEl.style.transition = "none";
          reelEl.style.transform = `translateY(${normalizedY}px)`;

          isSpinning = false;
          spinBtn.disabled = false;
        },
        { once: true }
      );
    },
    { once: true }
  );
}

// ===== 레버 =====
function pullLever() {
  if (isSpinning) return;

  // 오디오 컨텍스트 깨우기(첫 사용자 제스처)
  try {
    leverSound();
  } catch (e) {}

  leverBtn.classList.add("pulled");

  setTimeout(() => {
    spin();
  }, 140);

  setTimeout(() => {
    leverBtn.classList.remove("pulled");
  }, 260);
}

// ===== 이벤트 =====
spinBtn.onclick = () => {
  // 클릭도 사용자 제스처라 오디오 OK
  try {
    tickSound();
  } catch (e) {}
  spin();
};
leverBtn.onclick = pullLever;

addBtn.onclick = addItems;
clearBtn.onclick = clearAllToDefault;

itemInput.addEventListener("keydown", (e) => {
  // textarea라 Enter는 줄바꿈이 기본. Ctrl+Enter로 추가
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    addItems();
  }
});
