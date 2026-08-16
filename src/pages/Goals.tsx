import React, { useEffect, useState } from 'react';
import { fetchGoals, updateGoals } from '../lib/api';

const DEFAULTS = {
  weekly_devices_target: 1250,
  weekly_accessories_target: 3500,
  monthly_devices_target: 5000,
  monthly_accessories_target: 12000,
};

export function Goals() {
  const [values, setValues] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchGoals()
      .then((goals) => setValues({
        weekly_devices_target: goals.weekly_devices_target,
        weekly_accessories_target: goals.weekly_accessories_target,
        monthly_devices_target: goals.monthly_devices_target,
        monthly_accessories_target: goals.monthly_accessories_target,
      }))
      .finally(() => setLoading(false));
  }, []);

  const setField = (field: keyof typeof DEFAULTS, value: string) => {
    setValues(prev => ({ ...prev, [field]: Number(value) || 0 }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateGoals(values);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setValues(DEFAULTS);
  };

  return (
    <div className="flex-col gap-6">
      <div className="flex-between" style={{marginBottom: '24px'}}>
        <h1 className="h1">Configuração de Metas</h1>
      </div>

      <div className="grid-dashboard" style={{gridTemplateColumns: '1fr 1fr', opacity: loading ? 0.6 : 1}}>
        <div className="card flex-col gap-4">
          <h2 className="h2">Meta Semanal</h2>
          <div className="flex-col gap-2">
            <label className="text-muted" style={{fontWeight: 500}}>Quantidade de Aparelhos</label>
            <input
              type="number"
              value={values.weekly_devices_target}
              onChange={(e) => setField('weekly_devices_target', e.target.value)}
              style={{padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '15px'}}
            />
          </div>
          <div className="flex-col gap-2">
            <label className="text-muted" style={{fontWeight: 500}}>Quantidade de Acessórios (Opcional)</label>
            <input
              type="number"
              value={values.weekly_accessories_target}
              onChange={(e) => setField('weekly_accessories_target', e.target.value)}
              style={{padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '15px'}}
            />
          </div>
        </div>

        <div className="card flex-col gap-4">
          <h2 className="h2">Meta Mensal</h2>
          <div className="flex-col gap-2">
            <label className="text-muted" style={{fontWeight: 500}}>Quantidade de Aparelhos</label>
            <input
              type="number"
              value={values.monthly_devices_target}
              onChange={(e) => setField('monthly_devices_target', e.target.value)}
              style={{padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '15px'}}
            />
          </div>
          <div className="flex-col gap-2">
            <label className="text-muted" style={{fontWeight: 500}}>Quantidade de Acessórios (Opcional)</label>
            <input
              type="number"
              value={values.monthly_accessories_target}
              onChange={(e) => setField('monthly_accessories_target', e.target.value)}
              style={{padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '15px'}}
            />
          </div>
        </div>
      </div>

      <div className="flex-center gap-4" style={{marginTop: '16px'}}>
        <button className="btn-primary" style={{backgroundColor: 'transparent', color: 'var(--text-dark)', border: '1px solid var(--border-color)'}} onClick={handleReset}>
          Restaurar Padrão
        </button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Configurações'}
        </button>
      </div>
    </div>
  );
}
