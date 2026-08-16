import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchAllEstoque, fetchAllVendedores } from '../_shared/mercadophone.ts';

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const [vendedores, produtos] = await Promise.all([fetchAllVendedores(), fetchAllEstoque()]);

    const sellerRows = vendedores.map((v) => ({
      external_id: String(v.id),
      name: v.nome.trim(),
      active: v.snAtivo === 1,
    }));
    if (sellerRows.length > 0) {
      const { error } = await supabase.from('sellers').upsert(sellerRows, { onConflict: 'external_id' });
      if (error) throw new Error(`upsert sellers: ${error.message}`);
    }

    // snServico = serviço (não é item físico de estoque) — não sincronizamos.
    const productRows = produtos
      .filter((p) => p.snServico !== 1)
      .map((p) => ({
        external_id: String(p.id),
        name: p.aparelhoDescricao || p.descricao,
        code: String(p.id),
        category: (p.snAcessorio === 1 || p.snPeca === 1 || p.snBike === 1 ? 'Acessórios' : 'Aparelhos') as
          | 'Acessórios'
          | 'Aparelhos',
        stock: p.quantidade ?? 0,
        min_stock: p.quantidadeMinima ?? 0,
        price: p.valorVenda ?? 0,
        imei: p.imei,
        battery_health: p.saudeBateria != null ? `${p.saudeBateria}%` : null,
      }));
    if (productRows.length > 0) {
      const { error } = await supabase.from('products').upsert(productRows, { onConflict: 'external_id' });
      if (error) throw new Error(`upsert products: ${error.message}`);
    }

    return new Response(
      JSON.stringify({ ok: true, sellers: sellerRows.length, products: productRows.length }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
