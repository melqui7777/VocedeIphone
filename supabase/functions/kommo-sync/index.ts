import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchAllUsers } from '../_shared/kommo.ts';

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const users = await fetchAllUsers();

    const userRows = users.map((u) => ({
      id: String(u.id),
      name: u.name.trim(),
      email: u.email,
      synced_at: new Date().toISOString(),
    }));
    if (userRows.length > 0) {
      const { error } = await supabase.from('kommo_users').upsert(userRows, { onConflict: 'id' });
      if (error) throw new Error(`upsert kommo_users: ${error.message}`);
    }

    return new Response(JSON.stringify({ ok: true, users: userRows.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
