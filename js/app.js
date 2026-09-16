/**
 * port80 scanner
 * Uses Cloudflare Worker for accurate HTTP status on port 80
 */

/* ---------- Config ---------- */
const TIMEOUT_MS = 8000;                 // allow time for worker + target
const TESTS_PER_IP = 3;                  // sample accuracy
const WORKER_URL = 'https://port80-probe.sivpub.workers.dev/';
const LIST_SRC =
  'https://raw.githubusercontent.com/Durgaa17/Raam-Public-Vless/refs/heads/main/scaniplist.txt';
const LIST_CACHE_KEY = 'telco-probe-ip-list-v1';

/* ---------- DOM refs ---------- */
const $ = (sel) => document.querySelector(sel);
const targetInput   = $('#target-input');
const btnScan       = $('#btn-scan');
const manualLog     = $('#manual-log');
const listStatus    = $('#list-status');
const btnUpdate     = $('#btn-update');
const btnTest       = $('#btn-test');
const sampleLog     = $('#sample-log');
const tabs          = document.querySelectorAll('.tab');
const panels        = {
  manual: $('#panel-manual'),
  sample: $('#panel-sample'),
};

/* ---------- State ---------- */
let ipList = [];
let scanning = false;
let testing  = false;

/* ================================================================
   WORKER PROBE
   Calls our Cloudflare Worker which does a real HTTP GET to host:80
   and returns the actual status line (same idea as original online mode).
   ================================================================ */
async function workerProbe(target) {
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `${WORKER_URL}?target=${encodeURIComponent(target)}`,
      { cache: 'no-store', signal: controller.signal }
    );
    clearTimeout(timer);
    const data = await res.json();
    const ms = data.ms ?? Math.round(performance.now() - start);

    if (data.reachable) {
      return {
        status: 'reachable',
        ms,
        line: data.line || `ALIVE - HTTP ${data.status} ${data.statusText || ''}`,
      };
    }
    return {
      status: data.error === 'timeout' ? 'timeout' : 'error',
      ms,
      line: data.error || 'No response',
    };
  } catch (err) {
    clearTimeout(timer);
    const ms = Math.round(performance.now() - start);
    return {
      status: controller.signal.aborted ? 'timeout' : 'error',
      ms,
      line: controller.signal.aborted ? 'Timeout' : 'Worker unreachable',
    };
  }
}

