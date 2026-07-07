# Gestor 3D — Guia de Atualização

## O que mudou
- **Visual**: nova identidade (dark/tech refinado), tipografia própria (Space Grotesk + Inter + JetBrains Mono para números), cores consistentes.
- **Novo**: aba **Dashboard** com visão geral (projetos, faturamento, lucro, estoque).
- **Novo**: painel **Gerenciar Usuários** de fato funcional — lista todos os usuários, permite promover/remover admin e bloquear/desbloquear acesso.
- **Bug corrigido**: ao editar um projeto existente, o salvamento estava indo para o Supabase de forma errada (`update([payload])` em vez de `update(payload)`), o que podia falhar silenciosamente.
- **Nada mudou** nas tabelas `projetos_3d`, `vendas_3d`, `estoque_materiais`, `catalogo_modelos` — seus dados continuam exatamente como estão.

## Passo 1 — Rodar o script SQL no Supabase (só uma vez)
1. Acesse seu projeto em https://supabase.com/dashboard
2. Vá em **SQL Editor** → **New query**
3. Copie e cole o conteúdo do arquivo `setup_admin.sql`
4. **Antes de rodar**, troque `SEU_EMAIL_AQUI@exemplo.com` na última linha pelo seu e-mail de login real (é assim que você vira o primeiro administrador)
5. Clique em **Run**

Isso cria a tabela `profiles` (não mexe nas suas tabelas existentes) e te torna admin.

## Passo 2 — Subir o novo `index.html` no GitHub
Como você já tem o repositório:
1. Substitua o arquivo `index.html` do seu repositório pelo novo (mesmo nome, mesma pasta)
2. Faça commit e push:
   ```bash
   git add index.html
   git commit -m "Redesign do Gestor 3D + painel admin funcional"
   git push
   ```

## Passo 3 — Publicar no GitHub Pages
1. No repositório, vá em **Settings** → **Pages**
2. Em "Source", selecione a branch (geralmente `main`) e a pasta `/ (root)`
3. Salve — em alguns minutos o site fica disponível em algo como:
   `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`

Se o GitHub Pages já estava configurado antes, nada muda aqui — o novo `index.html` substitui o antigo automaticamente após o push.

## Passo 4 — Testar
1. Acesse o site publicado e faça login normalmente — seus projetos, vendas e estoque devem aparecer normalmente
2. Vá até "Gerenciar Usuários" na barra lateral (só aparece pra quem é admin) e confirme que sua conta aparece como `admin`

## Observações de segurança
- A chave que aparece no HTML (`SUPABASE_KEY`) é a chave pública (**anon key**) — é normal e seguro ela ficar visível no código do site. Quem protege seus dados é a política de RLS (Row Level Security) do banco, não o sigilo dessa chave.
- Nunca coloque a **service_role key** (chave secreta/admin) em um arquivo HTML público — ela nunca deveria sair do backend.
