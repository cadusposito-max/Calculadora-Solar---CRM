// Arquivo: calculadora.js (VERSÃO CORRIGIDA E MELHORADA)

// --- CONFIGURAÇÃO E CONSTANTES ---
const SUPABASE_URL = "https://uhofnzijvikcgicdkphz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVob2ZuemlqdmlrY2dpY2RrcGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4MzA2OTAsImV4cCI6MjA3NDQwNjY5MH0.s0x31vAorKqMMtp149a2GndlNPNTuV52TRsCt4X7yVg";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ALL_INPUT_IDS = ['gridType', 'inverterCount', 'moduleCount', 'irradiation', 'systemLosses', 'inverterPower', 'overload', 'mpptCount', 'stringsPerMppt', 'mpptMinV', 'inverterMaxV', 'mpptMaxA', 'modulePower', 'moduleVmp', 'moduleImp', 'moduleVoc', 'moduleIsc', 'tempCoef', 'minTemp', 'enableVdropCalc', 'cableDistance', 'dcCableSize'];

let generationChartInstance;
let lastCalculatedResults = {};
let currentProjectId = null;
let currentProjectName = "Novo Projeto";

// --- LÓGICA DE DADOS (Supabase) ---

async function loadProjectData() {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('id');
    if (!projectId) {
        alert("Nenhum projeto selecionado. Redirecionando para o dashboard.");
        window.location.href = 'dashboard.html';
        return;
    }
    currentProjectId = projectId;
    const { data: projectData, error } = await supabase.from('calculos_salvos').select('*').eq('id', projectId).single();
    if (error) {
        alert("Não foi possível carregar os dados do projeto.");
        console.error('Erro detalhado do Supabase:', error);
        window.location.href = 'dashboard.html';
        return;
    }
    currentProjectName = projectData.nome_projeto;
    document.querySelector('h1').innerText = `Validação Técnica: ${currentProjectName}`;
    if (projectData.dados_completos) {
        const formData = projectData.dados_completos;
        for (const key in formData) {
            const el = document.getElementById(key);
            if (el) {
                if (el.type === 'checkbox') el.checked = formData[key];
                else el.value = formData[key];
            }
        }
        document.getElementById('enableVdropCalc').dispatchEvent(new Event('change'));
    }
}

async function updateProject() {
    if (!currentProjectId) { alert("Erro: ID do projeto não encontrado."); return; }
    if (Object.keys(lastCalculatedResults).length === 0) { alert("Por favor, valide a configuração antes de salvar."); return; }
    const projectUpdateData = {
        potencia_pico_kwp: lastCalculatedResults.potenciaPico,
        potencia_inversor_w: lastCalculatedResults.inputs.inverterPower,
        total_modulos: lastCalculatedResults.inputs.moduleCount,
        geracao_media_kwh: lastCalculatedResults.geracaoMedia,
        dados_completos: lastCalculatedResults.inputs
    };
    const { error } = await supabase.from('calculos_salvos').update(projectUpdateData).eq('id', currentProjectId);
    if (error) {
        alert("Erro ao atualizar o projeto: " + error.message);
    } else {
        alert("Projeto atualizado com sucesso!");
        window.location.href = 'dashboard.html';
    }
}

// --- LÓGICA PRINCIPAL DA CALCULADORA ---

