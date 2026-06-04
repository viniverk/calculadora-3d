Gestor 3D - Zweck 3D Print
Sistema de gestão operacional e financeira desenvolvido para otimizar o fluxo de trabalho da Zweck 3D Print. O projeto integra um front-end hospedado no GitHub Pages com um back-end serverless no Supabase.

🚀 Tecnologias Utilizadas
Front-end: HTML5, Tailwind CSS, JavaScript (Vanilla).

Back-end/Database: Supabase (PostgreSQL).

Autenticação: Supabase Auth (Social Provider: Google).

Hospedagem: GitHub Pages.

🛠 Arquitetura do Banco de Dados
A infraestrutura de dados é versionada através de scripts SQL salvos no SQL Editor do Supabase. Abaixo, a ordem de execução para reconstrução do ambiente:

Create Core Tables & RLS Init: Define a espinha dorsal (estoque, modelos, impressões, vendas, perfis) e as políticas de segurança RLS.

Fix Estoque Materiais RLS: Ajuste fino das permissões de segurança para o estoque de insumos.

Add Custom Columns to Registro Impressoes: Inclusão de métricas de negócio na tabela de jobs.

Add Cor and Data Compra to Estoque Materiais: Evolução incremental dos campos de controle de estoque.

Add Data Conclusao to Projetos: Atualização da estrutura de portfólio para controle de cronograma.

🔑 Configuração de Autenticação
O sistema utiliza OAuth 2.0 com o Google.

Callback URL: [https://tacxvkvpnialzdhbhffc.supabase.co/auth/v1/callback](https://tacxvkvpnialzdhbhffc.supabase.co/auth/v1/callback)

Site URL: [https://viniverk.github.io/calculadora-3d/](https://viniverk.github.io/calculadora-3d/)

📊 Funcionalidades
Gestão de Estoque: Controle de peso/gramatura de filamentos com filtros por tipo, fornecedor e cor.

Portfólio & Calculadora: Estimativa de custos (insumos + taxa de máquina) com cálculo automático de margem de lucro sugerida.

Gestor Comercial: Módulo de vendas com baixa automática de status e cálculo de lucro líquido real (Faturamento Bruto - Custo Retido).

Painel Administrativo: Controle de acesso por usuário via tabela perfis.

Desenvolvido por Vinícios - Senior BI Developer
