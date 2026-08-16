import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import {
  fetchVisibleSellers,
  fetchSalesInRange,
  fetchAllConversations,
  computeSellerPerformance,
  getMonthRange,
  type SellerPerformance,
} from '../lib/api';

export function Sellers() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [performance, setPerformance] = useState<SellerPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [rankingType, setRankingType] = useState<'sales' | 'conversion'>('sales');

  useEffect(() => {
    const { start, end } = getMonthRange(new Date());
    Promise.all([fetchVisibleSellers(), fetchSalesInRange(start, end), fetchAllConversations()])
      .then(([sellers, sales, conversations]) => {
        setPerformance(computeSellerPerformance(sellers, sales, conversations));
      })
      .finally(() => setLoading(false));
  }, []);

  const rankedSellers = [...performance]
    .sort((a, b) => rankingType === 'sales' ? b.sold - a.sold : b.conversion - a.conversion)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const getRankBadge = (rank: number) => {
    if (rank === 1) return { text: '1º Lugar', color: 'var(--primary)', bg: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(10, 37, 255, 0.08)' };
    if (rank === 2) return { text: '2º Lugar', color: 'var(--text-dark)', bg: isDark ? 'rgba(255, 255, 255, 0.05)' : 'var(--bg-main)' };
    if (rank === 3) return { text: '3º Lugar', color: 'var(--text-dark)', bg: isDark ? 'rgba(255, 255, 255, 0.05)' : 'var(--bg-main)' };
    return { text: `${rank}º Lugar`, color: 'var(--text-muted)', bg: isDark ? 'rgba(255, 255, 255, 0.03)' : 'var(--bg-main)' };
  };

  return (
    <div className="flex-col gap-6">
      <div className="flex-between" style={{marginBottom: '24px'}}>
        <h1 className="h1">Vendedores</h1>
        <div style={{ display: 'flex', gap: '8px', background: isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6', padding: '4px', borderRadius: '8px' }}>
          <button
            onClick={() => setRankingType('sales')}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: rankingType === 'sales' ? (isDark ? '#374151' : 'white') : 'transparent', color: rankingType === 'sales' ? 'var(--text-dark)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 500, boxShadow: rankingType === 'sales' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}
          >
            Por Vendas
          </button>
          <button
            onClick={() => setRankingType('conversion')}
            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: rankingType === 'conversion' ? (isDark ? '#374151' : 'white') : 'transparent', color: rankingType === 'conversion' ? 'var(--text-dark)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 500, boxShadow: rankingType === 'conversion' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}
          >
            Por Conversão
          </button>
        </div>
      </div>

      {!loading && rankedSellers.length === 0 && (
        <div className="card text-muted" style={{ textAlign: 'center', padding: '32px' }}>
          Nenhum vendedor cadastrado ainda.
        </div>
      )}

      <div className="grid-cards" style={{gridTemplateColumns: 'repeat(4, 1fr)', opacity: loading ? 0.6 : 1}}>
        {rankedSellers.map(({ seller, sold, conversion, rank }) => {
          const badge = getRankBadge(rank);

          return (
            <div key={seller.id} className="card flex-col gap-4" style={{alignItems: 'center', textAlign: 'center'}}>
              <span style={{
                fontSize: '12px',
                fontWeight: 600,
                color: badge.color,
                backgroundColor: badge.bg,
                padding: '4px 12px',
                borderRadius: '100px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {badge.text}
              </span>

              <img
                src={seller.photo_url ?? `https://i.pravatar.cc/150?u=${seller.id}`}
                alt={seller.name}
                style={{width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover'}}
              />
              <div>
                <h2 className="h2">{seller.name}</h2>
                <span className="text-muted">Vendedor(a)</span>
              </div>

              <div style={{width: '100%', padding: '16px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)'}}>
                <div className="flex-between" style={{marginBottom: '8px'}}>
                  <span className="text-muted">Produtos Vendidos</span>
                  <span style={{fontWeight: 600}}>{sold}</span>
                </div>
                <div className="flex-between">
                  <span className="text-muted">Conversão</span>
                  <span style={{fontWeight: 600, color: 'var(--primary)'}}>{conversion}%</span>
                </div>
              </div>

              <Link to={`/vendedores/${seller.id}`} className="btn-primary" style={{width: '100%'}}>
                Ver Relatório
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
