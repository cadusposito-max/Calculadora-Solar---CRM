// Arquivo: calculadora.js

const SUPABASE_URL = "https://uhofnzijvikcgicdkphz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVob2ZuemlqdmlrY2dpY2RrcGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4MzA2OTAsImV4cCI6MjA3NDQwNjY5MH0.s0x31vAorKqMMtp149a2GndlNPNTuV52TRsCt4X7yVg";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// LISTA DE TODOS OS INPUTS
const ALL_INPUT_IDS = [
    'invBrand', 'invModel', 'modBrand', 'modModel',
    'gridType', 'inverterCount', 'moduleCount', 'irradiation', 'systemLosses',
    'inverterPower', 'overload', 'mpptCount', 'connectorsPerMppt', 'mpptMinV',
    'inverterMaxV', 'mpptMaxA', 'modulePower', 'moduleVmp', 'moduleImp',
    'moduleVoc', 'moduleIsc', 'tempCoef', 'minTemp', 'enableVdropCalc',
    'cableDistance', 'dcCableSize', 'groupingFactor'
];

let generationChartInstance;
let lastCalculatedResults = {};
let currentProjectId = null;
let currentProjectName = "Novo Projeto";
let allModulesList = [];
let allInvertersList = [];

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('calculate-button').addEventListener('click', calculate);
    document.getElementById('clear-button').addEventListener('click', clearData);
    document.getElementById('save-button').addEventListener('click', updateProject);
    document.getElementById('solar-form').addEventListener('submit', e => e.preventDefault());

    const vDrop = document.getElementById('enableVdropCalc');
    if (vDrop) {
        vDrop.addEventListener('change', function() {
            document.getElementById('vdrop-inputs').classList.toggle('hidden', !this.checked);
        });
    }

    loadProjectData();
    loadEquipmentDatabase();
});

// --- 1. PRESETS E BANCO DE DADOS ---

async function loadEquipmentDatabase() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Carrega Módulos
    const { data: mods } = await supabase.from('db_modulos').select('*').order('created_at', { ascending: false });
    if (mods) {
        allModulesList = mods;
        setupCombobox('Module', mods);
    }

    // Carrega Inversores
    const { data: invs } = await supabase.from('db_inversores').select('*').order('created_at', { ascending: false });
    if (invs) {
        allInvertersList = invs;
        setupCombobox('Inverter', invs);
    }
}

function setupCombobox(type, dataList) {
    const input = document.getElementById(`search${type}`);
    const list = document.getElementById(`list${type}`);
    const hiddenId = document.getElementById(`saved${type}sId`);

    const renderList = (filterText = '') => {
        list.innerHTML = '';
        let filtered = [];
        if (!filterText) {
            filtered = dataList.slice(0, 5);
        } else {
            const lower = filterText.toLowerCase();
            filtered = dataList.filter(item =>
                (item.marca + ' ' + item.modelo).toLowerCase().includes(lower)
            );
        }

        if (filtered.length === 0) {
            list.innerHTML = `<div class="p-2 text-xs text-gray-500 text-center">Nenhum encontrado</div>`;
            return;
        }

        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'combobox-item';
            div.innerHTML = `<strong>${item.marca}</strong> - ${item.modelo} <span class="text-xs opacity-50 block">${item.potencia}W</span>`;

            div.onclick = () => {
                input.value = `${item.marca} - ${item.modelo}`;
                hiddenId.value = item.id;
                list.classList.remove('show');
                if (type === 'Module') applyModulePreset(item.id);
                else applyInverterPreset(item.id);
            };
            list.appendChild(div);
        });
    };

    input.addEventListener('focus', () => {
        renderList(input.value);
        list.classList.add('show');
    });

    input.addEventListener('input', (e) => {
        renderList(e.target.value);
        list.classList.add('show');
        if (e.target.value === '') hiddenId.value = '';
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !list.contains(e.target)) {
            list.classList.remove('show');
        }
    });
}

function applyModulePreset(id) {
    if (!id) id = document.getElementById('savedModulesId').value;
    if (!id) return;

    const m = allModulesList.find(item => item.id == id);
    if (m) {
        document.getElementById('modBrand').value = m.marca || '';
        document.getElementById('modModel').value = m.modelo || '';
        document.getElementById('modulePower').value = m.potencia;
        document.getElementById('moduleVmp').value = m.vmp;
        document.getElementById('moduleImp').value = m.imp;
        document.getElementById('moduleVoc').value = m.voc;
        document.getElementById('moduleIsc').value = m.isc;
        document.getElementById('tempCoef').value = m.coef_temp;
        document.getElementById('minTemp').value = m.temp_min;
        showToast(`Módulo carregado: ${m.marca}`, 'success');
    }
}

function applyInverterPreset(id) {
    if (!id) id = document.getElementById('savedInvertersId').value;
    if (!id) return;

    const i = allInvertersList.find(item => item.id == id);
    if (i) {
        document.getElementById('invBrand').value = i.marca || '';
        document.getElementById('invModel').value = i.modelo || '';
        document.getElementById('gridType').value = i.tipo_rede;
        document.getElementById('inverterPower').value = i.potencia;
        document.getElementById('overload').value = i.overload;
        document.getElementById('mpptCount').value = i.num_mppts;
        document.getElementById('connectorsPerMppt').value = i.conector_config;
        document.getElementById('mpptMinV').value = i.v_min;
        document.getElementById('inverterMaxV').value = i.v_max;
        document.getElementById('mpptMaxA').value = i.i_max;
        showToast(`Inversor carregado: ${i.marca}`, 'success');
    }
}

