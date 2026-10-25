// Busca no Printables (GraphQL interno do site, sem chave) para o Venda 3D.
// Roda na Netlify porque o Printables limita (429) os servidores da Cloudflare.
const ORIGENS = ['https://viniverk.github.io', 'https://cliente3d.com.br', 'https://www.cliente3d.com.br'];
const cache = new Map(); // cache simples enquanto a função está "quente"

const cors = (origin) => ({
  'access-control-allow-origin': ORIGENS.includes(origin) ? origin : ORIGENS[0],
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  vary: 'Origin',
});
const json = (corpo, origin, status = 200, extra = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin), ...extra } });
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

const CONSULTAS = [
  `query Search($q: String!) { result: searchPrints2(query: $q, printType: print, limit: 24, offset: 0, ordering: best_match) { items { id name slug likesCount downloadCount price image { filePath } user { publicUsername } } } }`,
  `query Search($q: String!) { result: searchPrints2(query: $q, printType: print, limit: 24, offset: 0) { items { id name slug likesCount downloadCount image { filePath } user { publicUsername } } } }`,
];

async function buscar(q) {
  let erro = 'sem resposta';
  for (const query of CONSULTAS) {
    const r = await fetch('https://api.printables.com/graphql/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json', 'accept-language': 'en-US,en;q=0.9',
        origin: 'https://www.printables.com', referer: 'https://www.printables.com/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      body: JSON.stringify({ query, variables: { q } }),
    });
    if (r.status === 429) throw new Error('HTTP 429 (limite de pedidos do Printables)');
    const d = await r.json().catch(() => null);
    const itens = d && d.data && d.data.result && d.data.result.items;
    if (itens) {
      return itens.map((it) => ({
        fonte: 'printables', titulo: it.name, autor: it.user && it.user.publicUsername,
        imagem: it.image && it.image.filePath ? 'https://media.printables.com/' + it.image.filePath : null,
        url: `https://www.printables.com/model/${it.id}-${it.slug || ''}`,
        curtidas: num(it.likesCount), downloads: num(it.downloadCount),
        gratuito: it.price == null ? true : Number(it.price) === 0,
      }));
    }
    erro = d && d.errors && d.errors[0] ? d.errors[0].message : 'HTTP ' + r.status;
  }
  throw new Error(erro);
}

export default async (req) => {
  const origin = req.headers.get('origin') || '';
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return json({ resultados: [], erros: {} }, origin);
  const chave = q.toLowerCase();
  const antigo = cache.get(chave);
  if (antigo && Date.now() - antigo.t < 600000) return json(antigo.d, origin, 200, { 'x-cache': 'HIT' });
  try {
    const resultados = (await buscar(q)).filter((r) => r.titulo && r.url);
    const d = { resultados, erros: {} };
    if (resultados.length) cache.set(chave, { t: Date.now(), d });
    return json(d, origin);
  } catch (e) {
    return json({ resultados: [], erros: { printables: String((e && e.message) || e).slice(0, 200) } }, origin);
  }
};

export const config = { path: '/search' };
