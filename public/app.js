/**
 * LeadHunter SP - Frontend Application Logic
 */

let state = {
  config: null,
  nichos: [],
  cidades: [],
  selectedNichos: new Set(),
  selectedCidades: new Set(),
  leads: [],
  currentMode: 'free', // 'free' ou 'google'
  currentView: 'table', // 'table' ou 'kanban'
  googleKey: localStorage.getItem('leadHunter_googleKey') || '',
  currentLeadForPitch: null,
  currentPitchType: 'consultivo'
};

// ==========================================
// Inicialização
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await carregarConfig();
  await carregarLeads();
});

function setupEventListeners() {
  // Engine Toggles
  document.getElementById('btnEngineFree').addEventListener('click', () => setEngine('free'));
  document.getElementById('btnEngineGoogle').addEventListener('click', () => setEngine('google'));

  // Preset Buttons Cidades
  document.querySelectorAll('.preset-pill[data-preset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.preset-pill[data-preset]').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      aplicarPresetCidade(e.target.dataset.preset);
    });
  });

  // Botões de Nichos
  document.getElementById('btnTodosNichos').addEventListener('click', () => {
    state.nichos.forEach(n => state.selectedNichos.add(n.busca));
    renderNichoChips();
    atualizarContadoresSelecao();
  });

  document.getElementById('btnNichosSaude').addEventListener('click', () => {
    state.selectedNichos.clear();
    state.nichos
      .filter(n => n.categoria.includes('Saúde') || n.categoria.includes('Mental') || n.categoria.includes('Reabilitação'))
      .forEach(n => state.selectedNichos.add(n.busca));
    renderNichoChips();
    atualizarContadoresSelecao();
  });

  document.getElementById('btnNichosPro').addEventListener('click', () => {
    state.selectedNichos.clear();
    state.nichos
      .filter(n => n.categoria.includes('Jurídico') || n.categoria.includes('Financeiro') || n.categoria.includes('Construção'))
      .forEach(n => state.selectedNichos.add(n.busca));
    renderNichoChips();
    atualizarContadoresSelecao();
  });

  document.getElementById('btnLimparNichos').addEventListener('click', () => {
    state.selectedNichos.clear();
    renderNichoChips();
    atualizarContadoresSelecao();
  });

  // Busca
  document.getElementById('btnDispararBusca').addEventListener('click', executarBusca);

  // View Switcher (Tabela vs Kanban)
  document.getElementById('tabTableView').addEventListener('click', () => setView('table'));
  document.getElementById('tabKanbanView').addEventListener('click', () => setView('kanban'));

  // Filtros
  document.getElementById('filterText').addEventListener('input', renderLeads);
  document.getElementById('filterSituacao').addEventListener('change', renderLeads);
  document.getElementById('filterStatus').addEventListener('change', renderLeads);

  // Exportar CSV
  document.getElementById('btnExportCsv').addEventListener('click', () => {
    window.location.href = '/api/export-csv';
  });

  // Modal Google API Key
  document.getElementById('btnOpenConfig').addEventListener('click', () => {
    document.getElementById('inputGoogleKey').value = state.googleKey;
    document.getElementById('configModal').classList.remove('hidden');
  });

  document.getElementById('btnCloseConfigModal').addEventListener('click', () => {
    document.getElementById('configModal').classList.add('hidden');
  });

  document.getElementById('btnSalvarKeyLocal').addEventListener('click', () => {
    const val = document.getElementById('inputGoogleKey').value.trim();
    state.googleKey = val;
    localStorage.setItem('leadHunter_googleKey', val);
    document.getElementById('configModal').classList.add('hidden');
    if (val) {
      setEngine('google');
      alert('Chave Google Places salva com sucesso!');
    }
  });

  // Modal Pitch
  document.getElementById('btnCloseModal').addEventListener('click', () => {
    document.getElementById('pitchModal').classList.add('hidden');
  });

  document.querySelectorAll('.pitch-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.pitch-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      state.currentPitchType = e.target.dataset.pitchType;
      atualizarTextoPitchModal();
    });
  });

  document.getElementById('btnCopiarPitch').addEventListener('click', () => {
    const txt = document.getElementById('pitchTextArea').value;
    navigator.clipboard.writeText(txt).then(() => {
      const orig = document.getElementById('btnCopiarPitch').innerHTML;
      document.getElementById('btnCopiarPitch').innerHTML = '✓ Copiado com Sucesso!';
      setTimeout(() => {
        document.getElementById('btnCopiarPitch').innerHTML = orig;
      }, 2000);
    });
  });
}