async function saveEquipment(type) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Faça login para salvar.', 'error'); return; }

    const table = type === 'module' ? 'db_modulos' : 'db_inversores';
    const marca = document.getElementById(type === 'module' ? 'modBrand' : 'invBrand').value;
    const modelo = document.getElementById(type === 'module' ? 'modModel' : 'invModel').value;

    if (!marca || !modelo) { showToast('Preencha Marca e Modelo.', 'error'); return; }

    let payload = { user_id: user.id, marca, modelo };

    if (type === 'module') {
        payload.potencia = parseFloat(document.getElementById('modulePower').value) || 0;
        payload.vmp = parseFloat(document.getElementById('moduleVmp').value) || 0;
        payload.imp = parseFloat(document.getElementById('moduleImp').value) || 0;
        payload.voc = parseFloat(document.getElementById('moduleVoc').value) || 0;
        payload.isc = parseFloat(document.getElementById('moduleIsc').value) || 0;
        payload.coef_temp = parseFloat(document.getElementById('tempCoef').value) || 0;
        payload.temp_min = parseFloat(document.getElementById('minTemp').value) || 0;
    } else {
        payload.potencia = parseFloat(document.getElementById('inverterPower').value) || 0;
        payload.tipo_rede = document.getElementById('gridType').value;
        payload.overload = parseFloat(document.getElementById('overload').value) || 0;
        payload.num_mppts = parseFloat(document.getElementById('mpptCount').value) || 0;
        payload.conector_config = document.getElementById('connectorsPerMppt').value;
        payload.v_min = parseFloat(document.getElementById('mpptMinV').value) || 0;
        payload.v_max = parseFloat(document.getElementById('inverterMaxV').value) || 0;
        payload.i_max = parseFloat(document.getElementById('mpptMaxA').value) || 0;
    }

    const { error } = await supabase.from(table).insert(payload);
    if (error) {
        showToast('Erro ao salvar: ' + error.message, 'error');
    } else {
        showToast(`${type === 'module' ? 'Módulo' : 'Inversor'} salvo com sucesso!`, 'success');
        loadEquipmentDatabase();
    }
}

async function deleteEquipment(type) {
    if (!confirm("Apagar este item salvo?")) return;
    const id = document.getElementById(type === 'module' ? 'savedModulesId' : 'savedInvertersId').value;
    if (!id) { showToast("Selecione um item para apagar.", "error"); return; }

    const table = type === 'module' ? 'db_modulos' : 'db_inversores';
    const { error } = await supabase.from(table).delete().eq('id', id);

    if (error) showToast("Erro ao apagar.", "error");
    else {
        showToast("Item apagado.", "success");
        document.getElementById(type === 'module' ? 'searchModule' : 'searchInverter').value = '';
        document.getElementById(type === 'module' ? 'savedModulesId' : 'savedInvertersId').value = '';
        loadEquipmentDatabase();
    }
}

// --- 2. LÓGICA DO PROJETO ---

async function loadProjectData() {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('id');
    if (!projectId) return;

    const backLink = document.getElementById('back-link');
    if (backLink) {
        backLink.href = `projeto-detalhes.html?id=${projectId}`;
        backLink.innerHTML = "<i class='bx bx-arrow-back mr-1'></i> Voltar ao Projeto";
    }

    currentProjectId = projectId;
    const { data: projectData, error } = await supabase.from('calculos_salvos').select('*').eq('id', projectId).single();

    if (error) { console.error('Erro ao carregar:', error); return; }

    currentProjectName = projectData.nome_projeto;
    const titleEl = document.querySelector('h1');
    if (titleEl) titleEl.innerText = `Validação: ${currentProjectName}`;

    if (projectData.dados_completos) {
        const formData = projectData.dados_completos;
        for (const key in formData) {
            const el = document.getElementById(key);
            if (el) {
                if (el.type === 'checkbox') el.checked = formData[key];
                else el.value = formData[key];
            }
        }
        const vdropCheck = document.getElementById('enableVdropCalc');
        if (vdropCheck && vdropCheck.checked) document.getElementById('vdrop-inputs').classList.remove('hidden');
    }
}

async function updateProject() {
    if (!currentProjectId) { showToast("Erro: ID não encontrado.", "error"); return; }
    if (Object.keys(lastCalculatedResults).length === 0) {
        showToast("Valide a configuração antes de salvar.", "error"); return;
    }
    const saveBtn = document.getElementById('save-button');
    saveBtn.innerText = 'Salvando...';
    saveBtn.disabled = true;

    const currentInputs = {};
    for (const id of ALL_INPUT_IDS) {
        const el = document.getElementById(id);
        if (el) {
            if (el.type === 'checkbox') currentInputs[id] = el.checked;
            else if (['gridType', 'connectorsPerMppt', 'invBrand', 'invModel', 'modBrand', 'modModel'].includes(id)) currentInputs[id] = el.value;
            else currentInputs[id] = parseFloat(el.value) || 0;
        }
    }

    const projectUpdateData = {
        potencia_pico_kwp: lastCalculatedResults.potenciaPico,
        potencia_inversor_w: currentInputs.inverterPower,
        total_modulos: currentInputs.moduleCount,
        geracao_media_kwh: lastCalculatedResults.geracaoMedia,
        dados_completos: currentInputs
    };

    const { error } = await supabase.from('calculos_salvos').update(projectUpdateData).eq('id', currentProjectId);
    saveBtn.innerText = 'Salvar Projeto';
    saveBtn.disabled = false;
    if (error) { showToast("Erro ao salvar: " + error.message, "error"); }
    else { showToast("Projeto salvo com sucesso!", "success"); }
}

// --- 3. CÁLCULO ---

