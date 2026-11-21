// Gerador 3D (somente administrador): foto → modelo 3D com IA grátis (Hugging Face) → ajustes → STL.
// Carregado sob demanda pela aba "Gerador 3D" do index.html.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { soldarVertices, montarPeca, gerarStlBinario } from './malha.js';

const GRADIO_URL = 'https://cdn.jsdelivr.net/npm/@gradio/client@2.8.0/dist/browser.js';
const MANIFOLD_URL = 'https://cdn.jsdelivr.net/npm/manifold-3d@3.5.5/manifold.js';
const MOTORES = {
    'tencent/Hunyuan3D-2': 'Hunyuan3D 2.0 (Tencent)',
    'tencent/Hunyuan3D-2.1': 'Hunyuan3D 2.1 (Tencent)',
};
const QUALIDADES = {
    rapida: { rotulo: 'Rápida (~1 min)', steps: 5, octree: 256 },
    normal: { rotulo: 'Normal', steps: 10, octree: 256 },
    caprichada: { rotulo: 'Caprichada (gasta mais cota)', steps: 30, octree: 384 },
};
const CHAVE_TOKEN = 'g3d_hf_token';
const DENSIDADE_PETG = 1.27; // g/cm³

let W = null;            // módulo manifold
let original = null;     // { vert, tri } já em Z para cima
let resultado = null;    // saída de montarPeca
let glbOriginal = null;  // ArrayBuffer do último GLB (para baixar)
let nomePeca = 'peca';
let rotacao = [0, 0, 0];
let cena, camera, renderer, controles, malhaVisivel, iniciado = false;
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function iniciar(el, { ehAdmin } = {}) {
    if (!ehAdmin) { el.innerHTML = '<p class="text-sm text-inkmute">Esta ferramenta é exclusiva do administrador.</p>'; return; }
    if (iniciado) { redimensionar(); return; }
    iniciado = true;
    el.innerHTML = html();
    ligarEventos();
    iniciarVisualizador();
    listarHistorico();
    try {
        const Module = (await import(MANIFOLD_URL)).default;
        W = await Module(); W.setup();
    } catch (e) {
        console.error(e);
        aviso('Não consegui carregar o motor de geometria (manifold). Recarregue a página.', 'erro');
    }
}

