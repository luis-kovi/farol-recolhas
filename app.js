// =====================
// CONFIGURAÇÕES GERAIS
// =====================
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxEFO0dh_zKxsq0xNOY4pJH85A4-OKxUewqhYPZldsjqbM2E5GIOjJ2wL5JdZcXD44/exec";
const PHASES = [
  'Fila de Recolha',
  'Aprovar Custo de Recolha',
  'Tentativa 1 de Recolha',
  'Tentativa 2 de Recolha',
  'Tentativa 3 de Recolha',
  'Nova tentativa de recolha',
  'Desbloquear Veículo',
  'Solicitar Guincho',
  'Confirmação de Entrega no Pátio'
];
const PHASE_DISPLAY = {
  'Fila de Recolha': 'Fila de Recolha',
  'Aprovar Custo de Recolha': 'Aprovar Custo',
  'Tentativa 1 de Recolha': 'Tentativa 1',
  'Tentativa 2 de Recolha': 'Tentativa 2',
  'Tentativa 3 de Recolha': 'Tentativa 3',
  'Nova tentativa de recolha': 'Nova Tentativa',
  'Desbloquear Veículo': 'Desbloquear Veículo',
  'Solicitar Guincho': 'Solicitar Guincho',
  'Confirmação de Entrega no Pátio': 'Confirmação de Recolha'
};
const DISABLED_PHASES = ['Aprovar Custo de Recolha', 'Desbloquear Veículo', 'Solicitar Guincho'];
const DISABLED_MSG = {
  'Aprovar Custo de Recolha': 'em análise da Kovi',
  'Desbloquear Veículo': 'em processo de desbloqueio',
  'Solicitar Guincho': 'em análise da Kovi'
};

// ===============
// UTILITÁRIOS
// ===============
function formatPersonName(name) {
  if (!name || name === 'N/A') return name;
  return name.toLowerCase().replace(/\b[\wÀ-ÿ]/g, l => l.toUpperCase());
}
function keepOriginalFormat(text) {
  return text || 'N/A';
}
function formatDate(dateString) {
  if (!dateString || dateString === 'N/A') return dateString;
  try {
    if (dateString.match(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)) return dateString;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch (e) { return dateString; }
}
function calcularSLA(dataCriacaoStr) {
  const tz = 'America/Sao_Paulo';
  let dataCriacao = new Date(dataCriacaoStr);
  if (isNaN(dataCriacao.getTime())) return 0;
  const agora = new Date(new Date().toLocaleString("en-US", {timeZone: tz}));
  dataCriacao.setHours(0,0,0,0);
  agora.setHours(0,0,0,0);
  let dias = 0;
  let temp = new Date(dataCriacao);
  while (temp < agora) {
    if (temp.getDay() !== 0) dias++;
    temp.setDate(temp.getDate() + 1);
  }
  return dias;
}
function showToast(msg, type = 'info') {
  Toastify({
    text: msg,
    duration: 3500,
    gravity: "top",
    position: "right",
    backgroundColor: type === 'error' ? "#FF355A" : (type === 'success' ? "#22c55e" : "#23232a"),
    className: "toastify",
    stopOnFocus: true
  }).showToast();
}
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copiado!', 'success'));
}
function exportToCSV(cards) {
  const header = ['Placa','Driver','Chofer','Fase','Data Criação','SLA','Origem'];
  const rows = cards.map(card => [card.placa, card.nomeDriver, card.chofer, card.faseAtual, formatDate(card.dataCriacao), card.sla, keepOriginalFormat(card.origemLocacao)]);
  let csv = header.join(',') + '\n' + rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'recolhas.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ===============
// LOGIN E PERMISSÃO
// ===============
const user = JSON.parse(localStorage.getItem('user'));
if (!user) window.location.href = 'login.html';

// ===============
// DARK MODE
// ===============
const darkModeToggle = document.getElementById('darkModeToggle');
if (localStorage.getItem('darkMode') === '1') document.documentElement.classList.add('dark');
darkModeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('darkMode', document.documentElement.classList.contains('dark') ? '1' : '0');
});

