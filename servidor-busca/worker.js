// Servidor de busca de modelos 3D (Cloudflare Worker)
// Consulta Printables, Thingiverse, MyMiniFactory e Cults3D e devolve um formato único.
// Chaves ficam em "Variables and Secrets" do Worker (nunca no app):
//   THINGIVERSE_TOKEN, MMF_KEY, CULTS_USER, CULTS_KEY   (todas opcionais; sem chave, a fonte é ignorada)
//   ALLOWED_ORIGIN (opcional, padrão https://viniverk.github.io)

const UA = 'Mozilla/5.0 (compatible; VendaBuscaModelos/1.0)';

function comTimeout(promessa, ms) {
  return Promise.race([promessa, new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), ms))]);
}
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

// ---------- Printables (GraphQL público, sem chave) ----------
async function printables(q) {
  const tentativas = [
    `query Search($q: String!) { result: searchPrints2(query: $q, printType: print, limit: 24, offset: 0, ordering: best_match) { items { id name slug likesCount downloadCount price image { filePath } user { publicUsername } } } }`,
    `query Search($q: String!) { result: searchPrints2(query: $q, printType: print, limit: 24, offset: 0) { items { id name slug likesCount downloadCount image { filePath } user { publicUsername } } } }`,
  ];
  let ultimoErro = 'sem resposta';
  for (const query of tentativas) {
    const r = await fetch('https://api.printables.com/graphql/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json', 'accept-language': 'en-US,en;q=0.9',
        origin: 'https://www.printables.com', referer: 'https://www.printables.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      body: JSON.stringify({ query, variables: { q } }),
      cf: { cacheTtl: 300, cacheEverything: false },
    });
    if (r.status === 429) { ultimoErro = 'HTTP 429 (limite de pedidos do Printables; tente de novo em alguns minutos)'; break; }
    const d = await r.json().catch(() => null);
    if (d && d.data && d.data.result && d.data.result.items) {
      return d.data.result.items.map((it) => ({
        fonte: 'printables', titulo: it.name, autor: it.user && it.user.publicUsername,
        imagem: it.image && it.image.filePath ? 'https://media.printables.com/' + it.image.filePath : null,
        url: `https://www.printables.com/model/${it.id}-${it.slug || ''}`,
        curtidas: num(it.likesCount), downloads: num(it.downloadCount),
        gratuito: it.price == null ? true : Number(it.price) === 0,
      }));
    }
    ultimoErro = d && d.errors && d.errors[0] ? d.errors[0].message : 'HTTP ' + r.status;
  }
  throw new Error(ultimoErro);
}

// ---------- Thingiverse (token gratuito do app) ----------
async function thingiverse(q, env) {
  if (!env.THINGIVERSE_TOKEN) throw new Error('sem chave (THINGIVERSE_TOKEN)');
  const r = await fetch(`https://api.thingiverse.com/search/${encodeURIComponent(q)}?type=things&per_page=24&sort=relevant`, {
    headers: { authorization: 'Bearer ' + env.THINGIVERSE_TOKEN, 'user-agent': UA },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return (d.hits || []).map((it) => ({
    fonte: 'thingiverse', titulo: it.name, autor: it.creator && it.creator.name,
    imagem: it.preview_image || it.thumbnail || null,
    url: it.public_url || `https://www.thingiverse.com/thing:${it.id}`,
    curtidas: num(it.like_count), downloads: num(it.download_count) ?? num(it.collect_count), gratuito: true,
  }));
}

// ---------- MyMiniFactory (chave gratuita) ----------
async function myminifactory(q, env) {
  if (!env.MMF_KEY) throw new Error('sem chave (MMF_KEY)');
  const base = `https://www.myminifactory.com/api/v2/search?q=${encodeURIComponent(q)}&per_page=24`;
  let r = await fetch(`${base}&key=${encodeURIComponent(env.MMF_KEY.trim())}`, { headers: { 'user-agent': UA } });
  if (r.status === 401 || r.status === 403) r = await fetch(base, { headers: { 'user-agent': UA, authorization: 'Bearer ' + env.MMF_KEY.trim() } });
  if (!r.ok) { const t = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120); throw new Error('HTTP ' + r.status + (t ? ' — ' + t : '')); }
  const d = await r.json();
  return (d.items || []).map((it) => {
    const img = it.images && it.images[0];
    const preco = it.price && (it.price.value ?? it.price.amount ?? it.price);
    return {
      fonte: 'myminifactory', titulo: it.name, autor: it.designer && (it.designer.name || it.designer.username),
      imagem: img ? ((img.large && img.large.url) || (img.thumbnail && img.thumbnail.url) || null) : null,
      url: it.url || `https://www.myminifactory.com/object/3d-print-${it.id}`,
      curtidas: num(it.likes), downloads: num(it.views), gratuito: preco == null ? true : Number(preco) === 0,
    };
  });
}

// ---------- Cults3D (GraphQL com usuário + chave de API) ----------
async function cults3d(q, env) {
  if (!env.CULTS_USER || !env.CULTS_KEY) throw new Error('sem chave (CULTS_USER / CULTS_KEY)');
  const auth = 'Basic ' + btoa(env.CULTS_USER + ':' + env.CULTS_KEY);
  const tentativas = [
    `query($q: String!) { creationsSearchBatch(query: $q, limit: 24) { results { name url illustrationImageUrl likesCount downloadsCount price(currency: EUR) { cents } creator { nick } } } }`,
    `query($q: String!) { creationsSearchBatch(query: $q, limit: 24) { results { name url illustrationImageUrl creator { nick } } } }`,
  ];
  let ultimoErro = 'sem resposta';
  for (const query of tentativas) {
    const r = await fetch('https://cults3d.com/graphql', { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth, 'user-agent': UA }, body: JSON.stringify({ query, variables: { q } }) });
    const d = await r.json().catch(() => null);
    const lista = d && d.data && d.data.creationsSearchBatch && d.data.creationsSearchBatch.results;
    if (lista) {
      return lista.map((it) => ({
        fonte: 'cults3d', titulo: it.name, autor: it.creator && it.creator.nick, imagem: it.illustrationImageUrl || null, url: it.url,
        curtidas: num(it.likesCount), downloads: num(it.downloadsCount), gratuito: it.price ? Number(it.price.cents) === 0 : null,
      }));
    }
    ultimoErro = d && d.errors && d.errors[0] ? d.errors[0].message : 'HTTP ' + r.status;
  }
  throw new Error(ultimoErro);
}

