const SUPABASE_URL = "https://uhofnzijvikcgicdkphz.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVob2ZuemlqdmlrY2dpY2RrcGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4MzA2OTAsImV4cCI6MjA3NDQwNjY5MH0.s0x31vAorKqMMtp149a2GndlNPNTuV52TRsCt4X7yVg";
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentPage = 1;
const projectsPerPage = 10;
let totalProjects = 0;
let doughnutChart = null;
let lineChart = null;

// --- SISTEMA DE NOVIDADES (CONFIGURAÇÃO) ---
const NEWS_CONFIG = {
    currentVersion: '1.4',
    items: [
        // --- NOVA NOVIDADE AQUI NO TOPO ---
        {
            date: '26/11',
            title: 'Banco de Dados de Equipamentos',
            desc: 'Chega de redigitar! Agora você pode salvar seus Módulos e Inversores favoritos como "Presets" e carregá-los instantaneamente em qualquer projeto.'
        },
        {
            date: '26/11',
            title: 'Arranjo Automático Inteligente',
            desc: 'Agora você não precisa definir strings manualmente. O sistema calcula o melhor equilíbrio sozinho, respeitando limites físicos e elétricos!'
        },
        {
            date: '26/11',
            title: 'Correção NBR 5410 (Cabos)',
            desc: 'O dimensionamento de cabos agora diferencia corretamente redes Monofásicas de Trifásicas (Método B1).'
        },
        {
            date: '26/11',
            title: 'Salvamento Rápido',
            desc: 'Agora ao salvar um projeto você recebe uma notificação sutil (Toast) sem sair da tela de cálculo.'
        }
    ]
};

// --- INICIALIZAÇÃO (QUANDO A PÁGINA CARREGA) ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Verifica Login
    checkUser();

    // 2. Inicia Sistema de Novidades
    initNewsSystem();

    // 3. Configura Abas
    setupTabs();

    // 4. Configura Filtros e Botões
    setupEventListeners();
});

// --- FUNÇÕES DO SISTEMA DE NOVIDADES ---
function initNewsSystem() {
    renderNewsWidget();
    checkNewsPopup();
}

function renderNewsWidget() {
    // Agora buscamos o container da nova aba
    const listContainer = document.getElementById('full-news-feed');

    // Atualiza badges de versão
    const versionDisplayTab = document.getElementById('version-display-tab');
    if (versionDisplayTab) versionDisplayTab.textContent = `Versão Atual: v${NEWS_CONFIG.currentVersion}`;

    // Lógica do Badge Vermelho na Aba (Opcional: mostra "!" se tiver versão nova)
    const lastSeen = localStorage.getItem('solar_app_news_version');
    const badge = document.getElementById('news-badge');
    if(badge) {
        if(lastSeen !== NEWS_CONFIG.currentVersion) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
    }

    if (!listContainer) return;

    listContainer.innerHTML = '';

    NEWS_CONFIG.items.forEach(item => {
        // Layout Estilo Timeline Profissional
        const itemHTML = `
            <div class="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div class="flex items-center justify-center w-10 h-10 rounded-full border border-gray-600 bg-gray-800 group-[.is-active]:bg-amber-500 group-[.is-active]:text-gray-900 text-gray-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <i class='bx bx-check'></i>
                </div>
                
                <div class="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-gray-900 p-4 rounded-lg border border-gray-700 shadow-md">
                    <div class="flex items-center justify-between space-x-2 mb-1">
                        <span class="font-bold text-gray-200">${item.title}</span>
                        <time class="font-mono text-xs text-amber-500">${item.date}</time>
                    </div>
                    <p class="text-gray-400 text-sm">${item.desc}</p>
                </div>
            </div>
        `;
        listContainer.innerHTML += itemHTML;
    });
}