function calculate() {
    const resultsDiv = document.getElementById('results');
    const hideResults = () => { resultsDiv.innerHTML = ''; resultsDiv.classList.add('hidden'); if (generationChartInstance) generationChartInstance.destroy(); };

    const inputs = {};
    try {
        for (const id of ALL_INPUT_IDS) {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') inputs[id] = el.checked;
                else if (['gridType', 'connectorsPerMppt', 'invBrand', 'invModel', 'modBrand', 'modModel'].includes(id)) inputs[id] = el.value;
                else inputs[id] = parseFloat(el.value);
            }
        }
        const connectorsStr = inputs.connectorsPerMppt.toString();
        let physicalLimits = connectorsStr.includes(',')
            ? connectorsStr.split(',').map(s => parseInt(s.trim()))
            : Array(inputs.mpptCount).fill(parseInt(connectorsStr));
        if (physicalLimits.length === 1 && inputs.mpptCount > 1) physicalLimits = Array(inputs.mpptCount).fill(physicalLimits[0]);
        inputs.physicalLimits = physicalLimits;
    } catch (e) { console.error(e); return; }

    if (inputs.moduleCount % inputs.inverterCount !== 0) { hideResults(); alert("Erro: Módulos não dividem igualmente."); return; }

    const modulesPerInverter = inputs.moduleCount / inputs.inverterCount;
    const vocCold = inputs.moduleVoc * (1 + (inputs.minTemp - 25) * (inputs.tempCoef / 100));
    const maxSeries = Math.floor(inputs.inverterMaxV / vocCold);
    const minSeries = Math.ceil(inputs.mpptMinV / inputs.moduleVmp);
    const maxStringsElectrical = Math.floor(inputs.mpptMaxA / inputs.moduleIsc);

    if (maxStringsElectrical < 1) { hideResults(); alert(`Erro Crítico: Corrente do módulo (${inputs.moduleIsc}A) maior que MPPT (${inputs.mpptMaxA}A).`); return; }

    const realLimitsPerMppt = inputs.physicalLimits.map(phys => Math.min(phys, maxStringsElectrical));
    const maxTotalStringsInverter = realLimitsPerMppt.reduce((a, b) => a + b, 0);

    const autoConfig = findOptimalConfiguration(modulesPerInverter, inputs.mpptCount, realLimitsPerMppt, maxTotalStringsInverter, minSeries, maxSeries);

    if (!autoConfig.success) {
        hideResults(); alert(`Arranjo impossível: ${autoConfig.message}`); return;
    }

    const distribution = autoConfig.distribution;
    let electricalError = null, maxV = 0;

    distribution.forEach((mppt, index) => {
        if (mppt.numStrings === 0) return;
        const vMax = mppt.modulesPerString * vocCold;
        if (vMax > maxV) maxV = vMax;
        if (vMax > inputs.inverterMaxV) electricalError = `Sobretensão na MPPT ${index + 1}`;
    });

    if (electricalError) {
        resultsDiv.innerHTML = `<div class="p-4 bg-red-900/70 text-red-300 rounded-lg font-bold">${electricalError}</div>`;
        resultsDiv.classList.remove('hidden'); return;
    }
    const currentOverloadPercent = ((inputs.moduleCount * inputs.modulePower) / inputs.inverterPower) * 100;
    const maxAllowedOverload = 100 + inputs.overload;

    if (currentOverloadPercent > maxAllowedOverload) {
        hideResults();
        // Exibe erro na tela igual ao erro elétrico
        resultsDiv.innerHTML = `
            <div class="p-4 bg-red-900/70 text-red-300 rounded-lg border border-red-700 shadow-lg">
                <div class="flex items-center gap-3 mb-1">
                    <i class='bx bxs-error-alt text-2xl'></i>
                    <strong class="text-lg">Erro: Overload Excessivo!</strong>
                </div>
                <p>O dimensionamento resultou em <strong>${currentOverloadPercent.toFixed(1)}%</strong> de overload.</p>
                <p class="text-sm opacity-80 mt-1">O limite configurado no inversor é <strong>${maxAllowedOverload}%</strong> (Overload de ${inputs.overload}%).</p>
            </div>`;
        resultsDiv.classList.remove('hidden');
        return; // Para a execução aqui
    }
    const systemDcPowerKw = (inputs.moduleCount * inputs.modulePower) / 1000;
    const powerRatioPercent = ((modulesPerInverter * inputs.modulePower) / inputs.inverterPower) * 100;
    const daysInMonth = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const seasonalFactors = [1.15, 1.1, 1.05, 0.95, 0.85, 0.8, 0.8, 0.85, 0.95, 1.05, 1.1, 1.15];
    const performanceRatio = 1 - (inputs.systemLosses / 100);
    const monthlyGeneration = seasonalFactors.map((factor, index) => (systemDcPowerKw * inputs.irradiation * factor * performanceRatio) * daysInMonth[index]);
    const totalAnnualGeneration = monthlyGeneration.reduce((a, b) => a + b, 0);

    lastCalculatedResults = {
        inputs, potenciaPico: systemDcPowerKw, geracaoMedia: totalAnnualGeneration / 12, monthlyGeneration,
        totalAnnualGeneration, modulesPerInverter, powerRatioPercent, distribution,
        vocCorrected: vocCold, maxVStringGlobal: maxV
    };

    resultsDiv.innerHTML = generateReportHTML(lastCalculatedResults);
    resultsDiv.classList.remove('hidden');
    document.getElementById('save-button').classList.remove('hidden');
    createGenerationChart(monthlyGeneration, totalAnnualGeneration);
}

