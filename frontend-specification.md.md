# Frontend Specification - Dashboard Executivo Comercial

## Objetivo

Construir apenas o **front-end** de um Dashboard Executivo Comercial. O
design será baseado em uma imagem de referência fornecida separadamente.
Este documento descreve apenas as telas e os componentes visuais.

------------------------------------------------------------------------

# Sidebar

Itens:

-   Dashboard
-   Forecast
-   Vendedores
-   Estoque
-   Metas
-   Painel da Loja (Modo TV)
-   Configurações

------------------------------------------------------------------------

# Dashboard

## Objetivo

Exibir os principais indicadores da operação.

## Cards

-   Meta da Semana (produtos vendidos)
-   Meta do Mês (produtos vendidos)
-   Quantos produtos foram vendidos do Mês
-   Vendedor do Mês
-   Produto Mais Vendido

## Seção Vendedores

-   Vendedor da Semana
-   Ranking dos vendedores

## Seção Produtos

-   Top 5 produtos mais vendidos
-   Estoque crítico

## Auditoria de Conversas

Permitir selecionar um vendedor para visualizar seu relatório.

------------------------------------------------------------------------

# Vendedores

## Lista

Cada card deve exibir:

-   Foto
-   Nome
-   Produtos vendidos
-   Meta atingida
-   Botão "Ver Relatório"

## Relatório

Resumo:

-   Conversas
-   Vendas
-   Conversão

Tabela:

-   Cliente
-   Data
-   Produto
-   Resultado

Para cada conversa exibir:

-   Resumo
-   Motivo da perda (quando existir)
-   Pontos positivos
-   Pontos de melhoria

Motivos comuns:

-   Preço
-   Cliente indeciso
-   Concorrência
-   Produto indisponível
-   Cliente desistiu

------------------------------------------------------------------------

# Estoque

Exibir:

-   Quantidade total em estoque
-   Produtos com estoque crítico
-   Produtos mais vendidos

Tabela:

-   Produto
-   Categoria
-   Quantidade

------------------------------------------------------------------------

# Forecast

Cards:

-   Previsão de faturamento
-   Chance de atingir a meta
-   Projeção por vendedor
-   Comparativo entre meses

------------------------------------------------------------------------

# Metas

Permitir ao proprietário configurar:

## Meta Semanal

-   Quantidade de aparelhos
-   Quantidade de acessórios (opcional)

## Meta Mensal

-   Quantidade de aparelhos
-   Quantidade de acessórios (opcional)

Botões:

-   Salvar
-   Restaurar padrão

------------------------------------------------------------------------

# Painel da Loja (Modo TV)

## Objetivo

Tela em modo apresentação para exibição em televisão.

## Exibir

-   Meta da Semana
-   Barra de progresso
-   Situação da meta
-   Vendedor destaque
-   Top 3 vendedores
-   Produto mais vendido
-   Acessório mais vendido

Quando a meta for atingida:

"🏆 META DA SEMANA ATINGIDA!"

Quando não:

Mostrar quantidade restante para atingir a meta.

## Configuração

Permitir ativar/desativar:

-   Meta
-   Barra de progresso
-   Ranking
-   Vendedor destaque
-   Produto destaque

Botão:

**Abrir Painel da Loja**

Abrir em tela cheia para segunda tela/TV.

------------------------------------------------------------------------

# Configurações

Tela simples para preferências do painel:

-   Exibir ranking
-   Exibir metas
-   Exibir produtos
-   Exibir painel TV

------------------------------------------------------------------------

# Observações

-   O documento descreve apenas o front-end.
-   O layout será copiado da imagem de referência.
-   Não implementar telas de cadastro.
-   Não criar módulos financeiros, CRM ou ERP.
-   Priorizar interface limpa e objetiva.