/* ---------- Helpers ---------- */
function isValidTarget(t) {
  if (!t || t.length > 255) return false;
  if (/[/\\?#@\s]/.test(t)) return false;
  return /^[a-zA-Z0-9.:_-]+$/.test(t);
}

function parseList(raw) {
  return [...new Set(
    raw.split(/\r?\n/)
       .map(l => l.trim())
       .filter(l => l && !l.startsWith('#'))
  )];
}

function setListStatus(state, text) {
  listStatus.className = 'status-dot ' + state;
  listStatus.querySelector('.label').textContent = text;
}

/* ================================================================
   SAMPLE LIST – fetch + localStorage cache
   ================================================================ */
async function fetchList() {
  setListStatus('loading', 'Loading list…');
  btnUpdate.disabled = true;
  btnTest.disabled = true;

  try {
    const res = await fetch(LIST_SRC, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const parsed = parseList(await res.text());
    ipList = parsed;
    try { localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(parsed)); } catch {}
    setListStatus('ready', `List loaded (${parsed.length})`);
    btnTest.disabled = parsed.length === 0;
  } catch {
    try {
      const cached = localStorage.getItem(LIST_CACHE_KEY);
      if (cached) {
        ipList = JSON.parse(cached);
        setListStatus('ready', `Cached list (${ipList.length})`);
        btnTest.disabled = ipList.length === 0;
      } else {
        setListStatus('error', 'List unavailable');
      }
    } catch {
      setListStatus('error', 'List unavailable');
    }
  } finally {
    btnUpdate.disabled = false;
  }
}

/* ================================================================
   MANUAL SCAN
   ================================================================ */
function renderManualResult(r) {
  if (manualLog.querySelector('.empty')) manualLog.innerHTML = '';

  const li = document.createElement('li');
  const ok = r.status === 'reachable';
  li.innerHTML = `
    <div class="row">
      <span class="target">${r.target}:80</span>
      <span class="meta">
        <span>${r.ms}ms</span>
        <span class="${ok ? 'ok' : 'fail'}">${ok ? 'REACHABLE' : 'NOT REACHABLE'}</span>
      </span>
    </div>
    ${r.line ? `<span class="detail">${r.line}</span>` : ''}
  `;
  manualLog.prepend(li);

  while (manualLog.children.length > 40) {
    manualLog.removeChild(manualLog.lastChild);
  }
}

async function runManualScan() {
  const target = targetInput.value.trim();
  if (!target || scanning || !isValidTarget(target)) return;

  scanning = true;
  btnScan.disabled = true;
  btnScan.textContent = 'Scanning…';

  try {
    const res = await workerProbe(target);
    renderManualResult({ target, ...res });
  } catch {
    renderManualResult({ target, status: 'error', ms: 0, line: 'Unexpected error' });
  } finally {
    scanning = false;
    btnScan.disabled = !targetInput.value.trim();
    btnScan.textContent = 'Scan';
  }
}

/* ================================================================
   SAMPLE TEST
   ================================================================ */
function renderSampleResult(r) {
  if (sampleLog.querySelector('.empty')) sampleLog.innerHTML = '';

  const li = document.createElement('li');
  const good = r.success > 0;
  li.innerHTML = `
    <div class="row">
      <span class="target">${r.target}:80</span>
      <span class="meta">
        <span>${good ? r.avgMs + 'ms' : '—'}</span>
        <span class="${good ? 'ok' : 'fail'}">${r.success}/${r.total}</span>
      </span>
    </div>
  `;
  sampleLog.appendChild(li);
}

async function runSampleTest() {
  if (testing || ipList.length === 0) return;

  testing = true;
  btnTest.disabled = true;
  btnUpdate.disabled = true;
  sampleLog.innerHTML = '<li class="empty">Testing…</li>';

  let done = 0;
  for (const target of ipList) {
    let success = 0;
    let msSum = 0;
    let msCount = 0;

    for (let i = 0; i < TESTS_PER_IP; i++) {
      try {
        const r = await workerProbe(target);
        if (r.status === 'reachable') {
          success++;
          msSum += r.ms;
          msCount++;
        }
      } catch {}
    }

    done++;
    btnTest.textContent = `Testing ${done}/${ipList.length}`;

    renderSampleResult({
      target,
      success,
      total: TESTS_PER_IP,
      avgMs: msCount ? Math.round(msSum / msCount) : 0,
    });
  }

  testing = false;
  btnTest.disabled = false;
  btnUpdate.disabled = false;
  btnTest.textContent = 'Sample Test';
}

/* ================================================================
   UI wiring
   ================================================================ */
function switchTab(name) {
  tabs.forEach(t => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });
  Object.entries(panels).forEach(([key, el]) => {
    const show = key === name;
    el.classList.toggle('active', show);
    el.hidden = !show;
  });
}

tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

targetInput.addEventListener('input', () => {
  btnScan.disabled = !targetInput.value.trim() || scanning;
});
targetInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) runManualScan();
});
btnScan.addEventListener('click', runManualScan);

btnUpdate.addEventListener('click', () => fetchList());
btnTest.addEventListener('click', runSampleTest);

/* ---------- Boot ---------- */
(function init() {
  try {
    const cached = localStorage.getItem(LIST_CACHE_KEY);
    if (cached) {
      ipList = JSON.parse(cached);
      setListStatus('ready', `Cached list (${ipList.length})`);
      btnTest.disabled = ipList.length === 0;
      btnUpdate.disabled = false;
      fetchList();
      return;
    }
  } catch {}
  fetchList();
})();