// Algoritmo de Distribuição
function findOptimalConfiguration(t, m, l, mx, mn, mxs) { for (let s = mxs; s >= mn; s--) { let b = Math.floor(t / s), r = t % s; if (r === 0) { if (b <= mx && b > 0) { let d = distributeStringsToMppts(b, s, m, l); if (d.success) return { success: true, distribution: d.result } } } else if ((s + 1) <= mxs) { if (b <= mx && r <= b) { let d = distributeMixedStrings(r, s + 1, b - r, s, m, l); if (d.success) return { success: true, distribution: d.result } } } } return { success: false, message: "Não foi possível achar arranjo válido." } }
function distributeStringsToMppts(t, s, m, l) { let d = [], rem = t; for (let i = 0; i < m; i++) { let act = Math.min(Math.ceil(rem / (m - i)), l[i]); d.push({ numStrings: act, modulesPerString: act > 0 ? s : 0 }); rem -= act } return { success: rem === 0, result: d } }
function distributeMixedStrings(ql, sl, qc, sc, m, l) { let d = Array(m).fill(null).map(() => ({ numStrings: 0, modulesPerString: 0 })), curr = 0; const add = (sz) => { let att = 0; while (att < m) { let mp = d[curr]; if (mp.numStrings < l[curr]) { if (mp.numStrings === 0 || mp.modulesPerString === sz) { mp.numStrings++; mp.modulesPerString = sz; curr = (curr + 1) % m; return true } } curr = (curr + 1) % m; att++ } return false }; for (let i = 0; i < ql; i++) if (!add(sl)) return { success: false }; for (let i = 0; i < qc; i++) if (!add(sc)) return { success: false }; return { success: true, result: d } }

// --- 4. VISUAL ---

function generateReportHTML(data) {
    const { inputs, monthlyGeneration, totalAnnualGeneration, powerRatioPercent, distribution, maxVStringGlobal } = data;

    const voltage = inputs.gridType.includes('380') ? 380 : (inputs.gridType.includes('220') ? 220 : 127);
    const isThreePhase = inputs.gridType.includes('trifasico');
    const nominalCurrent = inputs.inverterPower / (isThreePhase ? voltage * 1.732 : voltage);
    const projectCurrent = nominalCurrent * 1.25;

    const breakers = [16, 25, 32, 40, 50, 63, 70, 80, 100, 125, 150, 175, 200, 250];
    const breaker = breakers.find(b => b >= projectCurrent) || 250;

    let cable = "Consulte";
    const cableTable = isThreePhase
        ? { "2.5": 21, "4": 28, "6": 36, "10": 50, "16": 68, "25": 89, "35": 111, "50": 134, "70": 171, "95": 207 }
        : { "2.5": 24, "4": 32, "6": 41, "10": 57, "16": 76, "25": 101, "35": 125 };

    for (const [bitola, amp] of Object.entries(cableTable)) {
        if (amp * inputs.groupingFactor >= breaker) {
            cable = bitola + " mm²";
            break;
        }
    }

    let vDropHTML = '';
    if (inputs.enableVdropCalc) {
        vDropHTML = generateVoltageDropHTML(inputs, data.maxModulesString || 12);
    }

    return `
    <div id="textResults" class="animate-fade-in space-y-6">
        <h2 class="text-2xl font-bold text-white mb-2">Resultado da Validação</h2>
        <div class="flex gap-8 text-sm mb-4">
            <div><span class="text-gray-400">Total Módulos:</span> <strong class="text-white text-lg">${inputs.moduleCount} (${inputs.modulePower}Wp)</strong></div>
            <div><span class="text-gray-400">Overload:</span> <strong class="text-white text-lg">${powerRatioPercent.toFixed(1)}%</strong></div>
        </div>

        <div>
            <h3 class="text-lg font-bold text-white mb-2">Dimensionamento CA (Profissional)</h3>
            <div class="bg-gray-800 rounded-lg p-5 border border-gray-700 shadow-lg grid grid-cols-2 md:grid-cols-4 gap-6">
                <div><p class="text-xs text-gray-400">Corrente Nominal</p><p class="text-2xl font-bold text-white">${nominalCurrent.toFixed(1)} A</p></div>
                <div><p class="text-xs text-gray-400">Projeto (+25%)</p><p class="text-2xl font-bold text-white">${projectCurrent.toFixed(1)} A</p></div>
                <div><p class="text-xs text-gray-400">Disjuntor</p><p class="text-2xl font-bold text-sky-400">${breaker} A</p></div>
                <div><p class="text-xs text-gray-400">Cabo (FCA ${inputs.groupingFactor})</p><p class="text-2xl font-bold text-green-400">${cable}</p></div>
            </div>
        </div>

        <div>
            <h3 class="text-lg font-bold text-white mb-2">Dimensionamento Lado CC</h3>
            <div class="bg-green-900/40 border border-green-600/50 p-3 rounded mb-2 flex items-center gap-2">
                <i class='bx bxs-check-circle text-green-400 text-xl'></i>
                <div><strong class="text-green-400 block">Configuração Válida</strong><span class="text-gray-300 text-sm">Dentro dos limites. Max Tensão: ${maxVStringGlobal.toFixed(1)}V</span></div>
            </div>
            ${vDropHTML}
            <div class="bg-gray-800/50 rounded-lg p-6 border border-gray-700 mt-4 overflow-x-auto">
                <h4 class="text-white font-bold mb-6 border-b border-gray-700 pb-2">Arranjo Fotovoltaico (Diagrama Unifilar)</h4>
                <div class="flex items-stretch min-w-[600px]">
                    <div class="flex-grow space-y-6 flex flex-col justify-center py-4">
                        ${generateVisualStrings(distribution)}
                    </div>
                    <div class="w-2 bg-green-500 mx-6 relative rounded-full shadow-[0_0_15px_rgba(34,197,94,0.6)] z-10">
                        <div class="absolute top-1/2 right-0 w-6 h-1 bg-green-500"></div>
                    </div>
                    <div class="w-40 flex items-center justify-start">
                         <div class="bg-gray-700 border-2 border-gray-500 text-gray-300 font-bold p-4 rounded-lg text-center shadow-2xl relative">
                            <i class='bx bx-server text-3xl mb-1 text-amber-500'></i>
                            <div class="text-xs uppercase text-gray-400">Inversor</div>
                            <div class="text-lg text-white">${(inputs.inverterPower / 1000).toFixed(1)} kW</div>
                            <div class="absolute top-1/2 -left-2 w-3 h-3 bg-green-500 rounded-full transform -translate-y-1/2"></div>
                        </div>
                    </div>
                </div>
            </div>
            ${generateMPPTTable(distribution, inputs)}
        </div>

        <div class="mt-8">
             <h3 class="text-center text-white font-bold mb-2">Estimativa: ${totalAnnualGeneration.toFixed(0)} kWh/ano</h3>
             <div class="h-64 relative bg-gray-800/30 rounded p-2 mb-6"><canvas id="generationChart"></canvas></div>
             ${generateMonthlyTable(monthlyGeneration)}
             <button onclick="generatePdf()" id="pdf-button" class="w-full mt-6 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded shadow-lg transition flex items-center justify-center gap-2"><i class='bx bxs-file-pdf'></i> Gerar PDF Técnico</button>
        </div>
    </div>`;
}