// ==========================================
// Carregamento de Dados da API
// ==========================================
async function carregarConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    state.config = data;
    state.nichos = data.nichos || [];
    state.cidades = data.cidades?.top_cidades_estrategicas || [];

    // Se o backend já tiver uma chave Google ou se tivermos localmente
    if (data.temGoogleKey && !state.googleKey) {
      state.googleKey = 'CONFIGURADA_NO_SERVIDOR';
    }

    // Inicializar Seleção: Top 10 cidades e Todos os 17 Nichos
    aplicarPresetCidade('top10');
    state.nichos.forEach(n => state.selectedNichos.add(n.busca));

    renderCidadesChips();
    renderNichoChips();
    atualizarContadoresSelecao();
  } catch (e) {
    console.error('Erro ao carregar configurações:', e);
  }
}

async function carregarLeads() {
  try {
    const res = await fetch('/api/leads');
    state.leads = await res.json();
    renderLeads();
    atualizarMetricas();
  } catch (e) {
    console.error('Erro ao carregar leads:', e);
  }
}

// ==========================================
// Alternar Mecanismo e Visões
// ==========================================
function setEngine(engine) {
  state.currentMode = engine;
  const btnFree = document.getElementById('btnEngineFree');
  const btnGoogle = document.getElementById('btnEngineGoogle');
  const badge = document.getElementById('badgeEngine');

  if (engine === 'free') {
    btnFree.classList.add('active');
    btnGoogle.classList.remove('active');
    badge.textContent = 'Modo Gratuito';
    badge.className = 'badge badge-info';
  } else {
    btnGoogle.classList.add('active');
    btnFree.classList.remove('active');
    badge.textContent = 'Google Places API';
    badge.className = 'badge badge-purple';

    if (!state.googleKey) {
      document.getElementById('configModal').classList.remove('hidden');
    }
  }
}

function setView(view) {
  state.currentView = view;
  const tabTable = document.getElementById('tabTableView');
  const tabKanban = document.getElementById('tabKanbanView');
  const containerTable = document.getElementById('containerTableView');
  const containerKanban = document.getElementById('containerKanbanView');

  if (view === 'table') {
    tabTable.classList.add('active');
    tabKanban.classList.remove('active');
    containerTable.classList.remove('hidden');
    containerKanban.classList.add('hidden');
  } else {
    tabKanban.classList.add('active');
    tabTable.classList.remove('active');
    containerKanban.classList.remove('hidden');
    containerTable.classList.add('hidden');
    renderKanban();
  }
}

// ==========================================
// Presets de Cidades
// ==========================================
function aplicarPresetCidade(preset) {
  state.selectedCidades.clear();

  if (preset === 'top10') {
    state.cidades.slice(0, 10).forEach(c => state.selectedCidades.add(c.cidade));
  } else if (preset === 'grande_sp') {
    state.cidades
      .filter(c => c.regiao && c.regiao.includes('Metropolitana'))
      .forEach(c => state.selectedCidades.add(c.cidade));
  } else if (preset === 'campinas') {
    state.cidades
      .filter(c => c.regiao && c.regiao.includes('Campinas'))
      .forEach(c => state.selectedCidades.add(c.cidade));
  } else if (preset === 'litoral') {
    state.cidades
      .filter(c => c.regiao && c.regiao.includes('Baixada'))
      .forEach(c => state.selectedCidades.add(c.cidade));
  } else if (preset === 'interior') {
    state.cidades
      .filter(c => c.regiao && (c.regiao.includes('Ribeirão') || c.regiao.includes('Sorocaba') || c.regiao.includes('Central')))
      .forEach(c => state.selectedCidades.add(c.cidade));
  }

  renderCidadesChips();
  atualizarContadoresSelecao();
}