function calculate() {
    console.log("Checkpoint 1: Função de cálculo iniciada.");
    const resultsDiv = document.getElementById('results');
    const hideResults = () => { resultsDiv.innerHTML = ''; resultsDiv.classList.add('hidden'); if (generationChartInstance) { generationChartInstance.destroy(); } };
    const inputs = {};
    try {
        for (const id of ALL_INPUT_IDS) {
            const el = document.getElementById(id);
            if (el) {
                // --- ADICIONADO ESTE 'IF' PARA O CHECKBOX ---
                if (el.type === 'checkbox') {
                    inputs[id] = el.checked;

                } else if (el.type === 'number') {
                    if (el.value === '') {
                        if (id === 'cableDistance' && !document.getElementById('enableVdropCalc').checked) {
                            inputs[id] = 0;
                            continue;
                        }
                        hideResults();
                        alert(`Erro: O campo "${document.querySelector(`label[for=${id}]`).innerText}" deve ser preenchido.`);
                        return;
                    }
                    inputs[id] = parseFloat(el.value);
                } else {
                    if (el.value === '') {
                        hideResults();
                        alert(`Erro: O campo "${document.querySelector(`label[for=${id}]`).innerText}" deve ser preenchido.`);
                        return;
                    }
                    inputs[id] = el.value;
                }
            }
        }
    } catch (e) { console.error("Erro ao ler ou validar os inputs:", e); alert("Ocorreu um erro ao ler os dados do formulário."); return; }

    console.log("Checkpoint 2: Inputs lidos e validados com sucesso.");
    if (inputs.moduleCount % inputs.inverterCount !== 0) { hideResults(); alert("Erro: O número total de módulos não pode ser dividido igualmente entre todos os inversores."); return; }
    const modulesPerInverter = inputs.moduleCount / inputs.inverterCount;
    const totalCurrentPerMppt = inputs.stringsPerMppt * inputs.moduleIsc;
    if (totalCurrentPerMppt > inputs.mpptMaxA) { hideResults(); alert(`Erro de Corrente: As ${inputs.stringsPerMppt} strings em paralelo geram ${totalCurrentPerMppt.toFixed(2)}A (Isc), o que excede o limite de ${inputs.mpptMaxA}A da MPPT.`); return; }
    const minModulesString = Math.ceil(inputs.mpptMinV / inputs.moduleVmp);
    const vocCorrected = inputs.moduleVoc * (1 + (inputs.minTemp - 25) * (inputs.tempCoef / 100));
    const maxModulesString = Math.floor(inputs.inverterMaxV / vocCorrected);
    const totalStringsPerInverter = inputs.mpptCount * inputs.stringsPerMppt;
    const baseModulesPerString = Math.floor(modulesPerInverter / totalStringsPerInverter);
    const remainderModules = modulesPerInverter % totalStringsPerInverter;
    const longestStringLength = baseModulesPerString + (remainderModules > 0 ? 1 : 0);
    const shortestStringLength = baseModulesPerString;
    const isValidArrangement = (shortestStringLength > 0 && shortestStringLength >= minModulesString && longestStringLength <= maxModulesString);
    console.log("Checkpoint 3: Validação do arranjo (strings) concluída.");

    if (!isValidArrangement) {
        let errorMsg = `a divisão resultaria em strings com ${shortestStringLength} ou ${longestStringLength} módulos. Este arranjo é inválido pois o range permitido é de ${minModulesString} a ${maxModulesString}.`;
        resultsDiv.innerHTML = `<div class="p-4"><h2 class="text-2xl font-bold text-white mb-4">Resultado da Validação</h2><div class="bg-red-900/70 text-red-300 p-4 rounded-lg"><strong class="font-bold">Arranjo Inválido:</strong> ${errorMsg}</div></div>`;
        resultsDiv.classList.remove('hidden'); document.getElementById('save-button').classList.add('hidden'); return;
    }
    const powerRatioPercent = ((modulesPerInverter * inputs.modulePower) / inputs.inverterPower) * 100;
    const systemDcPowerKw = (inputs.moduleCount * inputs.modulePower) / 1000;
    const performanceRatio = 1 - (inputs.systemLosses / 100);
    const daysInMonth = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const seasonalFactors = [1.15, 1.1, 1.05, 0.95, 0.85, 0.8, 0.8, 0.85, 0.95, 1.05, 1.1, 1.15];
    const monthlyGeneration = seasonalFactors.map((factor, index) => (systemDcPowerKw * inputs.irradiation * factor * performanceRatio) * daysInMonth[index]);
    const totalAnnualGeneration = monthlyGeneration.reduce((a, b) => a + b, 0);
    lastCalculatedResults = { inputs, potenciaPico: systemDcPowerKw, geracaoMedia: totalAnnualGeneration / 12, monthlyGeneration, totalAnnualGeneration, modulesPerInverter, powerRatioPercent, minModulesString, maxModulesString, vocCorrected };

    console.log("Checkpoint 4: Resultados calculados. Prestes a gerar o HTML do relatório.");
    resultsDiv.innerHTML = generateReportHTML(lastCalculatedResults);
    resultsDiv.classList.remove('hidden');
    document.getElementById('save-button').classList.remove('hidden');
    console.log("Checkpoint 5: HTML gerado e inserido. Prestes a criar o gráfico.");
    createGenerationChart(monthlyGeneration, totalAnnualGeneration);
    console.log("Checkpoint 6: Gráfico criado. Função concluída com sucesso!");
}

