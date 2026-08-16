import { createClient } from 'jsr:@supabase/supabase-js@2';

interface VendaItem {
  produtoId: number | string;
  produtoNome?: string;
  quantidade: number;
  valorUnitario?: number;
  valorTotal?: number;
}

interface Venda {
  id: number | string;
  dataVenda: string;
  status?: string;
  vendedorId: number | string;
  vendedorNome?: string;
  itens: VendaItem[];
}

function extractVenda(payload: unknown): Venda | null {
  const obj = payload as Record<string, unknown> | null;
  const data = obj?.data as Record<string, unknown> | undefined;
  const candidates = [payload, obj?.venda, data, data?.venda];
  for (const c of candidates) {
    if (c && typeof c === 'object' && 'id' in c && 'itens' in c && Array.isArray((c as Venda).itens)) {
      return c as Venda;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== Deno.env.get('MERCADOPHONE_WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Segunda camada: o MercadoPhone também envia um token próprio nesse header.
  // Só valida se o segredo estiver configurado (evita quebrar o deploy antes de setá-lo).
  const expectedAuthCode = Deno.env.get('MERCADOPHONE_WEBHOOK_AUTH_CODE');
  if (expectedAuthCode && req.headers.get('mp-auth-code') !== expectedAuthCode) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const rawText = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = { raw: rawText };
  }

  const { data: eventRow, error: insertError } = await supabase
    .from('mercadophone_webhook_events')
    .insert({ payload })
    .select('id')
    .single();

  if (insertError) {
    console.error('failed to stage webhook event', insertError);
    return new Response('ok', { status: 200 });
  }

  try {
    const venda = extractVenda(payload);
    if (!venda) {
      throw new Error('payload não reconhecido: não encontrei um objeto de venda com id + itens');
    }

    const status = (venda.status ?? '').toLowerCase().trim();
    if (status && status !== 'concluido') {
      await supabase
        .from('mercadophone_webhook_events')
        .update({ processed: true, error: `ignorado: status="${venda.status}"` })
        .eq('id', eventRow.id);
      return new Response('ok', { status: 200 });
    }

    let sellerId: string;
    {
      const { data: existing } = await supabase
        .from('sellers')
        .select('id')
        .eq('external_id', String(venda.vendedorId))
        .maybeSingle();
      if (existing) {
        sellerId = existing.id;
      } else {
        const { data: created, error } = await supabase
          .from('sellers')
          .insert({
            external_id: String(venda.vendedorId),
            name: venda.vendedorNome?.trim() || `Vendedor ${venda.vendedorId}`,
            active: true,
          })
          .select('id')
          .single();
        if (error) throw new Error(`criar vendedor: ${error.message}`);
        sellerId = created.id;
      }
    }

    for (const [itemIndex, item] of venda.itens.entries()) {
      let productId: string;
      const { data: existingProduct } = await supabase
        .from('products')
        .select('id')
        .eq('external_id', String(item.produtoId))
        .maybeSingle();

      if (existingProduct) {
        productId = existingProduct.id;
      } else {
        const unitPrice = item.valorUnitario ?? (item.quantidade > 0 ? (item.valorTotal ?? 0) / item.quantidade : 0);
        const { data: created, error } = await supabase
          .from('products')
          .insert({
            external_id: String(item.produtoId),
            name: item.produtoNome || `Produto ${item.produtoId}`,
            code: String(item.produtoId),
            category: unitPrice > 500 ? 'Aparelhos' : 'Acessórios',
            stock: 0,
            min_stock: 0,
            price: unitPrice,
          })
          .select('id')
          .single();
        if (error) throw new Error(`criar produto: ${error.message}`);
        productId = created.id;
      }

      const { error: saleError } = await supabase.from('sales').upsert(
        {
          external_id: `${venda.id}-${item.produtoId}-${itemIndex}`,
          seller_id: sellerId,
          product_id: productId,
          quantity: item.quantidade,
          amount: item.valorTotal ?? (item.valorUnitario ?? 0) * item.quantidade,
          sold_at: venda.dataVenda,
        },
        { onConflict: 'external_id' }
      );
      if (saleError) throw new Error(`gravar venda: ${saleError.message}`);
    }

    await supabase
      .from('mercadophone_webhook_events')
      .update({ processed: true })
      .eq('id', eventRow.id);
  } catch (err) {
    console.error('failed to process webhook event', err);
    await supabase
      .from('mercadophone_webhook_events')
      .update({ error: String(err) })
      .eq('id', eventRow.id);
  }

  // Sempre 200: já persistimos o payload bruto, então um erro de parsing não deve
  // fazer o MercadoPhone ficar retentando a entrega indefinidamente.
  return new Response('ok', { status: 200 });
});