function generateVisualStrings(distribution) {
    return distribution.map((d, index) => {
        if (d.numStrings === 0) return '';
        const stringsRows = Array(d.numStrings).fill(0).map((_, strIndex) => {
            const modulesHTML = Array(d.modulesPerString).fill(0).map(() =>
                `<div class="w-8 h-12 bg-blue-600 rounded-sm border border-blue-400 shadow-sm relative group hover:bg-blue-500 transition-colors"><div class="absolute top-1/2 left-0 w-full h-[1px] bg-blue-300/50"></div></div>`
            ).join('');
            return `
            <div class="flex items-center mb-3 last:mb-0 relative">
                <div class="relative w-6 h-12 mr-2 shrink-0 opacity-70"><div class="absolute top-[40%] w-full h-[2px] bg-red-500"></div><div class="absolute top-[60%] w-full h-[2px] bg-gray-900"></div></div>
                <div class="flex gap-1 z-10 flex-nowrap mr-2">${modulesHTML}</div>
                <div class="flex-grow h-[2px] bg-red-500 relative shadow-[0_0_5px_rgba(239,68,68,0.5)] mt-[-6px] opacity-80 min-w-[40px]"><i class='bx bxs-right-arrow text-red-500 text-[8px] absolute right-0 top-1/2 -translate-y-1/2'></i></div>
            </div>`;
        }).join('');
        return `<div class="flex border-b border-gray-700/50 pb-6 mb-6 last:border-0 last:mb-0 last:pb-0 relative"><div class="w-24 flex flex-col justify-center items-end pr-5 shrink-0 border-r border-gray-700/50 mr-4"><span class="text-amber-500 font-bold text-lg leading-tight">MPPT ${index + 1}</span><span class="text-xs text-gray-400 mt-1 bg-gray-800 px-2 py-1 rounded border border-gray-600">${d.numStrings} string${d.numStrings > 1 ? 's' : ''}</span></div><div class="flex-grow flex flex-col justify-center w-full">${stringsRows}</div></div>`;
    }).join('');
}

function generateMPPTTable(distribution, inputs) {
    let html = `
    <div class="mt-6 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-md">
        <h4 class="px-4 py-3 bg-gray-900 text-gray-200 font-bold text-sm border-b border-gray-700 flex items-center gap-2"><i class='bx bx-table'></i> Dados Elétricos por MPPT (STC)</h4>
        <div class="overflow-x-auto"><table class="w-full text-left text-sm text-gray-400"><thead class="bg-gray-900/50 text-xs uppercase text-gray-500 font-bold"><tr><th class="px-4 py-3 text-center">MPPT</th><th class="px-4 py-3 text-center">Arranjo</th><th class="px-4 py-3 text-center text-sky-400">Tensão (Voc)</th><th class="px-4 py-3 text-center text-green-400">Corrente (Isc)</th><th class="px-4 py-3 text-center">Potência</th></tr></thead><tbody class="divide-y divide-gray-700">`;
    let hasData = false;
    distribution.forEach((d, i) => {
        if (d.numStrings === 0) return;
        hasData = true;
        const vocTotal = d.modulesPerString * inputs.moduleVoc;
        const iscTotal = d.numStrings * inputs.moduleIsc;
        const powerKw = (d.numStrings * d.modulesPerString * inputs.modulePower) / 1000;
        html += `<tr class="hover:bg-gray-700/30 transition-colors"><td class="px-4 py-3 text-center font-bold text-amber-500">MPPT ${i + 1}</td><td class="px-4 py-3 text-center text-gray-300">${d.numStrings}x ${d.modulesPerString}</td><td class="px-4 py-3 text-center font-mono text-sky-300">${vocTotal.toFixed(1)} V</td><td class="px-4 py-3 text-center font-mono text-green-300">${iscTotal.toFixed(1)} A</td><td class="px-4 py-3 text-center font-bold text-white">${powerKw.toFixed(2)} kWp</td></tr>`;
    });
    html += `</tbody></table></div></div>`;
    return hasData ? html : '';
}

function generateMonthlyTable(data) {
    const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    let header = '', body = '';
    data.forEach((val, i) => {
        header += `<th class="py-3 px-2 text-xs font-bold text-gray-400 uppercase tracking-wider">${months[i]}</th>`;
        body += `<td class="py-3 px-2 text-sm font-bold text-white border-t border-gray-700">${val.toFixed(0)}</td>`;
    });
    return `<div class="overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-md"><h4 class="px-4 py-3 bg-gray-900 text-white font-bold text-sm border-b border-gray-700">Detalhes da Geração Mensal (kWh)</h4><div class="overflow-x-auto"><table class="w-full text-center min-w-[600px]"><thead class="bg-gray-900/50"><tr>${header}</tr></thead><tbody><tr>${body}</tr></tbody></table></div></div>`;
}