// --- FUNÇÕES DE GERAÇÃO DE HTML E DIAGRAMAS ---

function generateACSizingHTML(inverterPower, gridType) {
    const standardBreakers = [10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125, 150, 175, 200];
    const cableAmpacityFromNBR = { "0.50": 6, "0.75": 10, "1.00": 12, "1.50": 15.5, "2.50": 21, "4.00": 28, "6.00": 36, "10.00": 50, "16.00": 68, "25.00": 89, "35.00": 111, "50.00": 134, "70.00": 171, "95.00": 207, "120.00": 239 };
    const cableSizes = Object.keys(cableAmpacityFromNBR);
    let acCurrent = 0, breakerType = '', voltage = 0;
    const sqrt3 = 1.732;

    switch (gridType) {
        case '220_bifasico': voltage = 220; acCurrent = inverterPower / voltage; breakerType = 'Bipolar'; break;
        case '380_trifasico': voltage = 380; acCurrent = inverterPower / (voltage * sqrt3); breakerType = 'Tripolar'; break;
        case '220_trifasico': voltage = 220; acCurrent = inverterPower / (voltage * sqrt3); breakerType = 'Tripolar'; break;
        case '127_monofasico': voltage = 127; acCurrent = inverterPower / voltage; breakerType = 'Bipolar'; break;
    }

    const breakerTier1 = standardBreakers.find(size => size >= (acCurrent * 1.15));
    let cableTier1 = 'Consulte';
    for (const size of cableSizes) { if (cableAmpacityFromNBR[size] >= breakerTier1) { cableTier1 = `${size}mm²`; break; } }

    const breakerTier2 = standardBreakers.find(size => size >= (acCurrent * 1.2));
    let cableTier2 = 'Consulte';
    for (const size of cableSizes) { if (cableAmpacityFromNBR[size] >= breakerTier2) { cableTier2 = `${size}mm²`; break; } }

    return `
        <h3 class="text-xl font-bold text-white mb-3">Dimensionamento Lado CA (por Inversor)</h3>
        <p class="text-sm text-gray-400 mb-2">Corrente de Saída CA Aproximada: <span class="font-bold text-gray-200">${acCurrent.toFixed(2)} A</span></p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="bg-gray-900/50 p-4 rounded-lg">
                <h4 class="font-bold text-sky-400">Opção 1 (Premium: Schneider, Siemens)</h4>
                <p class="mt-2 text-gray-300"><strong class="text-gray-400">Disjuntor:</strong> <span class="font-bold text-white">${breakerType} ${breakerTier1} A</span></p>
                <p class="text-gray-300"><strong class="text-gray-400">Cabeamento:</strong> <span class="font-bold text-white">${cableTier1}</span></p>
            </div>
            <div class="bg-gray-900/50 p-4 rounded-lg">
                <h4 class="font-bold text-sky-400">Opção 2 (Entrada: Steck, WEG, JG)</h4>
                <p class="mt-2 text-gray-300"><strong class="text-gray-400">Disjuntor:</strong> <span class="font-bold text-white">${breakerType} ${breakerTier2} A</span></p>
                <p class="text-gray-300"><strong class="text-gray-400">Cabeamento:</strong> <span class="font-bold text-white">${cableTier2}</span></p>
            </div>
        </div>`;
}

