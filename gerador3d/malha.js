// Gerador 3D — operações de malha (sem dependência de three.js).
// Trabalha em milímetros, eixo Z para cima (padrão das impressoras/fatiadores).
// Recebe o módulo WASM do manifold-3d já inicializado.

// Junta vértices repetidos (o GLB costuma vir com vértices duplicados por face).
export function soldarVertices(posicoes, indices, tolerancia = 1e-5) {
    const mapa = new Map();
    const vert = [];
    const remap = new Uint32Array(posicoes.length / 3);
    const inv = 1 / tolerancia;
    for (let i = 0; i < posicoes.length / 3; i++) {
        const x = posicoes[i * 3], y = posicoes[i * 3 + 1], z = posicoes[i * 3 + 2];
        const k = Math.round(x * inv) + '_' + Math.round(y * inv) + '_' + Math.round(z * inv);
        let id = mapa.get(k);
        if (id === undefined) { id = vert.length / 3; vert.push(x, y, z); mapa.set(k, id); }
        remap[i] = id;
    }
    const nTri = indices ? indices.length / 3 : posicoes.length / 9;
    const tri = [];
    for (let t = 0; t < nTri; t++) {
        const a = remap[indices ? indices[t * 3] : t * 3];
        const b = remap[indices ? indices[t * 3 + 1] : t * 3 + 1];
        const c = remap[indices ? indices[t * 3 + 2] : t * 3 + 2];
        if (a === b || b === c || a === c) continue; // triângulo degenerado
        tri.push(a, b, c);
    }
    return { vert: new Float32Array(vert), tri: new Uint32Array(tri) };
}

// Tenta transformar a malha num sólido fechado (necessário para furos e uniões limpas).
export function paraSolido(w, malha) {
    const { Manifold, Mesh } = w;
    const m = new Mesh({ numProp: 3, vertProperties: malha.vert, triVerts: malha.tri });
    m.merge();
    try {
        const s = new Manifold(m);
        if (s.isEmpty()) return null;
        return s;
    } catch (e) {
        return null;
    }
}

function caixa(vert) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vert.length; i += 3) {
        for (let k = 0; k < 3; k++) { const v = vert[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
    }
    return { min, max };
}

// Aplica rotação (graus, ordem X→Y→Z) num array de vértices — usado quando a malha não é sólida.
function rotacionarVert(vert, [rx, ry, rz]) {
    const r = Math.PI / 180;
    const cx = Math.cos(rx * r), sx = Math.sin(rx * r), cy = Math.cos(ry * r), sy = Math.sin(ry * r), cz = Math.cos(rz * r), sz = Math.sin(rz * r);
    const out = new Float32Array(vert.length);
    for (let i = 0; i < vert.length; i += 3) {
        let x = vert[i], y = vert[i + 1], z = vert[i + 2], t;
        t = y * cx - z * sx; z = y * sx + z * cx; y = t;           // X
        t = x * cy + z * sy; z = -x * sy + z * cy; x = t;          // Y
        t = x * cz - y * sz; y = x * sz + y * cz; x = t;           // Z
        out[i] = x; out[i + 1] = y; out[i + 2] = z;
    }
    return out;
}

function transformarVert(vert, escala, dx, dy, dz) {
    const out = new Float32Array(vert.length);
    for (let i = 0; i < vert.length; i += 3) {
        out[i] = vert[i] * escala + dx; out[i + 1] = vert[i + 1] * escala + dy; out[i + 2] = vert[i + 2] * escala + dz;
    }
    return out;
}

function malhaDe(solido) {
    const m = solido.getMesh();
    if (m.numProp === 3) return { vert: m.vertProperties, tri: m.triVerts };
    const n = m.vertProperties.length / m.numProp, v = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) v[i * 3 + k] = m.vertProperties[i * m.numProp + k];
    return { vert: v, tri: m.triVerts };
}

// Centro XY dos pontos mais altos (onde a argola do chaveiro vai encaixar).
function pontoMaisAlto(vert, faixa) {
    let maxZ = -Infinity;
    for (let i = 2; i < vert.length; i += 3) if (vert[i] > maxZ) maxZ = vert[i];
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < vert.length; i += 3) if (vert[i + 2] >= maxZ - faixa) { sx += vert[i]; sy += vert[i + 1]; n++; }
    return { x: sx / n, y: sy / n, z: maxZ };
}

