/**
 * Classifica um produto vendido em 'Aparelhos' ou 'Acessórios'.
 * Regra oficial:
 * - 'Aparelhos': SOMENTE produtos cujo nome começa com 'IPHONE' (case-insensitive, trimmed).
 * - 'Acessórios': Qualquer produto que NÃO começa com 'IPHONE' (ex: iPad, Watch, AirPods, Capas, etc.).
 */
export function classifyProductCategory(productName: string | null | undefined): 'Aparelhos' | 'Acessórios' {
  const nome = (productName ?? '').trim().toLowerCase();
  if (nome.startsWith('iphone')) {
    return 'Aparelhos';
  }
  return 'Acessórios';
}

/** Retorna true se o produto é um aparelho (começa com 'iPhone'). */
export function isDeviceProduct(productName: string | null | undefined): boolean {
  return (productName ?? '').trim().toLowerCase().startsWith('iphone');
}

/**
 * Retorna true se a venda de um acessório deve ser contabilizada nas métricas e rankings.
 * Regra obrigatória:
 * - NÃO pode começar com 'iPhone' (deve ser acessório).
 * - O valor de venda (amount) DEVE ser maior que 0.
 * - Brindes, cortesias ou itens com valor R$ 0,00 NUNCA são contabilizados como acessório vendido.
 */
export function isCountableAccessorySale(
  sale: { amount?: number | string | null; quantity?: number },
  productName?: string | null | undefined
): boolean {
  const nome = (productName ?? '').trim().toLowerCase();
  if (nome.startsWith('iphone')) {
    return false;
  }
  const amount = Number(sale?.amount) || 0;
  if (amount <= 0) {
    return false;
  }
  return true;
}

/**
 * Retorna true se a venda deve ser contabilizada nas metas e rankings gerais:
 * - Se for Aparelho (iPhone): sempre conta.
 * - Se for Acessório: somente conta se amount > 0 (não é brinde/cortesia zerada).
 */
export function isCountableSale(
  sale: { amount?: number | string | null; quantity?: number },
  productName?: string | null | undefined
): boolean {
  const isDevice = isDeviceProduct(productName);
  if (isDevice) return true;
  return isCountableAccessorySale(sale, productName);
}