// ==========================================
// Renderização dos Chips
// ==========================================
function renderCidadesChips() {
  const container = document.getElementById('cidadesChips');
  container.innerHTML = '';

  state.cidades.forEach(c => {
    const chip = document.createElement('div');
    const isSelected = state.selectedCidades.has(c.cidade);
    chip.className = `chip ${isSelected ? 'selected' : ''}`;
    chip.textContent = c.cidade;
    chip.addEventListener('click', () => {
      if (state.selectedCidades.has(c.cidade)) {
        state.selectedCidades.delete(c.cidade);
      } else {
        state.selectedCidades.add(c.cidade);
      }
      chip.classList.toggle('selected');
      atualizarContadoresSelecao();
    });
    container.appendChild(chip);
  });
}

function renderNichoChips() {
  const container = document.getElementById('nichosChips');
  container.innerHTML = '';

  state.nichos.forEach(n => {
    const chip = document.createElement('div');
    const isSelected = state.selectedNichos.has(n.busca);
    chip.className = `chip ${isSelected ? 'selected' : ''}`;
    chip.innerHTML = `<span>${n.nome}</span>`;
    chip.addEventListener('click', () => {
      if (state.selectedNichos.has(n.busca)) {
        state.selectedNichos.delete(n.busca);
      } else {
        state.selectedNichos.add(n.busca);
      }
      chip.classList.toggle('selected');
      atualizarContadoresSelecao();
    });
    container.appendChild(chip);
  });
}

function atualizarContadoresSelecao() {
  document.getElementById('countCidades').textContent = `${state.selectedCidades.size} selecionadas`;
  document.getElementById('countNichos').textContent = `${state.selectedNichos.size} selecionados`;
}

