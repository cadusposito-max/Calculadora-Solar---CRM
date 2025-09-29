const SUPABASE_URL = "https://uhofnzijvikcgicdkphz.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVob2ZuemlqdmlrY2dpY2RrcGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4MzA2OTAsImV4cCI6MjA3NDQwNjY5MH0.s0x31vAorKqMMtp149a2GndlNPNTuV52TRsCt4X7yVg";
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let currentPage = 1;
    const projectsPerPage = 10; // Você pode mudar este número se quiser
    let totalProjects = 0;

    document.addEventListener('DOMContentLoaded', () => {
      checkUser();
      const tabs = document.querySelectorAll('.tab-button-chrome'); // Classe base atualizada
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
      const filterInput = document.getElementById('filter-input');
      const sortSelect = document.getElementById('sort-select');
      filterInput.addEventListener('input', applyFiltersAndSort);
      sortSelect.addEventListener('change', applyFiltersAndSort);

      // --- INÍCIO DA CORREÇÃO ---
      // Adiciona o "ouvinte" de clique para o botão de novo projeto
      document.getElementById('new-project-button').addEventListener('click', createNewProject);
      // --- FIM DA CORREÇÃO ---

      document.getElementById("logout").addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "login.html";
      });

      document.getElementById('prev-page-button').addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          // Chamamos loadProjects diretamente, mantendo o filtro/sort atual
          const filterText = document.getElementById('filter-input').value.trim();
          const sortValue = document.getElementById('sort-select').value;
          loadProjects(filterText, sortValue);
        }
      });

      document.getElementById('next-page-button').addEventListener('click', () => {
        const totalPages = Math.ceil(totalProjects / projectsPerPage);
        if (currentPage < totalPages) {
          currentPage++;
          // Chamamos loadProjects diretamente, mantendo o filtro/sort atual
          const filterText = document.getElementById('filter-input').value.trim();
          const sortValue = document.getElementById('sort-select').value;
          loadProjects(filterText, sortValue);
        }
      });

      document.getElementById('filter-date').addEventListener('input', applyFiltersAndSort);
    });

    // --- INÍCIO DA CORREÇÃO ---
    // Função que cria um novo projeto no banco de dados
    async function createNewProject() {
      // Pega o usuário logado para associar o projeto a ele
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert("Você precisa estar logado para criar um projeto.");
        return;
      }

      // Mostra um feedback visual para o usuário
      const button = document.getElementById('new-project-button');
      button.disabled = true;
      button.innerHTML = '<i class="bx bx-loader-alt bx-spin mr-2"></i> Criando...';

      // Insere uma nova linha na tabela com um nome padrão
      const { data, error } = await supabase
        .from('calculos_salvos')
        .insert({
          user_id: user.id, // Associa o projeto ao usuário
          nome_projeto: 'Novo Projeto (edite aqui)'
        })
        .select() // Pede ao Supabase para retornar o projeto que acabou de ser criado
        .single(); // Pega apenas esse objeto

      if (error) {
        console.error('Erro ao criar projeto:', error);
        alert('Não foi possível criar o projeto. Tente novamente.');
        button.disabled = false;
        button.innerHTML = '<i class="bx bx-plus-circle mr-2"></i> Criar Novo Projeto';
      } else {
        // Se deu tudo certo, redireciona para a página de detalhes com o ID do novo projeto
        window.location.href = `projeto-detalhes.html?id=${data.id}`;
      }
    }
    // --- FIM DA CORREÇÃO ---

    // --- LÓGICA DO DASHBOARD ---
    let doughnutChart = null;
    let lineChart = null;

    function renderDashboardCharts(projects) {
      // --- Lógica dos Cards (permanece a mesma) ---
      const totalProjects = projects.length;
      const totalPower = projects.reduce((sum, proj) => sum + (proj.potencia_pico_kwp || 0), 0);
      const averagePower = totalProjects > 0 ? totalPower / totalProjects : 0;
      document.getElementById('total-projects').textContent = totalProjects;
      document.getElementById('total-power').textContent = `${totalPower.toFixed(2)} kWp`;
      document.getElementById('average-power').textContent = `${averagePower.toFixed(2)} kWp`;

      // Destrói gráficos antigos antes de renderizar novos para evitar bugs
      if (doughnutChart) doughnutChart.destroy();
      if (lineChart) lineChart.destroy();

      // --- LÓGICA GRÁFICO 1: DOUGHNUT (Distribuição por Potência) ---
      const doughnutCtx = document.getElementById('doughnut-chart').getContext('2d');
      const powerDistribution = { small: 0, medium: 0, large: 0 };
      projects.forEach(proj => {
        const power = proj.potencia_pico_kwp || 0;
        if (power <= 5) { powerDistribution.small++; }
        else if (power > 5 && power <= 15) { powerDistribution.medium++; }
        else { powerDistribution.large++; }
      });
      const doughnutLabels = ['Pequeno Porte (até 5kWp)', 'Médio Porte (5-15kWp)', 'Grande Porte (>15kWp)'];
      const doughnutData = [powerDistribution.small, powerDistribution.medium, powerDistribution.large];

      doughnutChart = new Chart(doughnutCtx, {
        type: 'doughnut',
        data: {
          labels: doughnutLabels,
          datasets: [{
            label: 'Nº de Projetos', data: doughnutData,
            backgroundColor: ['rgba(251, 191, 36, 0.8)', 'rgba(59, 130, 246, 0.8)', 'rgba(239, 68, 68, 0.8)'],
            borderColor: '#1F2937', borderWidth: 2, hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { color: '#D1D5DB', padding: 15 } } }
        }
      });

      // --- LÓGICA GRÁFICO 2: LINHA (Projetos por Dia) ---
      const lineCtx = document.getElementById('line-chart').getContext('2d');
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

      const lineLabels = Array.from({ length: daysInMonth }, (_, i) => {
        const day = String(i + 1).padStart(2, '0');
        const month = String(currentMonth + 1).padStart(2, '0');
        return `${day}/${month}`;
      });

      const lineData = new Array(daysInMonth).fill(0);
      projects.forEach(proj => {
        const projDate = new Date(proj.created_at);
        if (projDate.getFullYear() === currentYear && projDate.getMonth() === currentMonth) {
          const dayOfMonth = projDate.getDate();
          lineData[dayOfMonth - 1]++;
        }
      });

      lineChart = new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: lineLabels,
          datasets: [{
            label: 'Novos Projetos', data: lineData,
            backgroundColor: 'rgba(251, 191, 36, 0.2)',
            borderColor: 'rgba(251, 191, 36, 1)',
            borderWidth: 2, tension: 0.3, fill: true,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, ticks: { color: '#9CA3AF', stepSize: 1 }, grid: { color: '#4B5563' } },
            x: { ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(75, 85, 99, 0.5)' } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }

    // --- (O resto do seu código permanece igual) ---
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "login.html";
      } else {
        document.getElementById("user-email").textContent = user.email;
        const { data: profile } = await supabase.from('profiles').select('username, avatar_url').eq('id', user.id).single();
        if (profile) {
          document.getElementById('header-username').textContent = profile.username || user.email.split('@')[0];
          if (profile.avatar_url) document.getElementById('header-avatar').src = profile.avatar_url;
        }
        applyFiltersAndSort();
      }
    }

    function applyFiltersAndSort() {
      currentPage = 1; // Reseta para a primeira página ao filtrar/ordenar
      const filterText = document.getElementById('filter-input').value.trim();
      const sortValue = document.getElementById('sort-select').value;
      const filterDate = document.getElementById('filter-date').value; // <-- Adicionado
      loadProjects(filterText, sortValue, filterDate); // <-- Adicionado
    }

    async function loadProjects(filterText = '', sortValue = 'created_at_desc', filterDate = '') {
      const projectListDiv = document.getElementById('project-list');
      projectListDiv.innerHTML = '<p class="p-8 text-center text-gray-400">Carregando projetos...</p>';

      const lastUnderscoreIndex = sortValue.lastIndexOf('_');
      const sortBy = sortValue.substring(0, lastUnderscoreIndex);
      const sortDirection = sortValue.substring(lastUnderscoreIndex + 1);
      const ascending = sortDirection === 'asc';

      let countQuery = supabase.from('calculos_salvos').select('*', { count: 'exact', head: true });
      if (filterText) {
        countQuery = countQuery.or(`nome_projeto.ilike.%${filterText}%,nome_cliente.ilike.%${filterText}%`);
      }
      if (filterDate) {
        const startDate = new Date(filterDate + 'T00:00:00').toISOString();
        const endDate = new Date(filterDate + 'T23:59:59').toISOString();
        countQuery = countQuery.gte('created_at', startDate).lte('created_at', endDate);
      }
      const { count, error: countError } = await countQuery;
      if (countError) {
        projectListDiv.innerHTML = `<p class="p-8 text-center text-red-400">Erro ao contar projetos: ${countError.message}</p>`;
        return;
      }
      totalProjects = count;

      const from = (currentPage - 1) * projectsPerPage;
      const to = from + projectsPerPage - 1;

      let query = supabase.from('calculos_salvos').select('*');
      if (filterText) {
        query = query.or(`nome_projeto.ilike.%${filterText}%,nome_cliente.ilike.%${filterText}%`);
      }
      if (filterDate) {
        const startDate = new Date(filterDate + 'T00:00:00').toISOString();
        const endDate = new Date(filterDate + 'T23:59:59').toISOString();
        query = query.gte('created_at', startDate).lte('created_at', endDate);
      }
      query = query.order(sortBy, { ascending }).range(from, to);

      const { data: projects, error } = await query;
      if (error) {
        projectListDiv.innerHTML = `<p class="p-8 text-center text-red-400">Erro: ${error.message}</p>`;
        return;
      }

      renderDashboardCharts(projects);
      updatePaginationControls();

      if (projects.length === 0) {
        projectListDiv.innerHTML = '<p class="p-8 text-center text-gray-400">Nenhum projeto encontrado.</p>';
        return;
      }

      // ... (o código que cria a tabela HTML continua o mesmo)
      let tableHTML = `<div class="overflow-x-auto"><table class="w-full text-left"><thead class="border-b border-gray-600 text-sm text-gray-400"><tr><th class="p-4 font-semibold">Nome do Projeto</th><th class="p-4 font-semibold">Cliente</th><th class="p-4 font-semibold">Data de Criação</th><th class="p-4 font-semibold">Potência (kWp)</th><th class="p-4 font-semibold">Ações</th></tr></thead><tbody>`;
      projects.forEach(proj => {
        tableHTML += `
      <tr class="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50 transition-colors">
        <td class="p-4 font-bold text-white">${proj.nome_projeto || 'Projeto sem nome'}</td>
        <td class="p-4 text-gray-300">${proj.nome_cliente || '<span class="text-gray-500">N/A</span>'}</td>
        <td class="p-4 text-gray-300">${new Date(proj.created_at).toLocaleDateString('pt-BR')}</td>
        <td class="p-4 text-gray-300">${proj.potencia_pico_kwp ? proj.potencia_pico_kwp.toFixed(2) : '<span class="text-gray-500">N/A</span>'}</td>
        <td class="p-4 flex items-center gap-2">
          <a href="projeto-detalhes.html?id=${proj.id}" class="cta-button outline-amber text-sm py-2 px-3">Ver Detalhes</a>
          <button onclick="deleteProject(${proj.id})" class="text-gray-500 hover:text-red-500 transition-colors p-2 rounded-full"><i class='bx bxs-trash-alt text-xl'></i></button>
        </td>
      </tr>`;
      });
      tableHTML += '</tbody></table></div>';
      projectListDiv.innerHTML = tableHTML;
    }

    async function deleteProject(projectId) {
      if (!confirm("Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita.")) {
        return;
      }
      const { error } = await supabase.from('calculos_salvos').delete().eq('id', projectId);
      if (error) {
        alert("Erro ao excluir o projeto: " + error.message);
      } else {
        applyFiltersAndSort();
      }
    }

    function updatePaginationControls() {
      const pageInfo = document.getElementById('page-info');
      const prevButton = document.getElementById('prev-page-button');
      const nextButton = document.getElementById('next-page-button');

      const totalPages = Math.ceil(totalProjects / projectsPerPage);

      if (totalPages <= 0) { // Nenhum projeto encontrado
        pageInfo.textContent = 'Página 0 de 0';
      } else {
        pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
      }

      // Habilita/desabilita o botão "Anterior"
      prevButton.disabled = currentPage <= 1;

      // Habilita/desabilita o botão "Próximo"
      nextButton.disabled = currentPage >= totalPages;
    }