function generateVoltageDropHTML(inputs) {
    const { moduleCount, inverterCount, mpptCount, stringsPerMppt, moduleVmp, moduleImp, cableDistance, dcCableSize } = inputs;
    const modulesPerInverter = moduleCount / inverterCount;
    const totalStringsPerInverter = mpptCount * stringsPerMppt;
    const baseModulesPerString = Math.floor(modulesPerInverter / totalStringsPerInverter);
    const remainderModules = modulesPerInverter % totalStringsPerInverter;
    const longestStringLength = baseModulesPerString + (remainderModules > 0 ? 1 : 0);

    const COPPER_RESISTIVITY = 0.0172;
    const stringVmp = longestStringLength * moduleVmp;
    const stringImp = moduleImp;
    const totalWireLength = 2 * cableDistance;
    const cableResistance = (COPPER_RESISTIVITY * totalWireLength) / dcCableSize;
    const voltageDropV = stringImp * cableResistance;
    const voltageDropPercent = (voltageDropV / stringVmp) * 100;

    let statusClass = 'bg-red-900/70 text-red-300', statusText = `REPROVADO (> 2%)`;
    if (voltageDropPercent <= 2) {
        statusClass = 'bg-green-900/50 text-green-300';
        statusText = 'APROVADO';
    }

    return `
        <div class="mt-4 p-4 rounded-lg bg-gray-900/50">
            <h4 class="font-bold text-sky-400">Análise de Queda de Tensão CC</h4>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2 text-sm">
                <p><strong class="text-gray-400 block">Cabo Testado</strong><span class="font-semibold text-white">${dcCableSize}mm² @ ${cableDistance}m</span></p>
                <p><strong class="text-gray-400 block">Pior Caso (String)</strong><span class="font-semibold text-white">${longestStringLength} módulos</span></p>
                <p><strong class="text-gray-400 block">Queda de Tensão</strong><span class="font-semibold text-white">${voltageDropV.toFixed(2)} V (${voltageDropPercent.toFixed(2)}%)</span></p>
                <div class="p-2 text-center rounded ${statusClass} flex items-center justify-center"><strong class="font-bold">${statusText}</strong></div>
            </div>
        </div>`;
}

function generateReportHTML({ inputs, monthlyGeneration, totalAnnualGeneration, modulesPerInverter, powerRatioPercent, minModulesString, maxModulesString, vocCorrected }) {
    let overloadWarningHTML = '';
    if ((powerRatioPercent / 100) > (1 + (inputs.overload / 100))) {
        overloadWarningHTML = `<div class="bg-yellow-900/70 text-yellow-300 p-4 rounded-lg mt-4"><strong class="font-bold">Aviso de Overload:</strong> O overload calculado (${powerRatioPercent.toFixed(1)}%) excede o limite de ${inputs.overload}% definido.</div>`;
    }
    const acSizingHTML = generateACSizingHTML(inputs.inverterPower, inputs.gridType);
    let dcSizingHTML = `<h3 class="text-xl font-bold text-white mt-4 mb-3">Dimensionamento Lado CC (por Inversor)</h3><div class="space-y-3 text-sm"><div class="bg-green-900/50 text-green-300 p-4 rounded-lg"><strong class="font-bold text-base">Range Válido por String:</strong> Entre <strong class="text-white">${minModulesString}</strong> e <strong class="text-white">${maxModulesString}</strong> módulos.</div><p><strong class="text-gray-400">Tensão Máx. String (Frio):</strong> <strong class="text-white">${(maxModulesString * vocCorrected).toFixed(2)}V</strong> (Limite: ${inputs.inverterMaxV}V)</p></div>`;
    if (inputs.enableVdropCalc) {
        dcSizingHTML += generateVoltageDropHTML(inputs);
    }
    const arrangementHTML = generateArrangementHTML(inputs);
    const generationHTML = `<div class="mt-6 h-80 relative"><canvas id="generationChart"></canvas></div>` + generateGenerationTableHTML(monthlyGeneration);
    return `
        <div id="textResults">
            <h2 class="text-2xl font-bold text-white mb-4">Resultado da Validação Técnica</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <p><strong class="text-gray-400 block">Configuração por Inversor:</strong> <span class="text-lg font-semibold">${modulesPerInverter} módulos de ${inputs.modulePower}Wp</span></p>
                <p><strong class="text-gray-400 block">Overload (Ratio) Calculado:</strong> <span class="text-lg font-semibold">${powerRatioPercent.toFixed(1)}%</span></p>
            </div>
            ${overloadWarningHTML}<hr class="border-gray-700 my-4">${acSizingHTML}${dcSizingHTML}${arrangementHTML}
        </div>
        ${generationHTML}
        <div class="mt-8"><button id="pdf-button" onclick="generatePdf()" class="w-full cta-button green">Gerar Relatório Técnico</button></div>`;
}