// ==========================================
// Execução da Busca
// ==========================================
async function executarBusca() {
  if (state.selectedCidades.size === 0) {
    alert('Por favor, selecione ao menos 1 cidade de São Paulo.');
    return;
  }
  if (state.selectedNichos.size === 0) {
    alert('Por favor, selecione ao menos 1 nicho para prospectar.');
    return;
  }

  const btnBusca = document.getElementById('btnDispararBusca');
  const progressBox = document.getElementById('progressBox');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressStatus = document.getElementById('progressStatus');
  const progressPercent = document.getElementById('progressPercent');

  btnBusca.disabled = true;
  btnBusca.innerHTML = `<span class="spinner">⏳</span> Buscando empresas...`;
  progressBox.classList.remove('hidden');
  progressBarFill.style.width = '20%';
  progressStatus.textContent = `Consultando base ${state.currentMode === 'google' ? 'Google Places' : 'OpenStreetMap'}...`;
  progressPercent.textContent = '20%';

  try {
    const payload = {
      modo: state.currentMode,
      nichos: Array.from(state.selectedNichos),
      cidades: Array.from(state.selectedCidades),
      googleKey: state.googleKey !== 'CONFIGURADA_NO_SERVIDOR' ? state.googleKey : undefined
    };

    progressBarFill.style.width = '65%';
    progressPercent.textContent = '65%';

    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erro na requisição');
    }

    progressBarFill.style.width = '100%';
    progressPercent.textContent = '100%';
    progressStatus.textContent = `Busca finalizada! +${data.novos_encontrados} novos leads encontrados.`;

    state.leads = data.todos_leads;
    renderLeads();
    atualizarMetricas();

    setTimeout(() => {
      progressBox.classList.add('hidden');
    }, 4000);

  } catch (err) {
    alert(`Atenção: ${err.message}`);
    progressBox.classList.add('hidden');
  } finally {
    btnBusca.disabled = false;
    btnBusca.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      Buscar Empresas Sem Site
    `;
  }
}

// ==========================================
// Renderização da Tabela de Leads
// ==========================================
function getFilteredLeads() {
  const query = (document.getElementById('filterText').value || '').toLowerCase();
  const situacao = document.getElementById('filterSituacao').value;
  const status = document.getElementById('filterStatus').value;

  return state.leads.filter(l => {
    const matchQuery = !query || 
      (l.nome && l.nome.toLowerCase().includes(query)) ||
      (l.nicho && l.nicho.toLowerCase().includes(query)) ||
      (l.cidade && l.cidade.toLowerCase().includes(query));

    const matchSituacao = !situacao || l.situacao === situacao;
    const matchStatus = !status || l.status_prospeccao === status;

    return matchQuery && matchSituacao && matchStatus;
  });
}

function renderLeads() {
  const tbody = document.getElementById('leadsTableBody');
  const emptyState = document.getElementById('emptyState');
  const filtered = getFilteredLeads();

  document.getElementById('tabCount').textContent = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  tbody.innerHTML = '';

  filtered.forEach(lead => {
    const tr = document.createElement('tr');

    // Badge de Situação
    let badgeClass = 'badge-danger';
    if (lead.situacao?.includes('Linktree') || lead.situacao?.includes('Bio')) {
      badgeClass = 'badge-warning';
    } else if (lead.situacao?.includes('Instagram') || lead.situacao?.includes('Facebook')) {
      badgeClass = 'badge-purple';
    }

    const telFormatado = lead.telefone || 'Não informado';
    const hasWhatsApp = !!lead.whatsapp_link;

    tr.innerHTML = `
      <td>
        <div class="empresa-cell">
          <strong>${lead.nome}</strong>
          <span class="empresa-nicho">${lead.nicho}</span>
        </div>
      </td>
      <td>
        <span class="loc-cidade">${lead.cidade}, SP</span>
        <span class="loc-end" title="${lead.endereco || ''}">${lead.endereco || 'Endereço não disponível'}</span>
      </td>
      <td>
        <span class="badge ${badgeClass}">${lead.situacao || 'sem site'}</span>
        ${lead.site_atual ? `<a href="${lead.site_atual}" target="_blank" class="loc-end" style="color: #6366f1; text-decoration: underline;">${lead.site_atual.slice(0, 26)}...</a>` : ''}
      </td>
      <td>
        <div style="font-family: var(--font-mono); font-size: 0.8rem; margin-bottom: 4px;">
          ${telFormatado}
        </div>
        ${hasWhatsApp ? `
          <a href="${lead.whatsapp_link}" target="_blank" class="btn btn-whatsapp btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.031 2C6.495 2 2 6.495 2 12.031c0 1.944.557 3.76 1.523 5.302L2.08 22l4.821-1.404c1.488.887 3.23 1.435 5.13 1.435 5.536 0 10.031-4.495 10.031-10.031S17.567 2 12.031 2zm0 18.25c-1.635 0-3.15-.49-4.425-1.332l-.317-.208-3.044.887.896-2.955-.224-.336A8.187 8.187 0 0 1 3.781 12.03c0-4.55 3.7-8.25 8.25-8.25 4.55 0 8.25 3.7 8.25 8.25 0 4.55-3.7 8.25-8.25 8.25z"/>
            </svg>
            Chamar no WhatsApp
          </a>
        ` : '<span style="font-size:0.75rem; color:var(--text-dim);">Sem WhatsApp direto</span>'}
      </td>
      <td>
        <select class="status-dropdown" data-id="${lead.id}">
          <option value="Novo / Não abordado" ${lead.status_prospeccao === 'Novo / Não abordado' ? 'selected' : ''}>Novo / Não abordado</option>
          <option value="Mensagem Enviada" ${lead.status_prospeccao === 'Mensagem Enviada' ? 'selected' : ''}>Mensagem Enviada</option>
          <option value="Em Conversa" ${lead.status_prospeccao === 'Em Conversa' ? 'selected' : ''}>Em Conversa</option>
          <option value="Proposta Enviada" ${lead.status_prospeccao === 'Proposta Enviada' ? 'selected' : ''}>Proposta Enviada</option>
          <option value="Fechado!" ${lead.status_prospeccao === 'Fechado!' ? 'selected' : ''}>Fechado! 🎉</option>
          <option value="Sem Interesse" ${lead.status_prospeccao === 'Sem Interesse' ? 'selected' : ''}>Sem Interesse</option>
        </select>
      </td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-outline btn-sm btn-pitch" data-id="${lead.id}" title="Gerar scripts e pitch personalizado">
            💬 Pitch
          </button>
          ${lead.google_maps ? `
            <a href="${lead.google_maps}" target="_blank" class="btn btn-outline btn-sm" title="Abrir no Google Maps">
              📍 Maps
            </a>
          ` : ''}
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Event Listeners nos status dropdowns
  document.querySelectorAll('.status-dropdown').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const novoStatus = e.target.value;
      await atualizarStatusLead(id, novoStatus);
    });
  });

  // Event Listeners nos botões de pitch
  document.querySelectorAll('.btn-pitch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      abrirModalPitch(id);
    });
  });

  if (state.currentView === 'kanban') {
    renderKanban();
  }
}