// ---------------- TELA ----------------
function html() {
    const inp = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm';
    const num = (id, v, step = 0.1) => `<input id="${id}" type="number" step="${step}" value="${v}" class="${inp} g3d-aj">`;
    const chk = (id, rot, marcado = false) => `<label class="flex items-center gap-2 font-semibold text-sm text-ink"><input id="${id}" type="checkbox" class="g3d-aj h-4 w-4 accent-emerald-600" ${marcado ? 'checked' : ''}>${rot}</label>`;
    return `
    <div class="rounded-3xl p-6 sm:p-8 text-white" style="background:linear-gradient(135deg,#0b2b22 0%,#0f3d30 55%,#0a1f1a 100%)">
        <h2 class="font-display text-3xl sm:text-4xl font-bold tracking-tight" style="color:#fff !important">Gerador 3D com IA</h2>
        <p class="text-sm text-white/75 mt-2 max-w-2xl">Mande uma foto, a IA gera o modelo 3D e aqui você ajusta tamanho, base, argola de chaveiro e furo de ímã antes de baixar o STL. Usa a IA grátis do Hugging Face — tem fila e limite diário de uso.</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <div class="bg-surface rounded-2xl border border-line p-5 space-y-4">
            <div class="flex gap-2">
                <button type="button" data-modo="foto" class="g3d-modo flex-1 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white">📷 Foto → 3D</button>
                <button type="button" data-modo="arquivo" class="g3d-modo flex-1 py-2 rounded-lg text-sm font-bold bg-surface2 text-ink">📂 Abrir arquivo</button>
            </div>

            <div id="g3dPainelFoto" class="space-y-3">
                <label class="block">
                    <span class="text-xs font-bold text-inkmute uppercase">Foto da referência</span>
                    <input id="g3dFoto" type="file" accept="image/*" class="mt-1 block w-full text-sm">
                </label>
                <img id="g3dFotoPrev" class="hidden w-full max-h-56 object-contain rounded-xl border border-line bg-surface2" alt="Pré-visualização da foto">
                <p class="text-xs text-inkmute">Dica: objeto inteiro, de frente, fundo limpo e boa luz. Uma peça por foto.</p>
                <div class="grid grid-cols-2 gap-3">
                    <label class="block"><span class="text-xs font-bold text-inkmute uppercase">Motor</span>
                        <select id="g3dMotor" class="${inp} mt-1">${Object.entries(MOTORES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
                    <label class="block"><span class="text-xs font-bold text-inkmute uppercase">Qualidade</span>
                        <select id="g3dQualidade" class="${inp} mt-1">${Object.entries(QUALIDADES).map(([k, v]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${v.rotulo}</option>`).join('')}</select></label>
                </div>
                <label class="flex items-center gap-2 text-sm font-semibold text-ink"><input id="g3dRembg" type="checkbox" checked class="h-4 w-4 accent-emerald-600">Remover o fundo da foto automaticamente</label>
                <details class="text-sm">
                    <summary class="cursor-pointer font-bold text-ink">🔑 Token do Hugging Face (opcional, aumenta a cota grátis)</summary>
                    <div class="mt-2 space-y-2">
                        <p class="text-xs text-inkmute">Sem token a cota diária é bem pequena. Crie uma conta grátis em huggingface.co, vá em <b>Settings → Access Tokens</b>, crie um token do tipo <b>Read</b> e cole aqui. Ele fica salvo só neste navegador.</p>
                        <input id="g3dToken" type="password" placeholder="hf_..." class="${inp}" autocomplete="off">
                    </div>
                </details>
                <button id="g3dGerar" type="button" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold disabled:opacity-50">✨ Gerar modelo 3D</button>
            </div>

            <div id="g3dPainelArquivo" class="hidden space-y-3">
                <p class="text-sm text-inkmute">Abra um modelo que você já tem (GLB, STL ou OBJ) para ajustar e adicionar base, chaveiro ou ímã. Útil também quando a cota da IA acabar: gere direto no site do Hugging Face, baixe o GLB e abra aqui.</p>
                <input id="g3dArquivo" type="file" accept=".glb,.gltf,.stl,.obj" class="block w-full text-sm">
            </div>
            <div id="g3dStatus" class="hidden text-sm rounded-xl px-3 py-2"></div>
        </div>

        <div class="bg-surface rounded-2xl border border-line p-5 space-y-3">
            <h3 class="font-display font-bold text-ink">🕘 Gerados recentemente</h3>
            <p class="text-xs text-inkmute">Os últimos modelos ficam guardados neste navegador para você não gastar cota de novo.</p>
            <div id="g3dHistorico" class="space-y-2 text-sm"></div>
        </div>
      </div>

      <div class="lg:col-span-3 space-y-6">
        <div class="bg-surface rounded-2xl border border-line p-3">
            <div id="g3dVisor" class="relative w-full rounded-xl overflow-hidden bg-surface2" style="position:relative;height:min(62vh,440px)">
                <div id="g3dVazio" class="absolute inset-0 flex items-center justify-center text-sm text-inkmute text-center p-6">O modelo aparece aqui. Arraste para girar, role para dar zoom.</div>
            </div>
            <div class="flex flex-wrap gap-2 mt-3 text-sm">
                <span class="font-bold text-inkmute self-center mr-1">Girar 90°:</span>
                <button type="button" data-rot="0" class="g3d-rot px-3 py-1.5 rounded-lg border border-line bg-surface2 font-bold">X</button>
                <button type="button" data-rot="1" class="g3d-rot px-3 py-1.5 rounded-lg border border-line bg-surface2 font-bold">Y</button>
                <button type="button" data-rot="2" class="g3d-rot px-3 py-1.5 rounded-lg border border-line bg-surface2 font-bold">Z</button>
                <button type="button" id="g3dRotZero" class="px-3 py-1.5 rounded-lg border border-line bg-surface2">Desfazer giros</button>
            </div>
            <div id="g3dInfo" class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center"></div>
            <div id="g3dAvisos" class="mt-2 space-y-1"></div>
        </div>

        <div class="bg-surface rounded-2xl border border-line p-5 space-y-5">
            <h3 class="font-display font-bold text-ink">🛠️ Ajustes para impressão</h3>
            <div class="grid grid-cols-2 gap-3">
                <label class="block"><span class="text-xs font-bold text-inkmute uppercase">Tamanho (mm)</span>${num('g3dTamanho', 60, 1)}</label>
                <label class="block"><span class="text-xs font-bold text-inkmute uppercase">Medida</span>
                    <select id="g3dMedida" class="${inp} g3d-aj"><option value="altura">Altura da peça</option><option value="maior">Maior lado</option></select></label>
            </div>

            <div class="space-y-2 border-t border-line pt-4">
                ${chk('g3dBase', '🏆 Base (troféu / suporte)')}
                <div class="grid grid-cols-3 gap-3">
                    <label class="block"><span class="text-xs text-inkmute">Formato</span><select id="g3dBaseForma" class="${inp} g3d-aj"><option value="redonda">Redonda</option><option value="retangular">Retangular</option></select></label>
                    <label class="block"><span class="text-xs text-inkmute">Altura (mm)</span>${num('g3dBaseAlt', 4)}</label>
                    <label class="block"><span class="text-xs text-inkmute">Sobra (mm)</span>${num('g3dBaseMarg', 4)}</label>
                </div>
            </div>

            <div class="space-y-2 border-t border-line pt-4">
                ${chk('g3dChav', '🔑 Argola de chaveiro (no ponto mais alto)')}
                <div class="grid grid-cols-2 gap-3">
                    <label class="block"><span class="text-xs text-inkmute">Furo (mm)</span>${num('g3dChavFuro', 5)}</label>
                    <label class="block"><span class="text-xs text-inkmute">Espessura (mm)</span>${num('g3dChavEsp', 2.5)}</label>
                </div>
            </div>

            <div class="space-y-2 border-t border-line pt-4">
                ${chk('g3dIma', '🧲 Furo para ímã (embaixo, no centro)')}
                <div class="grid grid-cols-3 gap-3">
                    <label class="block"><span class="text-xs text-inkmute">Diâmetro (mm)</span>${num('g3dImaDiam', 6)}</label>
                    <label class="block"><span class="text-xs text-inkmute">Profund. (mm)</span>${num('g3dImaProf', 2)}</label>
                    <label class="block"><span class="text-xs text-inkmute">Folga (mm)</span>${num('g3dImaFolga', 0.2, 0.05)}</label>
                </div>
            </div>

            <div class="space-y-2 border-t border-line pt-4">
                ${chk('g3dPass', '🧵 Furo passante (cordão / arame, de lado a lado)')}
                <div class="grid grid-cols-2 gap-3">
                    <label class="block"><span class="text-xs text-inkmute">Diâmetro (mm)</span>${num('g3dPassDiam', 2)}</label>
                    <label class="block"><span class="text-xs text-inkmute">Altura (% da peça)</span>${num('g3dPassAlt', 50, 1)}</label>
                </div>
            </div>

            <div class="flex flex-col sm:flex-row gap-2 border-t border-line pt-4">
                <input id="g3dNome" type="text" placeholder="Nome do arquivo" class="${inp} sm:flex-1">
                <button id="g3dBaixar" type="button" disabled class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold disabled:opacity-50">⬇️ Baixar STL</button>
                <button id="g3dBaixarGlb" type="button" disabled class="px-4 py-2.5 rounded-xl border border-line bg-surface2 text-ink font-bold disabled:opacity-50" title="Arquivo original da IA, sem ajustes">GLB original</button>
            </div>
        </div>
      </div>
    </div>`;
}

function aviso(txt, tipo = 'info') {
    const s = $('g3dStatus');
    if (!txt) { s.classList.add('hidden'); return; }
    const cores = { info: 'bg-sky-50 text-sky-800 border border-sky-200', ok: 'bg-emerald-50 text-emerald-800 border border-emerald-200', erro: 'bg-red-50 text-red-700 border border-red-200' };
    s.className = 'text-sm rounded-xl px-3 py-2 ' + cores[tipo];
    s.innerHTML = txt;
}

function ligarEventos() {
    document.querySelectorAll('.g3d-modo').forEach(b => b.addEventListener('click', () => {
        const foto = b.dataset.modo === 'foto';
        $('g3dPainelFoto').classList.toggle('hidden', !foto);
        $('g3dPainelArquivo').classList.toggle('hidden', foto);
        document.querySelectorAll('.g3d-modo').forEach(x => {
            const ativo = x === b;
            x.classList.toggle('bg-emerald-600', ativo); x.classList.toggle('text-white', ativo);
            x.classList.toggle('bg-surface2', !ativo); x.classList.toggle('text-ink', !ativo);
        });
    }));
    $('g3dToken').value = lerLocal(CHAVE_TOKEN) || '';
    $('g3dToken').addEventListener('change', e => salvarLocal(CHAVE_TOKEN, e.target.value.trim()));
    $('g3dFoto').addEventListener('change', e => {
        const f = e.target.files[0]; const img = $('g3dFotoPrev');
        if (!f) { img.classList.add('hidden'); return; }
        img.src = URL.createObjectURL(f); img.classList.remove('hidden');
        if (!$('g3dNome').value) $('g3dNome').value = f.name.replace(/\.[^.]+$/, '');
    });
    $('g3dGerar').addEventListener('click', gerarComIA);
    $('g3dArquivo').addEventListener('change', e => { const f = e.target.files[0]; if (f) abrirArquivo(f); });
    document.querySelectorAll('.g3d-rot').forEach(b => b.addEventListener('click', () => { const i = +b.dataset.rot; rotacao[i] = (rotacao[i] + 90) % 360; atualizar(); }));
    $('g3dRotZero').addEventListener('click', () => { rotacao = [0, 0, 0]; atualizar(); });
    let t;
    document.querySelectorAll('.g3d-aj').forEach(i => i.addEventListener(i.type === 'checkbox' || i.tagName === 'SELECT' ? 'change' : 'input', () => { clearTimeout(t); t = setTimeout(atualizar, 350); }));
    $('g3dBaixar').addEventListener('click', baixarStl);
    $('g3dBaixarGlb').addEventListener('click', () => glbOriginal && baixar(new Blob([glbOriginal], { type: 'model/gltf-binary' }), nomeArquivo() + '.glb'));
}

function lerLocal(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function salvarLocal(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { } }

// ---------------- IA (Hugging Face Space via Gradio) ----------------
async function gerarComIA() {
    const foto = $('g3dFoto').files[0];
    if (!foto) { aviso('Escolha uma foto primeiro.', 'erro'); return; }
    const btn = $('g3dGerar');
    const espaco = $('g3dMotor').value;
    const q = QUALIDADES[$('g3dQualidade').value];
    const token = $('g3dToken').value.trim();
    salvarLocal(CHAVE_TOKEN, token);
    btn.disabled = true;
    const inicio = Date.now();
    try {
        aviso('Conectando à IA no Hugging Face…');
        const { Client, handle_file } = await import(GRADIO_URL);
        const app = await Client.connect(espaco, token.startsWith('hf_') ? { token } : {});
        const job = app.submit('/shape_generation', {
            image: handle_file(foto),
            steps: q.steps,
            octree_resolution: q.octree,
            check_box_rembg: $('g3dRembg').checked,
            randomize_seed: true,
        });
        let dados = null;
        for await (const ev of job) {
            if (ev.type === 'status') {
                const s = Math.round((Date.now() - inicio) / 1000);
                if (ev.stage === 'error') throw new Error(ev.message || 'Erro na IA');
                if (ev.stage === 'pending' && ev.position != null) aviso(`⏳ Na fila: posição ${ev.position + 1}${ev.eta ? ` (≈${Math.round(ev.eta)} s)` : ''}… ${s}s`);
                else if (ev.stage !== 'complete') aviso(`🧠 Gerando o modelo… ${s}s (costuma levar de 30 s a 2 min)`);
            }
            if (ev.type === 'data') { dados = ev.data; break; }
        }
        const arq = dados && dados[0];
        const url = arq && (arq.url || arq);
        if (!url || typeof url !== 'string') throw new Error('A IA não devolveu um arquivo.');
        aviso('📥 Baixando o modelo…');
        let r = await fetch(url);
        if (!r.ok && token) r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
        if (!r.ok) throw new Error('Falha ao baixar o arquivo gerado (' + r.status + ').');
        const buf = await r.arrayBuffer();
        nomePeca = $('g3dNome').value.trim() || foto.name.replace(/\.[^.]+$/, '') || 'peca';
        await carregarGlb(buf);
        await salvarHistorico(nomePeca, buf);
        aviso(`✅ Modelo gerado em ${Math.round((Date.now() - inicio) / 1000)} s. Ajuste abaixo e baixe o STL.`, 'ok');
    } catch (e) {
        console.error(e);
        aviso(mensagemErro(e), 'erro');
    } finally {
        btn.disabled = false;
    }
}

function mensagemErro(e) {
    const m = String((e && (e.message || e.title)) || e || '');
    if (/quota|exceeded|GPU/i.test(m)) return '⛔ A cota grátis de GPU do Hugging Face acabou por agora. Opções: colar seu token (aumenta a cota), esperar algumas horas, trocar de motor ou gerar no site do Hugging Face e usar “Abrir arquivo”.<br><span class="text-xs opacity-80">' + esc(m) + '</span>';
    if (/sleep|paused|building|not running|Could not resolve|could not get config|metadata could not be loaded|Failed to fetch/i.test(m)) return '😴 Esse motor está fora do ar ou iniciando. Tente o outro motor ou espere alguns minutos.<br><span class="text-xs opacity-80">' + esc(m) + '</span>';
    return '❌ Não deu certo: ' + esc(m || 'erro desconhecido') + '. Tente outra foto, outro motor ou de novo em instantes.';
}

// ---------------- ARQUIVOS ----------------
async function abrirArquivo(f) {
    const ext = f.name.split('.').pop().toLowerCase();
    nomePeca = f.name.replace(/\.[^.]+$/, '');
    if (!$('g3dNome').value) $('g3dNome').value = nomePeca;
    const buf = await f.arrayBuffer();
    try {
        if (ext === 'glb' || ext === 'gltf') { await carregarGlb(buf); await salvarHistorico(nomePeca, buf); }
        else if (ext === 'stl') {
            const g = new STLLoader().parse(buf);
            glbOriginal = null;
            definirOriginal(soldarVertices(g.attributes.position.array, null), true);
        } else if (ext === 'obj') {
            const obj = new OBJLoader().parse(new TextDecoder().decode(buf));
            glbOriginal = null;
            definirOriginal(extrairMalha(obj, true), false);
        } else throw new Error('Formato não suportado');
        aviso('✅ Arquivo aberto.', 'ok');
    } catch (e) { console.error(e); aviso('❌ Não consegui abrir esse arquivo: ' + esc(e.message), 'erro'); }
}

function carregarGlb(buf) {
    return new Promise((ok, falha) => {
        new GLTFLoader().parse(buf.slice(0), '', (gltf) => {
            try { glbOriginal = buf; definirOriginal(extrairMalha(gltf.scene, true), false); ok(); } catch (e) { falha(e); }
        }, falha);
    });
}

// Junta todas as malhas da cena; converte Y-para-cima (GLB/OBJ) em Z-para-cima (impressora).
function extrairMalha(obj, yParaCima) {
    obj.updateMatrixWorld(true);
    const partes = [];
    obj.traverse(o => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        partes.push({ pos: g.attributes.position.array, idx: g.index ? g.index.array : null });
    });
    if (!partes.length) throw new Error('Nenhuma malha no arquivo');
    let total = 0; partes.forEach(p => total += (p.idx ? p.idx.length : p.pos.length / 3) * 3);
    const tudo = new Float32Array(total); let o = 0;
    partes.forEach(p => {
        const n = p.idx ? p.idx.length : p.pos.length / 3;
        for (let i = 0; i < n; i++) {
            const v = (p.idx ? p.idx[i] : i) * 3;
            const x = p.pos[v], y = p.pos[v + 1], z = p.pos[v + 2];
            if (yParaCima) { tudo[o++] = x; tudo[o++] = -z; tudo[o++] = y; } else { tudo[o++] = x; tudo[o++] = y; tudo[o++] = z; }
        }
    });
    return soldarVertices(tudo, null);
}

function definirOriginal(malha, manterTamanho) {
    original = malha;
    rotacao = [0, 0, 0];
    if (manterTamanho) {
        let min = Infinity, max = -Infinity;
        for (let i = 2; i < malha.vert.length; i += 3) { min = Math.min(min, malha.vert[i]); max = Math.max(max, malha.vert[i]); }
        $('g3dMedida').value = 'altura';
        $('g3dTamanho').value = Math.round((max - min) * 10) / 10;
    }
    $('g3dBaixarGlb').disabled = !glbOriginal;
    atualizar(true);
}

// ---------------- MONTAGEM + VISUALIZAÇÃO ----------------
const n = (id) => parseFloat($(id).value) || 0;
function lerOpcoes() {
    return {
        rotacao,
        medida: $('g3dMedida').value,
        tamanho: Math.max(1, n('g3dTamanho')),
        base: { ativo: $('g3dBase').checked, formato: $('g3dBaseForma').value, altura: Math.max(0.6, n('g3dBaseAlt')), margem: Math.max(0, n('g3dBaseMarg')) },
        chaveiro: { ativo: $('g3dChav').checked, furo: Math.max(1, n('g3dChavFuro')), espessura: Math.max(0.8, n('g3dChavEsp')) },
        ima: { ativo: $('g3dIma').checked, diametro: Math.max(1, n('g3dImaDiam')), profundidade: Math.max(0.4, n('g3dImaProf')), folga: Math.max(0, n('g3dImaFolga')) },
        passagem: { ativo: $('g3dPass').checked, diametro: Math.max(0.5, n('g3dPassDiam')), alturaPct: Math.min(100, Math.max(0, n('g3dPassAlt'))) },
    };
}

function atualizar(enquadrar = false) {
    if (!original) return;
    if (!W) { aviso('Aguarde, carregando o motor de geometria…'); setTimeout(() => atualizar(enquadrar), 800); return; }
    try {
        resultado = montarPeca(W, original, lerOpcoes());
    } catch (e) { console.error(e); aviso('❌ Erro ao montar a peça: ' + esc(e.message), 'erro'); return; }
    mostrarMalha(resultado, enquadrar);
    const [x, y, z] = resultado.dims.map(v => v.toFixed(1));
    const card = (rot, val) => `<div class="bg-surface2 rounded-lg px-2 py-2"><div class="text-[10px] uppercase font-bold text-inkmute">${rot}</div><div class="font-bold text-ink text-sm">${val}</div></div>`;
    const vol = resultado.volume ? resultado.volume / 1000 : null;
    $('g3dInfo').innerHTML = card('Tamanho (mm)', `${x} × ${y} × ${z}`) + card('Triângulos', (resultado.tri.length / 3).toLocaleString('pt-BR')) +
        card('Volume', vol ? vol.toFixed(1).replace('.', ',') + ' cm³' : '—') + card('Peso se maciço', vol ? '≈ ' + Math.round(vol * DENSIDADE_PETG) + ' g PETG' : '—');
    const av = [...resultado.avisos];
    if (resultado.dims[2] > 256 || resultado.dims[0] > 256 || resultado.dims[1] > 256) av.push('A peça passou de 256 mm: não cabe na mesa da Centauri Carbon. Reduza o tamanho.');
    $('g3dAvisos').innerHTML = (resultado.solido ? '<p class="text-xs text-emerald-700 font-semibold">✔ Sólido fechado: pronto para fatiar.</p>' : '') +
        av.map(a => `<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">⚠️ ${esc(a)}</p>`).join('');
    $('g3dBaixar').disabled = false;
}