function checkNewsPopup() {
    const lastSeenVersion = localStorage.getItem('solar_app_news_version');
    const modal = document.getElementById('news-modal');

    if (lastSeenVersion !== NEWS_CONFIG.currentVersion && modal) {
        const modalList = document.getElementById('modal-news-list');
        modalList.innerHTML = '';

        NEWS_CONFIG.items.slice(0, 3).forEach(item => {
            const itemHTML = `
                <div class="bg-gray-700/50 p-3 rounded-lg border border-gray-600">
                    <div class="flex justify-between items-start mb-1">
                        <h4 class="font-bold text-sky-400 text-sm">${item.title}</h4>
                        <span class="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full">${item.date}</span>
                    </div>
                    <p class="text-sm text-gray-300 leading-relaxed">${item.desc}</p>
                </div>
            `;
            modalList.innerHTML += itemHTML;
        });
        modal.showModal();
    }
}

// Essa função precisa ser global para o botão onclick do HTML funcionar
window.closeNewsPopup = function() {
    const modal = document.getElementById('news-modal');
    localStorage.setItem('solar_app_news_version', NEWS_CONFIG.currentVersion);
    modal.close();
    // Esconde o badge imediatamente
    const badge = document.getElementById('news-badge');
    if(badge) badge.classList.add('hidden');
}

// --- FUNÇÕES DE CONFIGURAÇÃO (SETUP) ---

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-button-chrome');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(item => item.classList.replace('tab-active-chrome', 'tab-inactive-chrome'));
            tab.classList.replace('tab-inactive-chrome', 'tab-active-chrome');
            tabPanes.forEach(pane => pane.classList.add('hidden'));
            const target = document.querySelector(tab.dataset.tabTarget);
            if (target) target.classList.remove('hidden');
        });
    });
}

function setupEventListeners() {
    const filterInput = document.getElementById('filter-input');
    const sortSelect = document.getElementById('sort-select');
    const filterDateInput = document.getElementById('filter-date');
    const newProjectBtn = document.getElementById('new-project-button');
    const logoutBtn = document.getElementById("logout");
    const prevBtn = document.getElementById('prev-page-button');
    const nextBtn = document.getElementById('next-page-button');
    const quickNewBtn = document.getElementById('quick-new-project');
    if (quickNewBtn) quickNewBtn.addEventListener('click', createNewProject);
    if (filterInput) filterInput.addEventListener('input', () => applyFiltersAndSort(true));
    if (sortSelect) sortSelect.addEventListener('change', () => applyFiltersAndSort(true));
    if (filterDateInput) filterDateInput.addEventListener('input', () => applyFiltersAndSort(true));
    if (newProjectBtn) newProjectBtn.addEventListener('click', createNewProject);

    if (logoutBtn) logoutBtn.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "login.html";
    });

    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            applyFiltersAndSort(false); // false para não resetar pagina
        }
    });

    if (nextBtn) nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(totalProjects / projectsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            applyFiltersAndSort(false); // false para não resetar pagina
        }
    });
}

// --- FUNÇÕES DO DASHBOARD E PROJETOS ---

async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = "login.html";
    } else {
        const emailEl = document.getElementById("user-email");
        if(emailEl) emailEl.textContent = user.email;

        const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single();
        if (profile) {
            document.getElementById('header-username').textContent = profile.username || user.email.split('@')[0];
            if (profile.avatar_url) document.getElementById('header-avatar').src = profile.avatar_url;
        }
        applyFiltersAndSort();
    }
}

async function createNewProject() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert("Você precisa estar logado.");
        return;
    }

    const button = document.getElementById('new-project-button');
    if(button) {
        button.disabled = true;
        button.innerHTML = '<i class="bx bx-loader-alt bx-spin mr-2"></i> Criando...';
    }

    const { data, error } = await supabase
        .from('calculos_salvos')
        .insert({
            user_id: user.id,
            nome_projeto: 'Novo Projeto (edite aqui)'
        })
        .select()
        .single();

    if (error) {
        console.error('Erro:', error);
        alert('Erro ao criar projeto.');
        if(button) {
            button.disabled = false;
            button.innerHTML = '<i class="bx bx-plus-circle mr-2"></i> Criar Novo Projeto';
        }
    } else {
        // MUDANÇA AQUI: Redireciona para detalhes em vez da calculadora
        window.location.href = `projeto-detalhes.html?id=${data.id}`;
    }
}