// ===============
// TABS
// ===============
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = {
  kanban: document.getElementById('kanban-view'),
  list: document.getElementById('list-view'),
  dashboard: document.getElementById('dashboard-view')
};
tabBtns.forEach(btn => btn.addEventListener('click', () => {
  tabBtns.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  Object.values(tabContents).forEach(tc => tc.classList.add('hidden'));
  tabContents[btn.dataset.tab].classList.remove('hidden');
  if (btn.dataset.tab === 'dashboard') renderDashboard();
}));

// ===============
// USER INFO
// ===============
function updateUserInfo() {
  document.getElementById('user-name').textContent = user.displayName;
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('user-avatar-img').src = user.photoURL;
}
updateUserInfo();

document.getElementById('logout-btn').onclick = () => {
  localStorage.removeItem('user');
  window.location.href = 'login.html';
};

// ===============
// DADOS E ATUALIZAÇÃO
// ===============
let cardsData = [];
let lastUpdate = null;
function fetchData() {
  const url = `${SCRIPT_URL}?email=${encodeURIComponent(user.email)}&t=${Date.now()}`;
  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (data.error) throw new Error(data.error);
      cardsData = data.cards.map(card => ({...card, sla: calcularSLA(card.dataCriacao)}));
      lastUpdate = new Date();
      renderAll();
      checkCalculatorPermission(data);
      document.getElementById('status-indicator').innerHTML = `<span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span> Atualizado agora`;
    })
    .catch(err => {
      showToast('Erro ao carregar dados: ' + err.message, 'error');
      document.getElementById('status-indicator').innerHTML = `<span class="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span> Erro na atualização`;
    });
}
setInterval(fetchData, 15000);
fetchData();

// ===============
// RENDERIZAÇÃO PRINCIPAL
// ===============
function renderAll() {
  renderKanban(cardsData);
  renderList(cardsData);
  // Dashboard só renderiza ao abrir a aba
}