function iniciarVisualizador() {
    const box = $('g3dVisor');
    cena = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
    camera.up.set(0, 0, 1);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.cssText = 'display:block;position:absolute;inset:0';
    box.appendChild(renderer.domElement);
    controles = new OrbitControls(camera, renderer.domElement);
    controles.enableDamping = true;
    cena.add(new THREE.HemisphereLight(0xffffff, 0x88958f, 2.2));
    const luz = new THREE.DirectionalLight(0xffffff, 1.6); luz.position.set(150, -200, 300); cena.add(luz);
    const grade = new THREE.GridHelper(200, 20, 0x9fb3ad, 0xd3ddd9); grade.rotation.x = Math.PI / 2; cena.add(grade);
    camera.position.set(120, -160, 110); controles.target.set(0, 0, 30);
    new ResizeObserver(redimensionar).observe(box);
    redimensionar();
    (function loop() { requestAnimationFrame(loop); controles.update(); renderer.render(cena, camera); })();
}

function redimensionar() {
    const box = $('g3dVisor'); if (!box || !renderer) return;
    const w = box.clientWidth, h = box.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}

function mostrarMalha(r, enquadrar) {
    $('g3dVazio').style.display = 'none';
    if (malhaVisivel) { cena.remove(malhaVisivel); malhaVisivel.geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(r.vert), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(r.tri), 1));
    g.computeVertexNormals();
    malhaVisivel = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.55, metalness: 0.05 }));
    cena.add(malhaVisivel);
    if (enquadrar) {
        g.computeBoundingSphere();
        const s = g.boundingSphere, d = s.radius * 3.2;
        controles.target.copy(s.center);
        camera.position.set(s.center.x + d * 0.55, s.center.y - d * 0.75, s.center.z + d * 0.45);
    }
}