function generateArrangementHTML(inputs) {
    let html = '';
    const modulesPerInverter = inputs.moduleCount / inputs.inverterCount;
    const totalStringsPerInverter = inputs.mpptCount * inputs.stringsPerMppt;
    const baseModulesPerString = Math.floor(modulesPerInverter / totalStringsPerInverter);
    const remainderModules = modulesPerInverter % totalStringsPerInverter;
    const mpptLayout = []; let remainderCounter = remainderModules;
    for (let i = 0; i < inputs.mpptCount; i++) {
        const stringsInMppt = [];
        for (let j = 0; j < inputs.stringsPerMppt; j++) { stringsInMppt.push(baseModulesPerString + (remainderCounter > 0 ? 1 : 0)); if (remainderCounter > 0) remainderCounter--; }
        mpptLayout.push({ strings: stringsInMppt });
    }
    for (let i = 0; i < inputs.inverterCount; i++) {
        html += `<h3 class="text-xl font-bold text-white mt-6 mb-3">Arranjo e Diagrama - Inversor ${i + 1} de ${inputs.inverterCount}</h3>`;
        let arrangementSuggestion = `<p>Sugestão de arranjo balanceado:</p><ul class="list-disc list-inside">`;
        mpptLayout.forEach((mppt, mpptIdx) => { arrangementSuggestion += `<li>MPPT ${mpptIdx + 1}: ${mppt.strings.length} string(s) com ${mppt.strings.join(' e ')} módulos.</li>`; });
        html += `<div class="bg-gray-700 p-4 rounded-lg text-sm">${arrangementSuggestion}</ul></div>`;
        if (inputs.stringsPerMppt === 1 && inputs.mpptCount <= 2) { html += generateSimpleSvgDiagram({ mpptLayout }, inputs.inverterPower); }
        else { html += generateComplexSvgDiagram({ mpptLayout }, inputs.inverterPower); }
    }
    return html;
}

function generateSimpleSvgDiagram(arrangement, inverterPower) {
    const mpptLayout = arrangement.mpptLayout; const inverterLabel = `Inversor ${inverterPower / 1000}kW`; let svgElements = ''; let currentY = 30;
    const moduleWidth = 40, moduleHeight = 60, moduleSpacingX = 5, mpptSpacingY = 40, mpptLabelOffset = 30, inverterWidth = 100, inverterHeight = 80, inverterConnectionOffset = 20;
    svgElements += `<defs><linearGradient id="moduleGradient" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#3b82f6" /><stop offset="100%" stop-color="#2563eb" /></linearGradient></defs>`;
    const maxModulesInString = Math.max(0, ...mpptLayout.flatMap(mppt => mppt.strings)); const modulesSectionWidth = mpptLabelOffset + (maxModulesInString * (moduleWidth + moduleSpacingX));
    const inverterX = modulesSectionWidth + inverterConnectionOffset; const svgWidth = inverterX + inverterWidth + 20; let mpptMidYPoints = [];
    mpptLayout.forEach((mppt, mpptIndex) => {
        const modulesPerString = mppt.strings[0]; const mpptY = currentY; const mpptMidY = mpptY + moduleHeight / 2; mpptMidYPoints.push(mpptMidY);
        svgElements += `<text x="${mpptLabelOffset - 15}" y="${mpptMidY}" class="label mppt-label-text">${mpptIndex + 1}</text>`; let currentX = mpptLabelOffset;
        for (let j = 0; j < modulesPerString; j++) {
            svgElements += `<rect x="${currentX}" y="${mpptY}" width="${moduleWidth}" height="${moduleHeight}" rx="4" ry="4" class="module" />`;
            if (j > 0) { svgElements += `<line x1="${currentX - moduleSpacingX}" y1="${mpptMidY}" x2="${currentX}" y2="${mpptMidY}" class="wire wire-pos" />`; }
            currentX += moduleWidth + moduleSpacingX;
        }
        const mpptEndX = currentX - moduleSpacingX;
        svgElements += `<text x="${mpptLabelOffset + 5}" y="${mpptMidY}" class="label polo-pos">+</text><text x="${mpptEndX - 5}" y="${mpptMidY}" class="label polo-neg">-</text>`;
        svgElements += `<line x1="${mpptEndX}" y1="${mpptMidY}" x2="${inverterX - inverterConnectionOffset / 2}" y2="${mpptMidY}" class="wire" />`; currentY += moduleHeight + mpptSpacingY;
    });
    const totalDrawingHeight = currentY - mpptSpacingY; const inverterY = (totalDrawingHeight - inverterHeight) / 2 + 15;
    if (mpptMidYPoints.length > 0) {
        const firstMpptY = mpptMidYPoints[0]; const lastMpptY = mpptMidYPoints[mpptMidYPoints.length - 1];
        svgElements += `<line x1="${inverterX - inverterConnectionOffset / 2}" y1="${firstMpptY}" x2="${inverterX - inverterConnectionOffset / 2}" y2="${lastMpptY}" class="wire wire-green" />`;
        svgElements += `<line x1="${inverterX - inverterConnectionOffset / 2}" y1="${inverterY + inverterHeight / 2}" x2="${inverterX}" y2="${inverterY + inverterHeight / 2}" class="wire wire-green" />`;
        mpptMidYPoints.forEach(midY => { svgElements += `<line x1="${mpptLabelOffset}" y1="${midY}" x2="${inverterX - inverterConnectionOffset / 2}" y2="${midY}" class="wire wire-pos" />`; });
    }
    svgElements += `<rect x="${inverterX}" y="${inverterY}" width="${inverterWidth}" height="${inverterHeight}" class="inverter" /><text x="${inverterX + inverterWidth / 2}" y="${inverterY + inverterHeight / 2 + 4}" class="label inverter-label">${inverterLabel}</text>`;
    return `<div class="bg-gray-900/70 p-4 rounded-lg overflow-x-auto"><svg width="${svgWidth}" height="${totalDrawingHeight + 30}" xmlns="http://www.w3.org/2000/svg"><style>.module{fill:url(#moduleGradient);stroke:#60a5fa;stroke-width:1.5}.inverter{fill:#334155;stroke:#64748b;stroke-width:2;rx:8;ry:8}.wire{stroke:#94a3b8;stroke-width:2;fill:none}.wire-pos{stroke:#f87171;stroke-width:2}.wire-green{stroke:#4ade80;stroke-width:2}.label{font-family:sans-serif;font-size:12px;fill:#e5e7eb;text-anchor:middle;dominant-baseline:central}.mppt-label-text{font-weight:bold;fill:#61dafb;font-size:16px}.inverter-label{font-size:14px;font-weight:bold;fill:#cbd5e1}.polo-pos{fill:#f87171;font-weight:bold;font-size:16px}.polo-neg{fill:#94a3b8;font-weight:bold;font-size:16px}</style>${svgElements}</svg></div>`;
}

