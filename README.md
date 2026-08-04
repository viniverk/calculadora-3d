# Gestor 3D — Migração Supabase → Firebase

## O que mudou
- O site (`index.html`) agora usa **Firebase** (Authentication + Firestore) em vez de Supabase.
- **Imagens de projeto**: em vez de fazer upload de arquivo, agora você **cola o link** de uma imagem já hospedada (Makerworld, Imgur, etc.) — o Firebase Storage deixou de ser gratuito em fev/2026, então evitamos essa dependência.
- Todas as funcionalidades continuam as mesmas: Dashboard, Impressões, Portfólio, Vendas, Estoque (com edição e desconto automático), Calculadora e Painel Admin.

## Passo 1 — Preparar o Firebase (uma vez só)
No [Firebase Console](https://console.firebase.google.com) → projeto "Gestor 3D":

1. **Authentication → Sign-in method** → ative **E-mail/Senha** e **Google**
2. **Firestore Database** → crie o banco em modo produção (se ainda não criou)
3. **Firestore Database → Regras** → cole o conteúdo do arquivo `firestore.rules` (te mandei antes) → **Publicar**

## Passo 2 — Migrar os dados antigos (uma vez só)
1. Abra o arquivo `migracao.html` direto no navegador (dá pra abrir localmente, sem precisar subir no GitHub)
2. **Login no Supabase**: use o e-mail e senha da sua conta atual (a mesma que você já usa pra logar no site antigo)
3. **Login no Firebase**: crie/entre com a conta que você quer usar dali pra frente (pode ser a mesma conta Google de sempre)
4. Clique em **"Iniciar Migração"** e acompanhe o log — ele mostra quantos registros foram copiados de cada tabela
5. Ao final, confira: os números de "estoque_materiais", "projetos_3d", "vendas_3d" e "catalogo_modelos" devem bater com o que você tinha no Supabase

**Importante:** essa ferramenta é de uso único. Depois de confirmar que os dados migraram certo, pode fechar essa página — ela não faz parte do site final e não precisa ser publicada no GitHub.

## Passo 3 — Publicar o novo site
1. Suba o novo `index.html` no seu repositório do GitHub (mesmo processo de sempre: substituir o arquivo, commit, push)
2. Aguarde o GitHub Pages atualizar
3. Acesse o site publicado e logue com a **mesma conta do Firebase** usada no Passo 2

## Passo 4 — Conferir tudo
- Confira se os projetos, vendas e estoque aparecem certinho
- Teste cadastrar um projeto novo, colando um link de imagem
- Vá em "Gerenciar Usuários" e confirme que sua conta aparece como `admin`

## E o Supabase antigo?
Pode deixar o projeto Supabase existir por um tempo como backup (sem custo, só não vai mais ser usado pelo site). Quando tiver certeza de que está tudo certo no Firebase, pode até excluir o projeto Supabase — mas não tem pressa nenhuma pra isso.
