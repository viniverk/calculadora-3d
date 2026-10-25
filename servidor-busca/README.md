# Servidor de busca de modelos (Cloudflare Worker)

Faz a ponte entre o Cliente 3D e as bibliotecas de modelos. É gratuito (plano Free da Cloudflare: 100 mil pedidos por dia).

## 1. Criar o Worker (uns 5 minutos)
1. Crie uma conta grátis em https://dash.cloudflare.com
2. Menu **Workers & Pages** → **Create** → **Create Worker** → nome: `busca-modelos` → **Deploy**.
3. Clique em **Edit code**, apague tudo, cole o conteúdo do arquivo `worker.js` e clique em **Deploy**.
4. Copie o endereço do Worker (algo como `https://busca-modelos.SEU-USUARIO.workers.dev`).

## 2. Chaves das bibliotecas (todas opcionais)
No Worker: **Settings → Variables and Secrets → Add** (tipo **Secret**). Sem a chave, a fonte aparece como "sem chave" e é ignorada.

| Nome | Onde pegar |
|---|---|
| `THINGIVERSE_TOKEN` | https://www.thingiverse.com/developers → criar app → "App Token" |
| `MMF_KEY` | https://www.myminifactory.com/settings/developer → criar app → API key |
| `CULTS_USER` e `CULTS_KEY` | Cults3D → Configurações → API (usuário e chave) |
| Printables | não precisa de chave |

Opcional: `ALLOWED_ORIGIN` = `https://viniverk.github.io` (já é o padrão). Só esse site consegue usar o seu Worker pelo navegador.

## 3. Ligar no app
No Cliente 3D → **Buscar modelos** → **⚙️ Servidor de busca** → cole o endereço do Worker → **Salvar** → **Testar**.