function generateComplexSvgDiagram(arrangement, inverterPower) {
    const mpptLayout = arrangement.mpptLayout; const moduleWidth = 40, moduleHeight = 60, moduleSpacingX = 5, stringSpacingY = 15, mpptSpacingY = 30, mpptLabelOffset = 60;
    const inverterWidth = 100, inverterHeight = 80, inverterMarginRight = 60; const inverterLabel = `Inversor ${inverterPower / 1000}kW`; let svgElements = '', currentY = 30;
    svgElements += `<defs><linearGradient id="moduleGradient" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#3b82f6" /><stop offset="100%" stop-color="#2563eb" /></linearGradient></defs>`;
    const maxModulesInString = Math.max(0, ...mpptLayout.flatMap(mppt => mppt.strings)); const contentWidth = mpptLabelOffset + (maxModulesInString * (moduleWidth + moduleSpacingX));
    const svgWidth = contentWidth + inverterWidth + inverterMarginRight + 40; const busX = contentWidth + 40; let mpptBusCollectorPoints = [];
    mpptLayout.forEach((mppt, mpptIndex) => {
        const mpptStartY = currentY; const numStrings = mppt.strings.length; let mpptBusYPoints = [];
        svgElements += `<text x="${mpptLabelOffset - 50}" y="${mpptStartY + ((numStrings * (moduleHeight + stringSpacingY)) / 2) - (stringSpacingY / 2)}" class="label mppt-label-text">MPPT ${mpptIndex + 1}</text>`;
        mppt.strings.forEach(modulesPerString => {
            const stringY = currentY; const stringMidY = stringY + moduleHeight / 2; const diff = maxModulesInString - modulesPerString; const offsetX = diff * (moduleWidth + moduleSpacingX);
            const stringStartX = mpptLabelOffset + offsetX; let currentX = stringStartX;
            for (let j = 0; j < modulesPerString; j++) { svgElements += `<rect x="${currentX}" y="${stringY}" width="${moduleWidth}" height="${moduleHeight}" rx="4" ry="4" class="module" />`; if (j > 0) svgElements += `<line x1="${currentX - moduleSpacingX}" y1="${stringMidY}" x2="${currentX}" y2="${stringMidY}" class="wire" />`; currentX += moduleWidth + moduleSpacingX; }
            const stringEndX = currentX - moduleSpacingX; const mpptBusEndX = contentWidth - moduleSpacingX + 15;
            svgElements += `<line x1="${stringStartX}" y1="${stringMidY}" x2="${stringStartX - 15}" y2="${stringMidY}" class="wire wire-pos" />`;
            svgElements += `<line x1="${stringEndX}" y1="${stringMidY}" x2="${mpptBusEndX}" y2="${stringMidY}" class="wire" />`;
            svgElements += `<text x="${stringStartX + 5}" y="${stringMidY}" class="label polo-pos">+</text><text x="${stringEndX - 5}" y="${stringMidY}" class="label polo-neg">-</text>`; mpptBusYPoints.push(stringMidY); currentY += moduleHeight + stringSpacingY;
        });
        const mpptBusStartX = mpptLabelOffset - 15; const mpptBusEndX = contentWidth - moduleSpacingX + 15; const busLineStartY = mpptBusYPoints[0]; const busLineEndY = mpptBusYPoints[mpptBusYPoints.length - 1];
        svgElements += `<line x1="${mpptBusStartX}" y1="${busLineStartY}" x2="${mpptBusStartX}" y2="${busLineEndY}" class="wire wire-pos" />`; svgElements += `<line x1="${mpptBusEndX}" y1="${busLineStartY}" x2="${mpptBusEndX}" y2="${busLineEndY}" class="wire" />`;
        const mpptMidPointY = (busLineStartY + busLineEndY) / 2; mpptBusCollectorPoints.push({ x: mpptBusStartX, y: mpptMidPointY, type: 'pos' }); mpptBusCollectorPoints.push({ x: mpptBusEndX, y: mpptMidPointY, type: 'neg' });
        currentY += mpptSpacingY - stringSpacingY;
    });
    const totalDrawingHeight = currentY - mpptSpacingY; const inverterY = (totalDrawingHeight - inverterHeight) / 2, inverterX = busX + 20;
    mpptBusCollectorPoints.forEach(point => { svgElements += `<line x1="${point.x}" y1="${point.y}" x2="${busX}" y2="${point.y}" class="wire ${point.type === 'pos' ? 'wire-pos' : ''}" />`; });
    const busStartY = mpptBusCollectorPoints.length > 0 ? mpptBusCollectorPoints.map(p => p.y).reduce((a, b) => Math.min(a, b), Infinity) : 0; const busEndY = mpptBusCollectorPoints.length > 0 ? mpptBusCollectorPoints.map(p => p.y).reduce((a, b) => Math.max(a, b), -Infinity) : 0;
    if (mpptLayout.length > 0) {
        svgElements += `<line x1="${busX}" y1="${busStartY}" x2="${busX}" y2="${busEndY}" class="wire-bus" />`;
        svgElements += `<line x1="${busX}" y1="${inverterY + inverterHeight / 2}" x2="${inverterX}" y2="${inverterY + inverterHeight / 2}" class="wire-to-inverter" />`;
    }
    return `<div class="bg-gray-900/70 p-4 rounded-lg overflow-x-auto"><svg width="${svgWidth}" height="${totalDrawingHeight + 20}" xmlns="http://www.w3.org/2000/svg"><style>.module{fill:url(#moduleGradient);stroke:#60a5fa;stroke-width:1.5}.inverter{fill:#334155;stroke:#64748b;stroke-width:2;rx:8;ry:8}.wire{stroke:#94a3b8;stroke-width:2;fill:none}.wire-pos{stroke:#f87171}.wire-bus{stroke:#4ade80;stroke-width:4}.wire-to-inverter{stroke:#e5e7eb;stroke-width:3}.label{font-family:sans-serif;font-size:12px;fill:#e5e7eb;text-anchor:middle;dominant-baseline:central}.mppt-label-text{font-weight:bold;text-anchor:end;fill:#61dafb;font-size:13px}.inverter-label{font-size:14px;font-weight:bold;fill:#cbd5e1}.polo-pos{fill:#f87171;font-weight:bold;font-size:16px}.polo-neg{fill:#94a3b8;font-weight:bold;font-size:16px}</style>${svgElements}<rect x="${inverterX}" y="${inverterY}" width="${inverterWidth}" height="${inverterHeight}" class="inverter" /><text x="${inverterX + inverterWidth / 2}" y="${inverterY + inverterHeight / 2 + 4}" class="label inverter-label">${inverterLabel}</text></svg></div>`;
}