// ==========================================
// Renderização do Kanban Board
// ==========================================
function renderKanban() {
  const cols = {
    'Novo / Não abordado': document.getElementById('cardsNew'),
    'Mensagem Enviada': document.getElementById('cardsSent'),
    'Em Conversa': document.getElementById('cardsChat'),
    'Proposta Enviada': document.getElementById('cardsProposal'),
    'Fechado!': document.getElementById('cardsWon')
  };

  const counts = {
    'Novo / Não abordado': document.getElementById('countColNew'),
    'Mensagem Enviada': document.getElementById('countColSent'),
    'Em Conversa': document.getElementById('countColChat'),
    'Proposta Enviada': document.getElementById('countColProposal'),
    'Fechado!': document.getElementById('countColWon')
  };

  Object.values(cols).forEach(el => el.innerHTML = '');
  const counters = { 'Novo / Não abordado': 0, 'Mensagem Enviada': 0, 'Em Conversa': 0, 'Proposta Enviada': 0, 'Fechado!': 0 };

  const filtered = getFilteredLeads();

  filtered.forEach(lead => {
    const colStatus = lead.status_prospeccao || 'Novo / Não abordado';
    if (!cols[colStatus]) return;

    counters[colStatus]++;

    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.innerHTML = `
      <div class="k-card-title">${lead.nome}</div>
      <div class="k-card-loc">📍 ${lead.cidade} • <span style="color:var(--accent-cyan);">${lead.nicho}</span></div>
      <div>
        <span class="badge ${lead.situacao?.includes('Linktree') ? 'badge-warning' : 'badge-danger'}">${lead.situacao || 'sem site'}</span>
      </div>
      <div class="k-card-actions">
        <button class="btn btn-outline btn-sm btn-pitch" data-id="${lead.id}">Pitch</button>
        ${lead.whatsapp_link ? `
          <a href="${lead.whatsapp_link}" target="_blank" class="btn btn-whatsapp btn-sm">WhatsApp</a>
        ` : ''}
      </div>
    `;

    cols[colStatus].appendChild(card);
  });

  for (const [st, count] of Object.entries(counters)) {
    if (counts[st]) counts[st].textContent = count;
  }

  // Reatribuir cliques no pitch
  document.querySelectorAll('.kanban-card .btn-pitch').forEach(b => {
    b.addEventListener('click', (e) => abrirModalPitch(e.currentTarget.dataset.id));
  });
}

// ==========================================
// Atualizar Status do Lead
// ==========================================
async function atualizarStatusLead(id, novoStatus) {
  try {
    const res = await fetch('/api/leads/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status_prospeccao: novoStatus })
    });
    if (res.ok) {
      const l = state.leads.find(x => x.id === id);
      if (l) l.status_prospeccao = novoStatus;
      atualizarMetricas();
      if (state.currentView === 'kanban') renderKanban();
    }
  } catch (e) {
    console.error('Erro ao atualizar status:', e);
  }
}

// ==========================================
// Métricas do Topo
// ==========================================
function atualizarMetricas() {
  const total = state.leads.length;
  const semSite = state.leads.filter(l => l.situacao === 'sem site').length;
  const soRede = state.leads.filter(l => l.situacao && l.situacao !== 'sem site').length;
  const contatados = state.leads.filter(l => l.status_prospeccao && l.status_prospeccao !== 'Novo / Não abordado').length;
  const fechados = state.leads.filter(l => l.status_prospeccao === 'Fechado!').length;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statSemSite').textContent = semSite;
  document.getElementById('statSoRede').textContent = soRede;
  document.getElementById('statContatados').textContent = contatados;
  document.getElementById('statFechados').textContent = fechados;
}