// ---------------- DOWNLOAD ----------------
function nomeArquivo() { return ($('g3dNome').value.trim() || nomePeca || 'peca').replace(/[^\w\-]+/g, '_'); }
function baixar(blob, nome) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function baixarStl() {
    if (!resultado) return;
    baixar(new Blob([gerarStlBinario(resultado.vert, resultado.tri, 'Cliente 3D - ' + nomeArquivo())], { type: 'model/stl' }), nomeArquivo() + '.stl');
}

// ---------------- HISTÓRICO (IndexedDB, só neste navegador) ----------------
function bd() {
    return new Promise((ok, falha) => {
        const r = indexedDB.open('gerador3d', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('modelos', { keyPath: 'id' });
        r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error);
    });
}
async function tx(modo, fn) {
    const db = await bd();
    return new Promise((ok, falha) => {
        const t = db.transaction('modelos', modo); const st = t.objectStore('modelos');
        const res = fn(st); t.oncomplete = () => ok(res && res.result); t.onerror = () => falha(t.error);
    });
}
async function salvarHistorico(nome, buf) {
    try {
        await tx('readwrite', st => st.put({ id: Date.now(), nome, data: new Date().toISOString(), glb: buf }));
        const todos = (await tx('readonly', st => st.getAll())) || [];
        todos.sort((a, b) => b.id - a.id).slice(12).forEach(m => tx('readwrite', st => st.delete(m.id)));
    } catch (e) { console.warn('histórico', e); }
    listarHistorico();
}
async function listarHistorico() {
    const el = $('g3dHistorico'); if (!el) return;
    let todos = [];
    try { todos = (await tx('readonly', st => st.getAll())) || []; } catch (e) { }
    todos.sort((a, b) => b.id - a.id);
    if (!todos.length) { el.innerHTML = '<p class="text-xs text-inkmute">Nenhum ainda.</p>'; return; }
    el.innerHTML = todos.map(m => `<div class="flex items-center gap-2 bg-surface2 rounded-lg px-3 py-2">
        <div class="flex-1 min-w-0"><div class="font-semibold text-ink truncate">${esc(m.nome)}</div><div class="text-[11px] text-inkmute">${new Date(m.data).toLocaleString('pt-BR')} · ${(m.glb.byteLength / 1048576).toFixed(1)} MB</div></div>
        <button type="button" data-abrir="${m.id}" class="px-2 py-1 rounded-md bg-emerald-600 text-white text-xs font-bold">Abrir</button>
        <button type="button" data-apagar="${m.id}" class="px-2 py-1 rounded-md border border-red-200 text-red-600 text-xs" title="Excluir">✕</button></div>`).join('');
    el.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', async () => {
        const m = todos.find(x => x.id === +b.dataset.abrir); if (!m) return;
        nomePeca = m.nome; $('g3dNome').value = m.nome;
        try { await carregarGlb(m.glb); aviso('✅ Modelo aberto do histórico.', 'ok'); } catch (e) { aviso('❌ ' + esc(e.message), 'erro'); }
    }));
    el.querySelectorAll('[data-apagar]').forEach(b => b.addEventListener('click', async () => {
        await tx('readwrite', st => st.delete(+b.dataset.apagar)); listarHistorico();
    }));
}