// --- FUNÇÕES DE UTILIDADE ---

function clearData() {
    if (confirm('Tem certeza que deseja limpar os campos do formulário?')) {
        document.getElementById('solar-form').reset();
        document.getElementById('results').classList.add('hidden');
        document.getElementById('save-button').classList.add('hidden');
    }
}

function createGenerationChart(generationData, totalAnnualGeneration) {
    const chartEl = document.getElementById('generationChart');
    if (!chartEl) return;
    const ctx = chartEl.getContext('2d');
    if (generationChartInstance) generationChartInstance.destroy();
    generationChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
            datasets: [{
                label: 'Geração Mensal (kWh)',
                data: generationData,
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                borderColor: 'rgba(96, 165, 250, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `Estimativa de Geração Anual: ${totalAnnualGeneration.toFixed(0)} kWh`,
                    color: '#e5e7eb',
                    font: {
                        size: 18
                    }
                },
                legend: {
                    labels: {
                        color: '#d1d5db'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Energia Gerada (kWh)',
                        color: '#9ca3af'
                    },
                    ticks: {
                        color: '#d1d5db'
                    },
                    grid: {
                        color: 'rgba(156, 163, 175, 0.2)'
                    }
                },
                x: {
                    ticks: {
                        color: '#d1d5db'
                    },
                    grid: {
                        color: 'rgba(156, 163, 175, 0.1)'
                    }
                }
            }
        }
    });
}