function generateVoltageDropHTML(inputs, stringLength) {
    if (!inputs.moduleImp || !inputs.moduleVmp || !stringLength) return '';
    const dist = inputs.cableDistance || 0;
    const bitola = inputs.dcCableSize || 6;
    const rho = 0.0172;
    const resistencia = (rho * 2 * dist) / bitola;
    const vDrop = resistencia * inputs.moduleImp;
    const vString = inputs.moduleVmp * stringLength;
    const percent = (vDrop / vString) * 100;
    let colorClass, barColor, statusLabel;
    if (percent < 1) { colorClass = 'text-green-400'; barColor = 'bg-green-500'; statusLabel = '<span class="text-xs bg-green-900/30 text-green-400 px-3 py-1 rounded border border-green-800/50 font-bold">IDEAL</span>'; }
    else if (percent < 3) { colorClass = 'text-yellow-400'; barColor = 'bg-yellow-500'; statusLabel = '<span class="text-xs bg-yellow-900/30 text-yellow-400 px-3 py-1 rounded border border-yellow-800/50 font-bold">ATENÇÃO</span>'; }
    else { colorClass = 'text-red-400'; barColor = 'bg-red-500'; statusLabel = '<span class="text-xs bg-red-900/50 text-red-400 px-3 py-1 rounded border border-red-800 font-bold">CRÍTICO</span>'; }
    const barWidth = Math.min((percent / 5) * 100, 100);
    return `<div class="mt-4 bg-gray-800 rounded-lg border border-gray-700 shadow-md overflow-hidden"><div class="bg-gray-900/50 px-5 py-3 border-b border-gray-700 flex justify-between items-center"><h4 class="text-sm font-bold text-gray-300 uppercase flex items-center gap-2"><i class='bx bx-trending-down text-lg'></i> Análise de Queda de Tensão</h4>${statusLabel}</div><div class="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-700 p-5 items-center"><div class="flex flex-col justify-center space-y-4 px-2"><div class="flex justify-between items-center"><span class="text-sm text-gray-400 font-medium">Distância (x2)</span><span class="text-base font-bold text-white flex items-center gap-2"><i class='bx bx-ruler text-gray-500'></i> ${dist}m</span></div><div class="flex justify-between items-center"><span class="text-sm text-gray-400 font-medium">Bitola Cabo</span><span class="text-base font-bold text-amber-400 flex items-center gap-2"><i class='bx bx-cable text-amber-600'></i> ${bitola}mm²</span></div></div><div class="flex flex-col items-center justify-center px-2 py-4 md:py-0"><span class="text-xs uppercase text-gray-500 font-bold mb-1 tracking-wider">Queda em Volts</span><span class="text-3xl font-mono text-gray-200 font-bold">${vDrop.toFixed(2)} <span class="text-lg text-gray-500">V</span></span><span class="text-xs text-gray-500 mt-1">Resistência R = ${resistencia.toFixed(3)} Ω</span></div><div class="flex flex-col justify-center px-2 pt-2 md:pt-0"><div class="flex justify-between items-end mb-2"><span class="text-xs uppercase text-gray-500 font-bold tracking-wider">Impacto %</span><span class="text-3xl font-bold ${colorClass}">${percent.toFixed(2)}%</span></div><div class="w-full bg-gray-900 rounded-full h-3 border border-gray-700 relative overflow-hidden"><div class="${barColor} h-full rounded-full transition-all duration-500" style="width: ${barWidth}%"></div></div><div class="flex justify-between text-[10px] text-gray-500 mt-1 font-mono"><span>0%</span><span>Limite: 3%</span><span>5%</span></div></div></div></div>`;
}