// ==========================================
// Modal de Pitch e Abordagem
// ==========================================
function abrirModalPitch(id) {
  const lead = state.leads.find(l => l.id === id);
  if (!lead) return;

  state.currentLeadForPitch = lead;

  document.getElementById('modalEmpresaNome').textContent = lead.nome;
  document.getElementById('modalEmpresaLoc').textContent = `${lead.cidade}, SP • ${lead.telefone || 'Sem telefone cadastrado'}`;
  document.getElementById('modalNichoBadge').textContent = lead.nicho;

  // Buscar nicho nos metadados
  const metaNicho = state.nichos.find(n => n.busca.toLowerCase() === lead.nicho.toLowerCase());
  if (metaNicho && metaNicho.dor_principal) {
    document.getElementById('modalPainAlert').innerHTML = `<strong>Dor do Nicho (${metaNicho.categoria}):</strong> ${metaNicho.dor_principal}`;
  } else {
    document.getElementById('modalPainAlert').innerHTML = `<strong>Diagnóstico:</strong> Negócio atuante em ${lead.cidade} sem site próprio oficial para conversão no Google.`;
  }

  atualizarTextoPitchModal();

  // Botão WhatsApp Modal
  const btnWa = document.getElementById('btnEnviarWhatsAppModal');
  if (lead.telefone) {
    btnWa.classList.remove('hidden');
    atualizarLinkWaModal();
  } else {
    btnWa.classList.add('hidden');
  }

  document.getElementById('pitchModal').classList.remove('hidden');
}

function atualizarTextoPitchModal() {
  const lead = state.currentLeadForPitch;
  if (!lead) return;

  const metaNicho = state.nichos.find(n => n.busca.toLowerCase() === lead.nicho.toLowerCase());
  let texto = '';

  const situacao = (lead.situacao || 'sem site').toLowerCase();

  if (state.currentPitchType === 'consultivo') {
    if (situacao.includes('linktree')) {
      texto = metaNicho?.pitch_so_linktree || `Olá! Vi o perfil de vocês e o trabalho é incrível. Notei que no link de bio vocês usam Linktree. Sabia que empresas em ${lead.cidade} que trocam por uma página oficial própria aumentam em mais de 40% o contato de clientes qualificados? Criei um modelo exclusivo para vocês. Posso te apresentar?`;
    } else if (situacao.includes('instagram')) {
      texto = metaNicho?.pitch_so_instagram || `Olá! O perfil de vocês no Instagram é ótimo. Mas milhares de moradores em ${lead.cidade} procuram por ${lead.nicho} direto no Google Maps e hoje acabam caindo na concorrência porque vocês não têm site indexado. Vocês já pensaram em ter uma página focada em fechar negócios no Google?`;
    } else {
      texto = metaNicho?.pitch_sem_site || `Olá, equipe da ${lead.nome}! Estive olhando os profissionais de ${lead.nicho} em ${lead.cidade} e o trabalho de vocês é impecável. Notei, no entanto, que vocês ainda não possuem um site oficial próprio. Hoje, mais de 70% dos clientes buscam no Google antes de entrar em contato. Posso te enviar uma prévia de um site moderno sem compromisso?`;
    }
  } else if (state.currentPitchType === 'amostra') {
    texto = `Olá ${lead.nome}! Eu desenvolvo páginas de alta conversão para ${lead.nicho} aqui no estado de SP. Como adorei a apresentação de vocês em ${lead.cidade}, montei uma demonstração rápida de um site interativo com botão direto pro seu WhatsApp e galeria de fotos. Posso te mandar o print ou link para você ver como ficou?`;
  } else {
    texto = `Olá! Tudo bem? Vi que vocês atendem ${lead.nicho} em ${lead.cidade}. Vocês estão recebendo novos clientes pelo Google ou atualmente dependem apenas de indicações? Desenvolvo sites rápidos que colocam vocês no topo da busca local. Vamos conversar 5 minutinhos?`;
  }

  // Substituir variáveis
  texto = texto.replace(/{cidade}/g, lead.cidade).replace(/{nome}/g, lead.nome);

  document.getElementById('pitchTextArea').value = texto;
  atualizarLinkWaModal();
}

function atualizarLinkWaModal() {
  const lead = state.currentLeadForPitch;
  if (!lead || !lead.telefone) return;

  const texto = document.getElementById('pitchTextArea').value;
  const numLimpo = String(lead.telefone).replace(/\D/g, '');
  const numFinal = numLimpo.startsWith('55') ? numLimpo : '55' + numLimpo;
  const url = `https://wa.me/${numFinal}?text=${encodeURIComponent(texto)}`;
  document.getElementById('btnEnviarWhatsAppModal').href = url;
}