const HOSTS_PREVIEW = ['makerworld.com', 'printables.com', 'thingiverse.com', 'myminifactory.com', 'cults3d.com', 'thangs.com', 'crealitycloud.com', 'nexprint.com', 'cgtrader.com', 'yeggi.com'];
const metaTag = (html, nomes) => {
  const metas = html.match(/<meta\b[^>]*>/gi) || [];
  for (const n of nomes) {
    for (const tag of metas) {
      const nome = (tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (!nome || nome.toLowerCase() !== n) continue;
      const c = (tag.match(/content\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (c) return c.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    }
  }
  return '';
};
async function previewModelo(url, cors) {
  let alvo;
  try { alvo = new URL(url.searchParams.get('url') || ''); } catch { return json({ ok: false, erro: 'url inválida' }, cors, 400); }
  const host = alvo.hostname.replace(/^www\./, '');
  if (!/^https?:$/.test(alvo.protocol) || !HOSTS_PREVIEW.some((h) => host === h || host.endsWith('.' + h))) return json({ ok: false, erro: 'site não suportado' }, cors, 400);
  try {
    const r = await comTimeout(fetch(alvo.toString(), { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Cliente3D-Preview/1.0; +https://cliente3d.com.br)', accept: 'text/html', 'accept-language': 'pt-BR,en;q=0.8' }, redirect: 'follow' }), 8000);
    if (!r.ok) return json({ ok: false, erro: 'HTTP ' + r.status }, cors);
    const html = (await r.text()).slice(0, 400000);
    let imagem = metaTag(html, ['og:image', 'twitter:image']);
    if (imagem) { try { imagem = new URL(imagem, alvo).toString(); } catch {} }
    const titulo = metaTag(html, ['og:title', 'twitter:title']);
    return new Response(JSON.stringify({ ok: !!imagem, imagem, titulo }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400', ...cors } });
  } catch (e) { return json({ ok: false, erro: String((e && e.message) || e).slice(0, 120) }, cors); }
}

const BUSCADORES = { printables, thingiverse, myminifactory, cults3d };

function json(corpo, cors, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors } });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const permitidas = (env.ALLOWED_ORIGIN || 'https://viniverk.github.io').split(',').map((s) => s.trim());
    const origem = req.headers.get('Origin') || '';
    const cors = {
      'access-control-allow-origin': permitidas.includes(origem) ? origem : permitidas[0], vary: 'Origin',
      'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (url.pathname === '/preview') return previewModelo(url, cors);
    if (url.pathname !== '/search') return json({ ok: true, servico: 'busca-modelos', fontes: Object.keys(BUSCADORES) }, cors);

    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (!q) return json({ resultados: [], erros: {} }, cors);
    const pedidas = (url.searchParams.get('fontes') || Object.keys(BUSCADORES).join(',')).split(',').filter((f) => BUSCADORES[f]);

    const chaveCache = new Request(`https://cache.local/search?q=${encodeURIComponent(q.toLowerCase())}&f=${pedidas.sort().join(',')}`);
    const cache = caches.default;
    const emCache = await cache.match(chaveCache);
    if (emCache) return new Response(emCache.body, { headers: { 'content-type': 'application/json; charset=utf-8', 'x-cache': 'HIT', ...cors } });

    const partes = await Promise.all(pedidas.map(async (f) => {
      try { return [f, await comTimeout(BUSCADORES[f](q, env), 9000), null]; }
      catch (e) { return [f, [], String((e && e.message) || e).slice(0, 200)]; }
    }));
    const erros = {}; const listas = [];
    partes.forEach(([f, itens, erro]) => { if (erro) erros[f] = erro; listas.push(itens); });
    // intercala as fontes (1º de cada, 2º de cada...) para a ordem "mais relevantes"
    const resultados = []; const max = Math.max(0, ...listas.map((l) => l.length));
    for (let i = 0; i < max; i++) listas.forEach((l) => { if (l[i] && l[i].titulo && l[i].url) resultados.push(l[i]); });

    const resposta = JSON.stringify({ resultados, erros });
    if (resultados.length) ctx.waitUntil(cache.put(chaveCache, new Response(resposta, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=600' } })));
    return new Response(resposta, { headers: { 'content-type': 'application/json; charset=utf-8', 'x-cache': 'MISS', ...cors } });
  },
};