/*
  opcoes = {
    rotacao: [rx, ry, rz] (graus),
    medida: 'altura' | 'maior',  tamanho: mm,
    base: { ativo, formato: 'redonda'|'retangular', altura, margem },
    chaveiro: { ativo, furo (diâmetro interno mm), espessura (mm) },
    ima: { ativo, diametro, profundidade, folga },
    passagem: { ativo, diametro, alturaPct },
  }
  Retorna { vert, tri, solido (bool), avisos[], dims:[x,y,z], volume (mm³ ou null) }
*/
export function montarPeca(w, original, opcoes) {
    const { Manifold, CrossSection } = w;
    const avisos = [];
    const seg = 64;
    let solido = paraSolido(w, original);
    let vert = original.vert, tri = original.tri;

    // 1) rotação
    const rot = opcoes.rotacao || [0, 0, 0];
    if (solido) solido = solido.rotate(rot); else vert = rotacionarVert(vert, rot);

    // 2) escala + 3) posição (centro XY na origem, fundo em Z=0)
    let bb = solido ? solido.boundingBox() : caixa(vert);
    const dim = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
    const ref = opcoes.medida === 'maior' ? Math.max(...dim) : dim[2];
    const f = ref > 0 && opcoes.tamanho > 0 ? opcoes.tamanho / ref : 1;
    const cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2;
    const b = opcoes.base || {};
    const afundar = 0.6; // quanto a peça entra na base para colar
    const zBase = b.ativo ? Math.max(0.4, b.altura - afundar) : 0;
    if (solido) solido = solido.translate([-cx, -cy, -bb.min[2]]).scale(f).translate([0, 0, zBase]);
    else vert = transformarVert(vert, f, -cx * f, -cy * f, -bb.min[2] * f + zBase);

    const largura = dim[0] * f, profundidade = dim[1] * f, altura = dim[2] * f;
    const extras = []; // peças somadas
    const furos = [];  // peças subtraídas

    // 4) base
    if (b.ativo) {
        const m = b.margem || 0;
        if (b.formato === 'retangular') {
            extras.push(Manifold.cube([largura + 2 * m, profundidade + 2 * m, b.altura], true).translate([0, 0, b.altura / 2]));
        } else {
            const r = Math.max(largura, profundidade) / 2 + m;
            extras.push(Manifold.cylinder(b.altura, r, r, seg * 2));
        }
    }

    // 5) argola de chaveiro no ponto mais alto
    const c = opcoes.chaveiro || {};
    if (c.ativo) {
        const vAtual = solido ? malhaDe(solido).vert : vert;
        const topo = pontoMaisAlto(vAtual, Math.max(1, altura * 0.03));
        const t = c.espessura / 2;               // raio do "arame"
        const R = c.furo / 2 + t;                 // raio da linha central da argola
        const anel = CrossSection.circle(t, 32).translate([R, 0]).revolve(seg).rotate([90, 0, 0]);
        extras.push(anel.translate([topo.x, topo.y, topo.z + R - t * 0.5]));
    }

    // 6) furo para ímã embaixo
    const im = opcoes.ima || {};
    if (im.ativo) {
        const r = (im.diametro + (im.folga || 0)) / 2;
        furos.push(Manifold.cylinder(im.profundidade + 0.01, r, r, seg).translate([0, 0, -0.01]));
    }

    // 7) furo passante horizontal (cordão/arame), atravessando de lado a lado no eixo X
    const p = opcoes.passagem || {};
    if (p.ativo) {
        const r = p.diametro / 2, comp = Math.max(largura, profundidade) * 2 + 20;
        const z = zBase + altura * (p.alturaPct / 100);
        furos.push(Manifold.cylinder(comp, r, r, 48, true).rotate([0, 90, 0]).translate([0, 0, z]));
    }

    if (solido) {
        let final = extras.length ? Manifold.union([solido, ...extras]) : solido;
        if (furos.length) final = final.subtract(Manifold.union(furos));
        const m = malhaDe(final), bbf = final.boundingBox();
        return {
            vert: m.vert, tri: m.tri, solido: true, avisos,
            dims: [bbf.max[0] - bbf.min[0], bbf.max[1] - bbf.min[1], bbf.max[2] - bbf.min[2]],
            volume: final.volume(),
        };
    }

    // Malha "aberta": junta as peças sem fundir e avisa que furos não foram feitos.
    avisos.push('A malha gerada não é um sólido fechado. Base e argola foram juntadas sem fundir (o fatiador costuma unir sozinho).');
    if (furos.length) avisos.push('Furos (ímã/passagem) não puderam ser feitos nesta malha.');
    const partes = [{ vert, tri }, ...extras.map(malhaDe)];
    let nv = 0, nt = 0;
    partes.forEach(q => { nv += q.vert.length; nt += q.tri.length; });
    const V = new Float32Array(nv), T = new Uint32Array(nt);
    let ov = 0, ot = 0;
    partes.forEach(q => {
        V.set(q.vert, ov);
        const base = ov / 3;
        for (let i = 0; i < q.tri.length; i++) T[ot + i] = q.tri[i] + base;
        ov += q.vert.length; ot += q.tri.length;
    });
    const bbf = caixa(V);
    return { vert: V, tri: T, solido: false, avisos, dims: [bbf.max[0] - bbf.min[0], bbf.max[1] - bbf.min[1], bbf.max[2] - bbf.min[2]], volume: null };
}

// STL binário (o formato que todo fatiador aceita).
export function gerarStlBinario(vert, tri, nome = 'Cliente 3D') {
    const n = tri.length / 3;
    const buf = new ArrayBuffer(84 + n * 50);
    const dv = new DataView(buf);
    const cab = new TextEncoder().encode(String(nome).slice(0, 79));
    new Uint8Array(buf, 0, 80).set(cab);
    dv.setUint32(80, n, true);
    let o = 84;
    for (let t = 0; t < n; t++) {
        const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3;
        const ux = vert[b] - vert[a], uy = vert[b + 1] - vert[a + 1], uz = vert[b + 2] - vert[a + 2];
        const vx = vert[c] - vert[a], vy = vert[c + 1] - vert[a + 1], vz = vert[c + 2] - vert[a + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true); o += 12;
        for (const i of [a, b, c]) { dv.setFloat32(o, vert[i], true); dv.setFloat32(o + 4, vert[i + 1], true); dv.setFloat32(o + 8, vert[i + 2], true); o += 12; }
        dv.setUint16(o, 0, true); o += 2;
    }
    return buf;
}