function applyFiltersAndSort(resetPage = true) {
    if (resetPage) currentPage = 1;
    const filterText = document.getElementById('filter-input') ? document.getElementById('filter-input').value.trim() : '';
    const sortValue = document.getElementById('sort-select') ? document.getElementById('sort-select').value : 'created_at_desc';
    const filterDate = document.getElementById('filter-date') ? document.getElementById('filter-date').value : '';
    loadProjects(filterText, sortValue, filterDate);
}

async function loadProjects(filterText = '', sortValue = 'created_at_desc', filterDate = '') {
    const projectListDiv = document.getElementById('project-list');
    if(projectListDiv) projectListDiv.innerHTML = '<p class="p-8 text-center text-gray-400">Carregando projetos...</p>';

    const lastUnderscoreIndex = sortValue.lastIndexOf('_');
    const sortBy = sortValue.substring(0, lastUnderscoreIndex);
    const sortDirection = sortValue.substring(lastUnderscoreIndex + 1);
    const ascending = sortDirection === 'asc';

    // 1. Contagem (para paginação)
    let countQuery = supabase.from('calculos_salvos').select('*', { count: 'exact', head: true });
    if (filterText) countQuery = countQuery.or(`nome_projeto.ilike.%${filterText}%,nome_cliente.ilike.%${filterText}%`);
    if (filterDate) {
        const startDate = new Date(filterDate + 'T00:00:00').toISOString();
        const endDate = new Date(filterDate + 'T23:59:59').toISOString();
        countQuery = countQuery.gte('created_at', startDate).lte('created_at', endDate);
    }
    const { count, error: countError } = await countQuery;
    if (!countError) totalProjects = count;

    // 2. Busca de Dados
    const from = (currentPage - 1) * projectsPerPage;
    const to = from + projectsPerPage - 1;

    let query = supabase.from('calculos_salvos').select('*');
    if (filterText) query = query.or(`nome_projeto.ilike.%${filterText}%,nome_cliente.ilike.%${filterText}%`);
    if (filterDate) {
        const startDate = new Date(filterDate + 'T00:00:00').toISOString();
        const endDate = new Date(filterDate + 'T23:59:59').toISOString();
        query = query.gte('created_at', startDate).lte('created_at', endDate);
    }
    query = query.order(sortBy, { ascending }).range(from, to);

    const { data: projects, error } = await query;

    if (error) {
        if(projectListDiv) projectListDiv.innerHTML = `<p class="p-8 text-center text-red-400">Erro: ${error.message}</p>`;
        return;
    }

    renderDashboardCharts(projects);
    updatePaginationControls();

    if (projects.length === 0) {
        if(projectListDiv) projectListDiv.innerHTML = '<p class="p-8 text-center text-gray-400">Nenhum projeto encontrado.</p>';
        return;
    }

    // --- TRECHO DA TABELA ATUALIZADO (FONTES MAIORES) ---
    let tableHTML = `
    <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="text-xs uppercase text-gray-500 border-b border-gray-700/50 bg-gray-900/20">
                    <th class="p-6 font-bold tracking-wider text-gray-400">Projeto</th> <th class="p-6 font-bold tracking-wider text-gray-400">Cliente</th>
                    <th class="p-6 font-bold tracking-wider text-gray-400 text-center">Data</th>
                    <th class="p-6 font-bold tracking-wider text-gray-400 text-center">Potência</th>
                    <th class="p-6 font-bold tracking-wider text-gray-400 text-right">Ações</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-700/50">`;

    projects.forEach(proj => {
        const dateObj = new Date(proj.created_at);
        const dateStr = dateObj.toLocaleDateString('pt-BR');
        const timeStr = dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

        tableHTML += `
        <tr class="group hover:bg-white/[0.02] transition-colors duration-200">
            <td class="p-6">
                <div class="flex items-center gap-5">
                    <div class="w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center text-amber-500 border border-gray-700 group-hover:border-amber-500/50 group-hover:bg-gray-800/80 transition-all shadow-lg shadow-black/20">
                        <i class='bx bxs-file-doc text-2xl'></i>
                    </div>
                    <div>
                        <div class="font-bold text-white group-hover:text-amber-400 transition-colors text-lg">${proj.nome_projeto || 'Sem Título'}</div>
                        <div class="text-xs text-gray-500 font-mono mt-0.5 bg-gray-800/50 px-1.5 py-0.5 rounded w-fit">ID: #${proj.id}</div>
                    </div>
                </div>
            </td>

            <td class="p-6">
                ${proj.nome_cliente
            ? `<div class="flex items-center gap-2 text-base text-gray-300"><i class='bx bxs-user-circle text-gray-500 text-xl'></i> ${proj.nome_cliente}</div>`
            : '<span class="text-sm text-gray-600 italic flex items-center gap-2"><i class="bx bx-help-circle"></i> Não informado</span>'}
            </td>

            <td class="p-6 text-center">
                <div class="flex flex-col">
                    <span class="text-base text-gray-300 font-medium">${dateStr}</span>
                    <span class="text-xs text-gray-500">${timeStr}</span>
                </div>
            </td>

            <td class="p-6 text-center">
                ${proj.potencia_pico_kwp
            ? `<span class="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-bold font-mono whitespace-nowrap shadow-[0_0_10px_rgba(245,158,11,0.1)]">
                         <i class='bx bxs-bolt text-lg'></i> ${proj.potencia_pico_kwp.toFixed(2)} kWp
                       </span>`
            : '<span class="text-gray-600">-</span>'}
            </td>

            <td class="p-6 text-right">
                <div class="flex items-center justify-end gap-3">
                    <a href="projeto-detalhes.html?id=${proj.id}" 
                       class="flex items-center gap-2 bg-gray-700 hover:bg-amber-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-all shadow-md hover:shadow-lg hover:shadow-amber-500/20 group/btn border border-gray-600 hover:border-amber-500">
                        <i class='bx bx-edit-alt'></i> <span>Editar</span>
                    </a>
                    
                    <button onclick="deleteProject(${proj.id})" 
                            class="w-10 h-10 flex items-center justify-center rounded-lg border border-gray-600 text-gray-400 hover:text-red-100 hover:border-red-500 hover:bg-red-600 transition-all shadow-md" title="Excluir">
                        <i class='bx bx-trash text-xl'></i>
                    </button>
                </div>
            </td>
        </tr>`;
    });

    tableHTML += '</tbody></table></div>';
    if(projectListDiv) projectListDiv.innerHTML = tableHTML;
}