// ===============
// KANBAN
// ===============
function renderKanban(cards) {
  const container = tabContents.kanban;
  container.innerHTML = '';
  const phases = {};
  PHASES.forEach(phase => phases[phase] = []);
  cards.forEach(card => { if (phases[card.faseAtual]) phases[card.faseAtual].push(card); });
  const kanbanRow = document.createElement('div');
  kanbanRow.className = 'flex gap-4 w-full';
  PHASES.forEach(phase => {
    const cardsInPhase = phases[phase];
    const lateOrAlertCount = cardsInPhase.filter(c => c.sla >= 2).length;
    const isDisabled = DISABLED_PHASES.includes(phase);
    const col = document.createElement('div');
    col.className = 'w-64 bg-gray-100 dark:bg-gray-800 rounded-lg flex flex-col flex-shrink-0';
    col.innerHTML = `
      <div class="p-2 flex items-center bg-white dark:bg-gray-900 rounded-t-lg border-t-3 ${isDisabled ? 'border-gray-400' : 'border-primary'}">
        <h2 class="text-sm font-semibold ${isDisabled ? 'text-gray-400' : 'text-primary'}">${PHASE_DISPLAY[phase]}</h2>
        <span class="text-xs font-semibold text-gray-500 bg-gray-200 rounded-md px-1.5 py-0.5 ml-2 card-count">${cardsInPhase.length}</span>
        ${!isDisabled && lateOrAlertCount > 0 ? `<span class="ml-auto flex items-center text-amber-600 font-semibold text-xs"><svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' class='mr-1'><circle cx='12' cy='12' r='10'/><path d='M12 6v6l4 2'/></svg>${lateOrAlertCount}</span>` : ''}
      </div>
      <div class="flex-1 p-2 space-y-2 overflow-y-auto scrollbar-thin">
        ${cardsInPhase.length > 0 ? cardsInPhase.map(card => kanbanCardHTML(card)).join('') : `<div class='flex flex-col items-center justify-center h-full text-center text-gray-500 p-4'><p class='text-sm font-medium'>Não há recolha nesta fase.</p></div>`}
      </div>
    `;
    kanbanRow.appendChild(col);
  });
  container.appendChild(kanbanRow);
  // Tooltips
  tippy('.kanban-card .quick-action', { theme: 'kovi', animation: 'scale', delay: [200, 0] });
}
function kanbanCardHTML(card) {
  const isDisabled = DISABLED_PHASES.includes(card.faseAtual);
  if (isDisabled) {
    const message = DISABLED_MSG[card.faseAtual];
    return `
      <div class="kanban-card bg-gray-200 dark:bg-gray-700 rounded-md shadow-sm border border-gray-300 flex flex-col h-48 opacity-70 cursor-not-allowed">
        <div class="p-2 flex justify-between items-center">
          <h3 class="font-bold text-gray-500 card-placa truncate text-sm">${card.placa}</h3>
          <span class="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-gray-300 text-gray-500">Processando</span>
        </div>
        <div class="px-2 space-y-1 text-xs flex-1">
          <div class="text-gray-400"><div class="font-bold text-gray-500" style="font-size: 10px;">🚗 MODELO</div><div class="truncate">${formatPersonName(card.modeloVeiculo)}</div></div>
          <div class="text-gray-400 card-driver"><div class="font-bold text-gray-500" style="font-size: 10px;">👤 DRIVER</div><div class="truncate">${formatPersonName(card.nomeDriver)}</div></div>
          <div class="text-gray-400 card-chofer"><div class="font-bold text-gray-500" style="font-size: 10px;">🚛 CHOFER</div><div class="truncate">${formatPersonName(card.chofer)}</div></div>
        </div>
        <div class="p-2 flex items-center justify-center border-t border-gray-300">
          <div class="flex items-center text-xs text-gray-500 font-medium">
            <svg class="animate-spin mr-1 h-3 w-3 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <span class="text-center text-xs">${message}</span>
          </div>
        </div>
      </div>`;
  }
  let slaColor = '', slaText = '';
  if (card.sla >= 3) { slaColor = 'bg-red-100 text-red-700 blink'; slaText = 'Atrasado'; }
  else if (card.sla == 2) { slaColor = 'bg-yellow-100 text-yellow-700'; slaText = 'Em Alerta'; }
  else { slaColor = 'bg-green-100 text-green-700'; slaText = 'No Prazo'; }
  return `
    <div class="kanban-card data-item bg-white dark:bg-gray-900 rounded-md shadow-sm border border-gray-200 flex flex-col h-48 cursor-pointer hover:border-primary transition-all" data-placa="${card.placa}" data-driver="${formatPersonName(card.nomeDriver)}" data-chofer="${formatPersonName(card.chofer)}" data-origem="${keepOriginalFormat(card.origemLocacao)}" data-fase="${card.faseAtual}" data-criacao="${formatDate(card.dataCriacao)}" data-sla-dias="${card.sla}" data-mapa-url="${card.enderecoRecolhaUrl}" data-form-url="${card.urlPublica}" data-sla-text="${slaText}" data-valor-recolha="${card.valorRecolha}" data-custo-km="${card.custoKmAdicional}" data-modelo-veiculo="${formatPersonName(card.modeloVeiculo)}" data-telefone-contato="${card.telefoneContato}" data-telefone-opcional="${card.telefoneOpcional}" data-endereco-cadastro="${card.enderecoCadastro}" data-endereco-veiculo="${card.enderecoVeiculo}">
      <div class="p-2 flex justify-between items-center">
        <h3 class="font-bold text-gray-800 card-placa truncate text-sm">${card.placa}</h3>
        <span class="text-xs font-semibold px-1.5 py-0.5 rounded-full ${slaColor}">${slaText}</span>
      </div>
      <div class="px-2 space-y-1 text-xs flex-1">
        <div class="text-gray-500"><div class="font-bold text-gray-600" style="font-size: 10px;">🚗 MODELO</div><div class="truncate">${formatPersonName(card.modeloVeiculo)}</div></div>
        <div class="text-gray-500 card-driver"><div class="font-bold text-gray-600" style="font-size: 10px;">👤 DRIVER</div><div class="truncate">${formatPersonName(card.nomeDriver)}</div></div>
        <div class="text-gray-500 card-chofer"><div class="font-bold text-gray-600" style="font-size: 10px;">🚛 CHOFER</div><div class="truncate">${card.faseAtual !== 'Fila de Recolha' ? formatPersonName(card.chofer) : '-'}</div></div>
      </div>
      <div class="p-2 flex items-center justify-between border-t border-gray-100 dark:border-gray-800">
        <div class="flex items-center text-xs text-red-600 font-semibold">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          SLA: ${card.sla}d
        </div>
        <span class="text-xs text-gray-500 font-medium flex items-center gap-1">${keepOriginalFormat(card.origemLocacao)}</span>
        <div class="flex gap-2 ml-2">
          <button class="quick-action" data-tippy-content="Copiar Placa" onclick="copyToClipboard('${card.placa}')"><svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><rect x='9' y='9' width='13' height='13' rx='2' stroke-width='2'/><rect x='3' y='3' width='13' height='13' rx='2' stroke-width='2'/></svg></button>
          ${card.enderecoRecolhaUrl ? `<a class="quick-action" data-tippy-content="Abrir no Google Maps" href="${card.enderecoRecolhaUrl}" target="_blank"><svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path d='M21 10.5V21a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 21V3A1.5 1.5 0 014.5 1.5h10.5'/><path d='M16.5 3H21v4.5'/><path d='M21 3L10 14'/></svg></a>` : ''}
        </div>
      </div>
    </div>`;
}

// ===============
// LISTA
// ===============
function renderList(cards) {
  const container = tabContents.list;
  container.innerHTML = '';
  const table = document.createElement('table');
  table.className = 'w-full text-sm text-left text-gray-500 dark:text-gray-200';
  table.innerHTML = `
    <thead class="text-xs uppercase bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
      <tr>
        <th class="px-6 py-3">Placa</th>
        <th class="px-6 py-3">Driver</th>
        <th class="px-6 py-3">Chofer</th>
        <th class="px-6 py-3">Fase Atual</th>
        <th class="px-6 py-3">Data Criação</th>
        <th class="px-6 py-3 text-center">SLA (dias)</th>
        <th class="px-6 py-3 text-center">Origem</th>
        <th class="px-6 py-3 text-center">Ações</th>
      </tr>
    </thead>
    <tbody id="list-container" class="bg-white dark:bg-gray-900">
      ${cards.map(card => listRowHTML(card)).join('')}
    </tbody>
  `;
  container.appendChild(table);
  // Exportação
  const exportBtn = document.createElement('button');
  exportBtn.className = 'export-btn px-4 py-2 rounded-md mt-4';
  exportBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 16v-8m0 8l-4-4m4 4l4-4"/><rect x="4" y="4" width="16" height="16" rx="2"/></svg>Exportar CSV';
  exportBtn.onclick = () => exportToCSV(cards);
  container.appendChild(exportBtn);
  tippy('.quick-action', { theme: 'kovi', animation: 'scale', delay: [200, 0] });
}
function listRowHTML(card) {
  let slaText = '', slaBg = '';
  if (card.sla >= 3) { slaBg = 'bg-red-100 blink'; slaText = 'Atrasado'; }
  else if (card.sla == 2) { slaBg = 'bg-yellow-100'; slaText = 'Em Alerta'; }
  else { slaBg = 'bg-green-100'; slaText = 'No Prazo'; }
  return `
    <tr class="table-list-item data-item border-b hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer ${slaBg}" data-placa="${card.placa}" data-driver="${formatPersonName(card.nomeDriver)}" data-chofer="${formatPersonName(card.chofer)}" data-origem="${keepOriginalFormat(card.origemLocacao)}" data-fase="${card.faseAtual}" data-criacao="${formatDate(card.dataCriacao)}" data-sla-dias="${card.sla}" data-mapa-url="${card.enderecoRecolhaUrl}" data-form-url="${card.urlPublica}" data-sla-text="${slaText}" data-valor-recolha="${card.valorRecolha}" data-custo-km="${card.custoKmAdicional}" data-modelo-veiculo="${formatPersonName(card.modeloVeiculo)}" data-telefone-contato="${card.telefoneContato}" data-telefone-opcional="${card.telefoneOpcional}" data-endereco-cadastro="${card.enderecoCadastro}" data-endereco-veiculo="${card.enderecoVeiculo}">
      <td class="px-6 py-2 font-bold text-gray-900 dark:text-gray-100 card-placa">${card.placa}</td>
      <td class="px-6 py-2 card-driver">${formatPersonName(card.nomeDriver)}</td>
      <td class="px-6 py-2 card-chofer">${formatPersonName(card.chofer)}</td>
      <td class="px-6 py-2">${PHASE_DISPLAY[card.faseAtual] || card.faseAtual}</td>
      <td class="px-6 py-2">${formatDate(card.dataCriacao)}</td>
      <td class="px-6 py-2 text-center font-bold text-lg">${card.sla}</td>
      <td class="px-6 py-2 text-center">${keepOriginalFormat(card.origemLocacao)}</td>
      <td class="px-6 py-2 text-center">
        <button class="quick-action" data-tippy-content="Copiar Placa" onclick="copyToClipboard('${card.placa}')"><svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><rect x='9' y='9' width='13' height='13' rx='2' stroke-width='2'/><rect x='3' y='3' width='13' height='13' rx='2' stroke-width='2'/></svg></button>
        ${card.enderecoRecolhaUrl ? `<a class="quick-action" data-tippy-content="Abrir no Google Maps" href="${card.enderecoRecolhaUrl}" target="_blank"><svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path d='M21 10.5V21a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 21V3A1.5 1.5 0 014.5 1.5h10.5'/><path d='M16.5 3H21v4.5'/><path d='M21 3L10 14'/></svg></a>` : ''}
      </td>
    </tr>`;
}

// ===============
// DASHBOARD (Visão Geral)
// ===============
function renderDashboard() {
  const container = tabContents.dashboard;
  container.innerHTML = '<div class="flex flex-wrap gap-6 mb-8" id="dashboard-metrics"></div><div class="grid grid-cols-1 md:grid-cols-2 gap-8" id="dashboard-charts"></div>';
  // Métricas rápidas
  const total = cardsData.length;
  const atrasados = cardsData.filter(c => c.sla >= 3).length;
  const alerta = cardsData.filter(c => c.sla == 2).length;
  const noPrazo = cardsData.filter(c => c.sla < 2).length;
  document.getElementById('dashboard-metrics').innerHTML = `
    <div class="bg-white dark:bg-gray-900 rounded-lg shadow p-6 flex-1 min-w-[220px] flex flex-col items-center"><span class="text-3xl font-bold text-primary">${total}</span><span class="text-gray-500 mt-2">Total de Recolhas</span></div>
    <div class="bg-green-50 dark:bg-green-900 rounded-lg shadow p-6 flex-1 min-w-[220px] flex flex-col items-center"><span class="text-3xl font-bold text-green-600">${noPrazo}</span><span class="text-gray-500 mt-2">No Prazo</span></div>
    <div class="bg-yellow-50 dark:bg-yellow-900 rounded-lg shadow p-6 flex-1 min-w-[220px] flex flex-col items-center"><span class="text-3xl font-bold text-yellow-600">${alerta}</span><span class="text-gray-500 mt-2">Em Alerta</span></div>
    <div class="bg-red-50 dark:bg-red-900 rounded-lg shadow p-6 flex-1 min-w-[220px] flex flex-col items-center"><span class="text-3xl font-bold text-red-600">${atrasados}</span><span class="text-gray-500 mt-2">Atrasados</span></div>
  `;
  // Gráficos
  setTimeout(() => {
    renderChartSLA();
    renderChartFases();
  }, 100);
}
function renderChartSLA() {
  const el = document.createElement('canvas');
  el.id = 'chart-sla';
  document.getElementById('dashboard-charts').appendChild(el);
  const data = [
    cardsData.filter(c => c.sla < 2).length,
    cardsData.filter(c => c.sla == 2).length,
    cardsData.filter(c => c.sla >= 3).length
  ];
  new Chart(el, {
    type: 'doughnut',
    data: {
      labels: ['No Prazo', 'Em Alerta', 'Atrasado'],
      datasets: [{
        data,
        backgroundColor: ['#22c55e', '#facc15', '#FF355A'],
      }]
    },
    options: {
      plugins: { legend: { display: true, position: 'bottom' } },
      cutout: '70%',
      responsive: true
    }
  });
}
function renderChartFases() {
  const el = document.createElement('canvas');
  el.id = 'chart-fases';
  document.getElementById('dashboard-charts').appendChild(el);
  const data = PHASES.map(phase => cardsData.filter(c => c.faseAtual === phase).length);
  new Chart(el, {
    type: 'bar',
    data: {
      labels: PHASES.map(p => PHASE_DISPLAY[p]),
      datasets: [{
        label: 'Cards por Fase',
        data,
        backgroundColor: '#FF355A',
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      responsive: true,
      scales: { x: { ticks: { color: '#FF355A' } }, y: { beginAtZero: true } }
    }
  });
}

// ===============
// MODAL DE DETALHES
// ===============
const cardModal = document.getElementById('cardModal');
const closeCardModalBtn = document.getElementById('closeCardModal');
let currentModalData = null;
function openCardModal(data) {
  currentModalData = data;
  document.getElementById('modalPlaca').textContent = data.placa;
  renderModalTab('detalhes');
  cardModal.classList.remove('hidden');
  setTimeout(() => cardModal.querySelector('.modal-panel').classList.remove('opacity-0', 'scale-95'), 10);
}
function closeCardModal() {
  const panel = cardModal.querySelector('.modal-panel');
  panel.classList.add('opacity-0', 'scale-95');
  setTimeout(() => {
    cardModal.classList.add('hidden');
  }, 200);
}
closeCardModalBtn.addEventListener('click', closeCardModal);
cardModal.addEventListener('click', e => { if (e.target === cardModal) closeCardModal(); });
// Modal tabs
const modalTabs = document.getElementById('modal-tabs');
modalTabs.addEventListener('click', e => {
  if (e.target.classList.contains('tab-btn')) {
    Array.from(modalTabs.children).forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    renderModalTab(e.target.dataset.tab);
  }
});
function renderModalTab(tab) {
  document.getElementById('modal-content-detalhes').classList.add('hidden');
  document.getElementById('modal-content-historico').classList.add('hidden');
  document.getElementById('modal-content-acoes').classList.add('hidden');
  if (tab === 'detalhes') {
    document.getElementById('modal-content-detalhes').classList.remove('hidden');
    document.getElementById('modal-content-detalhes').innerHTML = modalDetalhesHTML(currentModalData);
  } else if (tab === 'historico') {
    document.getElementById('modal-content-historico').classList.remove('hidden');
    document.getElementById('modal-content-historico').innerHTML = '<div class="text-gray-500">(Histórico detalhado pode ser implementado aqui)</div>';
  } else if (tab === 'acoes') {
    document.getElementById('modal-content-acoes').classList.remove('hidden');
    document.getElementById('modal-content-acoes').innerHTML = modalAcoesHTML(currentModalData);
  }
}
function modalDetalhesHTML(data) {
  return `
    <div class="space-y-4">
      <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
        <div class="grid grid-cols-2 gap-4">
          <div class="text-center">
            <div class="flex items-center justify-center mb-1"><span class="text-red-600 mr-2">⏰</span><p class="text-sm font-semibold text-gray-700 dark:text-gray-200">SLA</p></div>
            <p class="text-xl font-bold text-red-600">${data.slaDias || data.sla} dias</p>
          </div>
          <div class="text-center">
            <div class="flex items-center justify-center mb-1"><span class="text-primary mr-2">📋</span><p class="text-sm font-semibold text-gray-700 dark:text-gray-200">Fase Atual</p></div>
            <p class="font-bold text-primary">${PHASE_DISPLAY[data.fase] || data.fase}</p>
          </div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-900 border rounded-lg p-3">
        <h3 class="text-base font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center"><span class="mr-2">🚗</span>Informações do Veículo</h3>
        <div class="grid grid-cols-1 gap-2">
          <div class="flex items-start"><span class="text-gray-600 mr-3 mt-1">🏷️</span><div><p class="text-sm text-gray-500">Modelo do Veículo</p><p class="font-semibold text-gray-800 dark:text-gray-100">${formatPersonName(data.modeloVeiculo)}</p></div></div>
          <div class="flex items-start"><span class="text-gray-600 mr-3 mt-1">🏢</span><div><p class="text-sm text-gray-500">Origem da Locação</p><p class="font-semibold text-gray-800 dark:text-gray-100">${keepOriginalFormat(data.origem)}</p></div></div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-900 border rounded-lg p-3">
        <h3 class="text-base font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center"><span class="mr-2">👥</span>Pessoas Envolvidas</h3>
        <div class="grid grid-cols-1 gap-2">
          <div class="flex items-start"><span class="text-gray-600 mr-3 mt-1">👤</span><div><p class="text-sm text-gray-500">Driver</p><p class="font-semibold text-gray-800 dark:text-gray-100">${formatPersonName(data.driver)}</p></div></div>
          <div class="flex items-start"><span class="text-gray-600 mr-3 mt-1">🚛</span><div><p class="text-sm text-gray-500">Chofer</p><p class="font-semibold text-gray-800 dark:text-gray-100">${formatPersonName(data.chofer)}</p></div></div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-900 border rounded-lg p-3">
        <h3 class="text-base font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center"><span class="mr-2">📞</span>Contatos</h3>
        <div class="grid grid-cols-1 gap-2">
          <div class="flex items-start"><span class="text-gray-600 mr-3 mt-1">📱</span><div><p class="text-sm text-gray-500">Telefone de Contato</p><p class="font-semibold text-gray-800 dark:text-gray-100">${data.telefoneContato}</p></div></div>
          <div class="flex items-start"><span class="text-gray-600 mr-3 mt-1">📞</span><div><p class="text-sm text-gray-500">Telefone Opcional</p><p class="font-semibold text-gray-800 dark:text-gray-100">${data.telefoneOpcional}</p></div></div>
        </div>
      </div>
      <div class="bg-white dark:bg-gray-900 border rounded-lg p-3">
        <h3 class="text-base font-bold text-gray-800 dark:text-gray-100 mb-3 flex items-center"><span class="mr-2">📍</span>Endereços</h3>
        <div class="grid grid-cols-1 gap-2">
          <div class="flex items-start"><span class="text-gray-600 mr-3 mt-1">🏠</span><div><p class="text-sm text-gray-500">Endereço de Cadastro</p><p class="font-semibold text-gray-800 dark:text-gray-100">${data.enderecoCadastro}</p></div></div>
          <div class="flex items-start"><span class="text-gray-600 mr-3 mt-1">📍</span><div class="flex-1"><p class="text-sm text-gray-500">Endereço Onde o Veículo Está</p><p class="font-semibold text-gray-800 dark:text-gray-100 mb-2">${data.enderecoVeiculo}</p>${data.mapaUrl && data.mapaUrl !== 'null' ? `<a href="${data.mapaUrl}" target="_blank" class="inline-flex items-center px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-md transition-colors"><svg class="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>Google Maps</a>` : ''}</div></div>
        </div>
      </div>
      <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
        <div class="flex items-center"><span class="text-gray-600 mr-3">📅</span><div><p class="text-sm text-gray-500">Data de Criação</p><p class="font-semibold text-gray-800 dark:text-gray-100">${data.criacao}</p></div></div>
      </div>
    </div>
  `;
}
function modalAcoesHTML(data) {
  return `<div class="flex flex-col gap-4"><button class="btn-primary px-4 py-2 rounded-md" onclick="copyToClipboard('${data.placa}')">Copiar Placa</button>${data.enderecoRecolhaUrl ? `<a class="btn-primary px-4 py-2 rounded-md" href="${data.enderecoRecolhaUrl}" target="_blank">Abrir no Google Maps</a>` : ''}</div>`;
}

// ===============
// EVENTOS DE CARDS E BUSCA GLOBAL
// ===============
// Cards (Kanban e Lista)
document.body.addEventListener('click', function(event) {
  const card = event.target.closest('.data-item');
  if (card && !card.classList.contains('cursor-not-allowed')) {
    openCardModal(card.dataset);
  }
});
// Busca global (Ctrl+K)
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
  }
});
// Busca instantânea
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', function() {
  const term = this.value.toLowerCase();
  document.querySelectorAll('.data-item').forEach(item => {
    const placa = item.dataset.placa.toLowerCase();
    const driver = item.dataset.driver.toLowerCase();
    const chofer = item.dataset.chofer.toLowerCase();
    const origem = (item.dataset.origem || '').toLowerCase();
    const match = placa.includes(term) || driver.includes(term) || chofer.includes(term) || origem.includes(term);
    item.style.display = match ? '' : 'none';
  });
});

// ===============
// PERMISSÃO CALCULADORA (mantém lógica original)
// ===============
function checkCalculatorPermission(responseData) {
  // ... manter lógica de permissão original ...
}