function clearData() { if (confirm('Limpar?')) { document.getElementById('solar-form').reset(); document.getElementById('results').classList.add('hidden'); } }
function createGenerationChart(d, t) { const ctx = document.getElementById('generationChart').getContext('2d'); if (generationChartInstance) generationChartInstance.destroy(); generationChartInstance = new Chart(ctx, { type: 'bar', data: { labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'], datasets: [{ label: 'kWh', data: d, backgroundColor: '#3b82f6', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#374151' }, ticks: { color: '#9ca3af' } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } } } }); }
function showToast(message, type = 'success') { let container = document.getElementById('toast-container'); if (!container) { container = document.createElement('div'); container.id = 'toast-container'; container.className = 'fixed top-5 right-5 z-50 flex flex-col gap-3'; document.body.appendChild(container); } const el = document.createElement('div'); const styles = type === 'success' ? 'bg-gray-800 border-l-4 border-green-500 text-green-100 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-gray-800 border-l-4 border-red-500 text-red-100 shadow-[0_0_15px_rgba(239,68,68,0.3)]'; const icon = type === 'success' ? "<i class='bx bxs-check-circle text-2xl text-green-500'></i>" : "<i class='bx bxs-error-circle text-2xl text-red-500'></i>"; el.className = `${styles} px-6 py-4 rounded-r shadow-2xl flex items-center gap-4 min-w-[300px] toast-enter relative overflow-hidden`; el.innerHTML = `${icon}<div><h4 class="font-bold text-sm uppercase tracking-wide">${type === 'success' ? 'Sucesso' : 'Erro'}</h4><span class="text-sm opacity-90">${message}</span></div><div class="absolute bottom-0 left-0 h-1 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'} transition-all duration-[3000ms] ease-linear w-full" style="width: 100%"></div>`; container.appendChild(el); setTimeout(() => { const bar = el.querySelector('div:last-child'); if (bar) bar.style.width = '0%'; }, 50); setTimeout(() => { el.classList.replace('toast-enter', 'toast-exit'); el.addEventListener('animationend', () => el.remove()); }, 3000); }

// --- FUNÇÃO DE GERAÇÃO DE RELATÓRIO TÉCNICO (PDF) ATUALIZADA ---

// --- FUNÇÃO DE GERAÇÃO DE RELATÓRIO TÉCNICO (PDF) COMPLETA ---

async function generatePdf() {
    // 1. Validação inicial
    if (!lastCalculatedResults || !lastCalculatedResults.inputs) {
        showToast("Realize um cálculo antes de gerar o PDF.", "error");
        return;
    }

    const btn = document.getElementById('pdf-button');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "<i class='bx bx-loader-alt animate-spin'></i> Gerando PDF...";

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const inputs = lastCalculatedResults.inputs;

        // 2. Busca Dados Completos do Responsável
        const { data: { user } } = await supabase.auth.getUser();

        let respData = {
            nome: "Usuário do Sistema",
            email: user ? user.email : "",
            crea: "",
            empresa: "",
            telefone: "",
            tarifa: 0
        };

        if (user) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            if (profile) {
                respData.nome = profile.username || respData.nome;
                respData.crea = profile.crea_number || "Não informado";
                respData.empresa = profile.company_name || "";
                respData.telefone = profile.phone || "";
                respData.tarifa = profile.energy_rate || 0;
            }
        }

        // --- CONFIGURAÇÃO VISUAL ---
        const primaryColor = [245, 158, 11]; // Amber-500
        const darkColor = [31, 41, 55];      // Gray-800
        const grayColor = [107, 114, 128];   // Gray-500

        // --- CAPA / CABEÇALHO ---
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 8, 297, 'F'); // Faixa lateral

        // Se tiver empresa, destaca ela no topo
        if (respData.empresa) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text(respData.empresa.toUpperCase(), 20, 15);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(...darkColor);
        doc.text("Relatório Técnico Fotovoltaico", 20, 25);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...grayColor);
        const today = new Date();
        const dateStr = today.toLocaleDateString('pt-BR') + ' às ' + today.toLocaleTimeString('pt-BR');
        doc.text(`Emitido em: ${dateStr}`, 20, 31);

        doc.setDrawColor(200, 200, 200);
        doc.line(20, 36, 190, 36);

        let currentY = 50;

        // --- 1. DADOS DO PROJETO & RESPONSÁVEL ---
        doc.setFontSize(12);
        doc.setTextColor(...darkColor);
        doc.setFont("helvetica", "bold");
        doc.text("1. Resumo do Projeto e Responsabilidade Técnica", 20, currentY);
        currentY += 8;

        // Cálculo Financeiro Rápido (Se tiver tarifa)
        let economiaTexto = "Tarifa não definida";
        if(respData.tarifa > 0) {
            const economia = lastCalculatedResults.geracaoMedia * respData.tarifa;
            economiaTexto = `R$ ${economia.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})} / mês (Estimado)`;
        }

        // Tabela Rica com os Novos Dados
        const infoData = [
            // Títulos das Colunas (Simulados)
            [{content: 'DADOS DO PROJETO', colSpan: 2, styles: {fontStyle: 'bold', fillColor: [245, 245, 245]}},
                {content: 'RESPONSÁVEL TÉCNICO', colSpan: 2, styles: {fontStyle: 'bold', fillColor: [245, 245, 245]}}],

            // Linha 1
            ["Projeto:", currentProjectName || "Simulação", "Nome:", respData.nome],
            // Linha 2
            ["Potência:", `${lastCalculatedResults.potenciaPico.toFixed(2)} kWp`, "Registro (CREA/CFT):", respData.crea],
            // Linha 3
            ["Inversor:", `${(inputs.inverterPower/1000)} kW (${inputs.invBrand || 'Genérico'})`, "Empresa:", respData.empresa || "-"],
            // Linha 4
            ["Geração Est.:", `${lastCalculatedResults.geracaoMedia.toFixed(0)} kWh/mês`, "Contato:", respData.telefone || respData.email],
            // Linha 5 (Financeiro) - Só mostra se tiver tarifa configurada no perfil
            ...(respData.tarifa > 0 ? [["Economia:", economiaTexto, "Email:", respData.email]] : [])
        ];

        doc.autoTable({
            startY: currentY,
            body: infoData,
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: 2, lineColor: [230, 230, 230], lineWidth: 0.1 },
            columnStyles: {
                0: { fontStyle: 'bold', width: 25 },
                1: { width: 65 },
                2: { fontStyle: 'bold', width: 35 }
            },
            margin: { left: 20 }
        });

        currentY = doc.lastAutoTable.finalY + 15;

        // --- 2. GERAÇÃO DE ENERGIA ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("2. Estimativa de Geração (Gráfico e Tabela)", 20, currentY);

        const canvas = document.getElementById('generationChart');
        if (canvas) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(canvas, 0, 0);
            const chartImg = tempCanvas.toDataURL("image/jpeg", 1.0);
            doc.addImage(chartImg, 'JPEG', 20, currentY + 5, 170, 70);
            currentY += 80;
        }

        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const genValues = lastCalculatedResults.monthlyGeneration.map(v => v.toFixed(0));

        const tableMonthBody = [
            months.slice(0, 6),
            genValues.slice(0, 6),
            months.slice(6, 12),
            genValues.slice(6, 12)
        ];

        doc.autoTable({
            startY: currentY,
            body: tableMonthBody,
            theme: 'grid',
            styles: { fontSize: 9, halign: 'center' },
            didParseCell: function(data) {
                if (data.row.index % 2 === 0) {
                    data.cell.styles.fillColor = [240, 240, 240];
                    data.cell.styles.fontStyle = 'bold';
                }
            },
            margin: { left: 20 }
        });

        currentY = doc.lastAutoTable.finalY + 15;

        // --- 3. DIMENSIONAMENTO CA ---
        doc.text("3. Dimensionamento de Cabos e Proteções (CA)", 20, currentY);
        currentY += 5;

        const voltage = inputs.gridType.includes('380') ? 380 : (inputs.gridType.includes('220') ? 220 : 127);
        const isThreePhase = inputs.gridType.includes('trifasico');
        const nominalCurrent = inputs.inverterPower / (isThreePhase ? voltage * 1.732 : voltage);
        const disjuntorTexto = document.querySelector('#textResults .text-sky-400')?.innerText.split(' ')[0] || "Verificar";
        const caboTexto = document.querySelector('#textResults .text-green-400')?.innerText || "Verificar";

        const cableData = [
            ["Tensão de Rede", `${voltage}V (${isThreePhase ? 'Trifásico' : 'Mono/Bifásico'})`],
            ["Corrente Nominal", `${nominalCurrent.toFixed(1)} A`],
            ["Corrente de Projeto (+25%)", `${(nominalCurrent * 1.25).toFixed(1)} A`],
            ["Disjuntor Recomendado", `${disjuntorTexto} A`],
            ["Cabo CA Sugerido", caboTexto]
        ];

        doc.autoTable({
            startY: currentY,
            body: cableData,
            theme: 'striped',
            head: [['Parâmetro', 'Especificação']],
            headStyles: { fillColor: primaryColor, textColor: [255, 255, 255] },
            margin: { left: 20 }
        });

        currentY = doc.lastAutoTable.finalY + 15;

        // --- 4. QUEDA DE TENSÃO CC (Com Correção Matemática) ---
        if (inputs.enableVdropCalc) {
            if (currentY > 250) { doc.addPage(); doc.setFillColor(...primaryColor); doc.rect(0, 0, 8, 297, 'F'); currentY = 20; }

            doc.setFont("helvetica", "bold");
            doc.text("4. Análise de Queda de Tensão (CC)", 20, currentY);
            currentY += 5;

            const activeMppt = lastCalculatedResults.distribution.find(d => d.numStrings > 0);
            const modsPerString = activeMppt ? activeMppt.modulesPerString : 1;
            const dist = inputs.cableDistance || 0;
            const bitola = inputs.dcCableSize || 6;
            const rho = 0.0172;
            const resistencia = (rho * 2 * dist) / bitola;
            const vDrop = resistencia * inputs.moduleImp;
            const vStringTotal = inputs.moduleVmp * modsPerString;
            const percent = (vDrop / vStringTotal) * 100;

            const statusDrop = percent < 3 ? "OK (Dentro da Norma <3%)" : "ALERTA (Acima de 3%)";

            const dropData = [
                ["Distância (Arranjo-Inversor)", `${dist} metros`],
                ["Cabo CC Utilizado", `${bitola} mm²`],
                ["Perda Calculada", `${vDrop.toFixed(2)} V`],
                ["Impacto Percentual", `${percent.toFixed(2)}%`],
                ["Status", statusDrop]
            ];

            doc.autoTable({
                startY: currentY,
                body: dropData,
                theme: 'grid',
                head: [['Parâmetro', 'Resultado']],
                headStyles: { fillColor: darkColor },
                didParseCell: function(data) {
                    if (data.row.index === 4 && data.column.index === 1) {
                        data.cell.styles.textColor = percent < 3 ? [22, 163, 74] : [220, 38, 38];
                        data.cell.styles.fontStyle = 'bold';
                    }
                },
                margin: { left: 20 }
            });
            currentY = doc.lastAutoTable.finalY + 15;
        }

        // --- 5. ARRANJO (Strings) ---
        if (currentY > 240) { doc.addPage(); doc.setFillColor(...primaryColor); doc.rect(0, 0, 8, 297, 'F'); currentY = 20; }

        doc.setFont("helvetica", "bold");
        doc.setTextColor(...darkColor);
        doc.text(inputs.enableVdropCalc ? "5. Configuração das Strings" : "4. Configuração das Strings", 20, currentY);
        currentY += 5;

        const mpptRows = lastCalculatedResults.distribution
            .filter(d => d.numStrings > 0)
            .map((d, i) => [
                `MPPT ${i+1}`,
                `${d.numStrings} string(s) de ${d.modulesPerString} módulos`,
                `${(d.modulesPerString * lastCalculatedResults.vocCorrected).toFixed(1)} V`,
                `${(d.numStrings * inputs.moduleIsc).toFixed(1)} A`
            ]);

        doc.autoTable({
            startY: currentY,
            head: [['Entrada', 'Configuração', 'Tensão Voc (Frio)', 'Corrente Isc']],
            body: mpptRows,
            theme: 'striped',
            headStyles: { fillColor: darkColor },
            styles: { halign: 'center' },
            columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'left' } },
            margin: { left: 20 }
        });

        // --- RODAPÉ ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);

            // Footer com Empresa (se houver)
            const footerText = respData.empresa
                ? `${respData.empresa} - Relatório gerado via Calculadora Solar Pro`
                : `Relatório gerado via Calculadora Solar Pro`;

            doc.text(`Página ${i} de ${pageCount} - ${footerText}`, 105, 290, { align: 'center' });
        }

        doc.save(`Relatorio_Solar_${currentProjectName.replace(/\s+/g, '_')}.pdf`);
        showToast("PDF gerado com sucesso!", "success");

    } catch (error) {
        console.error(error);
        showToast("Erro ao gerar PDF: " + error.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}