window.deleteProject = async function(projectId) {
    if (!confirm("Tem certeza que deseja excluir este projeto?")) return;
    const { error } = await supabase.from('calculos_salvos').delete().eq('id', projectId);
    if (error) alert("Erro ao excluir: " + error.message);
    else applyFiltersAndSort(false);
}

function updatePaginationControls() {
    const pageInfo = document.getElementById('page-info');
    const prevButton = document.getElementById('prev-page-button');
    const nextButton = document.getElementById('next-page-button');

    if (!pageInfo || !prevButton || !nextButton) return;

    const totalPages = Math.ceil(totalProjects / projectsPerPage);
    pageInfo.textContent = totalPages <= 0 ? 'Página 0 de 0' : `Página ${currentPage} de ${totalPages}`;
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
}

function renderDashboardCharts(projects) {
    const totalProjectsEl = document.getElementById('total-projects');
    if (!totalProjectsEl) return;

    // --- 1. ATUALIZA HEADER (Boas Vindas e Data) ---
    const today = new Date();
    document.getElementById('current-date').textContent = today.toLocaleDateString('pt-BR');

    // Tenta pegar o nome do usuário do header principal para por no bom dia
    const headerName = document.getElementById('header-username').textContent;
    if(headerName && headerName !== 'Carregando...') {
        document.getElementById('welcome-username').textContent = headerName;
    }

    // --- 2. ATUALIZA CARDS (Igual antes) ---
    const count = projects.length;
    const totalPower = projects.reduce((sum, proj) => sum + (proj.potencia_pico_kwp || 0), 0);
    const averagePower = count > 0 ? totalPower / count : 0;

    totalProjectsEl.textContent = count;
    document.getElementById('total-power').textContent = `${totalPower.toFixed(2)}`;
    document.getElementById('average-power').textContent = `${averagePower.toFixed(2)}`;

    // --- 3. LISTA DE RECENTES (NOVIDADE) ---
    const recentListEl = document.getElementById('recent-projects-list');
    if (recentListEl) {
        // Pega os 4 últimos projetos (ordenados por data decrescente)
        // Como 'projects' já vem ordenado pela função loadProjects, pegamos o slice(0,4)
        // MAS ATENÇÃO: Se o filtro estiver ativo, 'projects' pode não ser o total.
        // Para garantir, vamos usar o array projects atual.
        const recentProjects = projects.slice(0, 4);

        if (recentProjects.length === 0) {
            recentListEl.innerHTML = '<p class="text-xs text-gray-500 text-center">Nenhum projeto recente.</p>';
        } else {
            recentListEl.innerHTML = '';
            recentProjects.forEach(proj => {
                const dateStr = new Date(proj.created_at).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
                recentListEl.innerHTML += `
                    <a href="projeto-detalhes.html?id=${proj.id}" class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700 transition group cursor-pointer border border-transparent hover:border-gray-600">
                        <div class="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-amber-500 font-bold text-xs border border-gray-700 group-hover:bg-gray-900">
                            ${(proj.potencia_pico_kwp || 0).toFixed(0)}k
                        </div>
                        <div class="flex-grow min-w-0">
                            <h4 class="text-sm text-gray-200 font-medium truncate group-hover:text-white">${proj.nome_projeto || 'Sem nome'}</h4>
                            <p class="text-xs text-gray-500 truncate">${proj.nome_cliente || 'Cliente não inf.'}</p>
                        </div>
                        <span class="text-[10px] text-gray-600 group-hover:text-gray-400">${dateStr}</span>
                    </a>
                `;
            });
        }
    }

    // --- 4. GRÁFICOS (MANTIVE IGUAL, SÓ AJUSTEI CORES E FONTES) ---
    if (doughnutChart) doughnutChart.destroy();
    if (lineChart) lineChart.destroy();

    // ... (Código dos gráficos continua o mesmo, só verifique se o ID bate) ...
    // Vou colar a lógica dos gráficos aqui pra garantir que não quebre
    const doughnutCtx = document.getElementById('doughnut-chart').getContext('2d');
    const powerDistribution = { small: 0, medium: 0, large: 0 };
    projects.forEach(proj => {
        const power = proj.potencia_pico_kwp || 0;
        if (power <= 5) powerDistribution.small++;
        else if (power <= 15) powerDistribution.medium++;
        else powerDistribution.large++;
    });

    doughnutChart = new Chart(doughnutCtx, {
        type: 'doughnut',
        data: {
            labels: ['Pequeno (<5)', 'Médio (5-15)', 'Grande (>15)'],
            datasets: [{
                data: [powerDistribution.small, powerDistribution.medium, powerDistribution.large],
                backgroundColor: ['#f59e0b', '#3b82f6', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false } // Escondi a legenda padrão pq fiz a customizada no HTML
            },
            cutout: '75%' // Rosca mais fina
        }
    });

    const lineCtx = document.getElementById('line-chart').getContext('2d');
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const lineLabels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
    const lineData = new Array(daysInMonth).fill(0);

    projects.forEach(proj => {
        const d = new Date(proj.created_at);
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
            lineData[d.getDate() - 1]++;
        }
    });

    lineChart = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: lineLabels,
            datasets: [{
                label: 'Projetos',
                data: lineData,
                borderColor: '#f59e0b',
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(245, 158, 11, 0.5)');
                    gradient.addColorStop(1, 'rgba(245, 158, 11, 0)');
                    return gradient;
                },
                borderWidth: 2,
                tension: 0.4, // Curva suave
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { display: false }, // Esconde eixo Y para ficar limpo
                x: {
                    ticks: { color: '#6b7280', maxTicksLimit: 10 },
                    grid: { display: false }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}