function generateGenerationTableHTML(monthlyData) {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    let tableHTML = `<h3 class="text-xl font-bold text-white mt-8 mb-3">Detalhes da Geração Mensal (kWh)</h3><div class="overflow-x-auto relative rounded-lg bg-gray-900/50"><table class="w-full text-sm text-center text-gray-400"><thead class="text-xs text-gray-300 uppercase bg-gray-700/50"><tr>`;
    months.forEach(month => {
        tableHTML += `<th scope="col" class="py-3 px-4">${month}</th>`;
    });
    tableHTML += `</tr></thead><tbody><tr class="border-b border-gray-700">`;
    monthlyData.forEach(generation => {
        tableHTML += `<td class="py-4 px-4 font-medium text-gray-100 whitespace-nowrap">${generation.toFixed(1)}</td>`;
    });
    tableHTML += `</tr></tbody></table></div>`;
    return tableHTML;
}

function generatePdf() {
    const { jsPDF } = window.jspdf;
    const resultsToPrint = document.getElementById('results');
    const pdfButton = document.getElementById('pdf-button');
    if (pdfButton) {
        pdfButton.innerText = 'Gerando PDF...';
        pdfButton.disabled = true;
        pdfButton.style.display = 'none';
    }
    html2canvas(resultsToPrint, {
        scale: 2,
        backgroundColor: '#1f2937', // Cor de fundo do container de resultados
        useCORS: true
    }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('relatorio-agilsolar.pdf');
        if (pdfButton) {
            pdfButton.style.display = 'block';
            pdfButton.innerText = 'Gerar Relatório Técnico';
            pdfButton.disabled = false;
        }
    });
}

// --- INICIALIZAÇÃO DA PÁGINA ---
function initialize() {
    document.getElementById('calculate-button').addEventListener('click', calculate);
    document.getElementById('clear-button').addEventListener('click', clearData);
    document.getElementById('save-button').addEventListener('click', updateProject);
    document.getElementById('solar-form').addEventListener('submit', (e) => e.preventDefault());
    document.getElementById('enableVdropCalc').addEventListener('change', function () {
        document.getElementById('vdrop-inputs').classList.toggle('hidden', !this.checked);
    });
    loadProjectData();
}

document.addEventListener('DOMContentLoaded', initialize);