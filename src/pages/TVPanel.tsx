import React, { useEffect, useState } from 'react';
import { Trophy, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import {
  fetchGoals,
  fetchSalesInRange,
  fetchProducts,
  fetchVisibleSellers,
  fetchAllConversations,
  computeSellerPerformance,
  getWeekRange,
  type SellerPerformance,
} from '../lib/api';

const MONTH_ABBR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const RANK_LABELS = ['1º', '2º', '3º'];

interface TVPanelData {
  weeklySold: number;
  weeklyTarget: number;
  metaAtingida: boolean;
  remaining: number;
  percent: number;
  topSales: SellerPerformance[];
  topConversion: SellerPerformance[];
  topProduct: string;
  topAccessory: string;
}

export function TVPanel() {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const isDark = theme === 'dark';

  const [data, setData] = useState<TVPanelData | null>(null);
  const now = new Date();

  useEffect(() => {
    const { start, end } = getWeekRange(new Date());
    Promise.all([
      fetchGoals(),
      fetchSalesInRange(start, end),
      fetchProducts(),
      fetchVisibleSellers(),
      fetchAllConversations(),
    ]).then(([goals, sales, products, sellers, conversations]) => {
      const weeklyTarget = goals.weekly_devices_target + goals.weekly_accessories_target;
      const weeklySold = sales.reduce((sum, s) => sum + s.quantity, 0);

      const performance = computeSellerPerformance(sellers, sales, conversations);
      const topSales = [...performance].sort((a, b) => b.sold - a.sold).slice(0, 3);
      const topConversion = [...performance].sort((a, b) => b.conversion - a.conversion).slice(0, 3);

      const productMap = new Map(products.map((p) => [p.id, p]));
      const qtyByProduct = new Map<string, number>();
      sales.forEach((s) => qtyByProduct.set(s.product_id, (qtyByProduct.get(s.product_id) ?? 0) + s.quantity));
      const rankedProducts = [...qtyByProduct.entries()]
        .map(([id, qty]) => ({ product: productMap.get(id), qty }))
        .filter((x): x is { product: NonNullable<typeof x.product>; qty: number } => Boolean(x.product))
        .sort((a, b) => b.qty - a.qty);

      setData({
        weeklySold,
        weeklyTarget,
        metaAtingida: weeklyTarget > 0 && weeklySold >= weeklyTarget,
        remaining: Math.max(0, weeklyTarget - weeklySold),
        percent: weeklyTarget > 0 ? Math.min(100, Math.round((weeklySold / weeklyTarget) * 100)) : 0,
        topSales,
        topConversion,
        topProduct: rankedProducts[0]?.product.name ?? '-',
        topAccessory: rankedProducts.find((x) => x.product.category === 'Acessórios')?.product.name ?? '-',
      });
    });
  }, []);

  const metaAtingida = data?.metaAtingida ?? false;

  const bgGradient = isDark
    ? 'linear-gradient(180deg, #0A0E17 0%, #0D111C 18%, #131926 45%, #0B101D 70%, #05080F 100%)'
    : 'linear-gradient(180deg, #c4ded2 0%, #76a0a8 18%, #365e6d 45%, #183745 70%, #0b1a26 100%)';

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: bgGradient, color: '#fff',
      padding: '40px', display: 'flex', flexDirection: 'column', gap: '32px',
      fontFamily: 'var(--font-family)', overflow: 'hidden'
    }}>
      <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center'}}>
        <div style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
          <div className={`sleek-theme-switch ${isDark ? 'dark-active' : ''}`} onClick={toggleTheme} title="Alternar Modo Claro/Escuro" style={{cursor: 'pointer'}}>
            <Sun size={13} color="#ffffff" className="switch-icon-sun" />
            <Moon size={13} color="#ffffff" className="switch-icon-moon" />
            <div className="switch-thumb" />
          </div>

          <span style={{fontSize: '24px', color: 'rgba(255,255,255,0.6)'}}>
            {String(now.getDate()).padStart(2, '0')} {MONTH_ABBR[now.getMonth()]} {now.getFullYear()}
          </span>
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); signOut().then(() => navigate('/')); }}
            style={{color: 'rgba(255,255,255,0.4)', textDecoration: 'none', cursor: 'pointer'}}
          >
            Sair
          </a>
        </div>
      </div>


      <div style={{flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px'}}>

        {/* Lado Esquerdo - Metas */}
        <div style={{
          backgroundColor: metaAtingida ? 'rgba(24, 55, 75, 0.6)' : 'rgba(255,255,255,0.05)',
          borderRadius: '32px', padding: '40px', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center', textAlign: 'center',
          border: metaAtingida ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.1)',
          borderBottom: metaAtingida ? '2px solid rgba(60, 130, 255, 0.8)' : '1px solid rgba(255,255,255,0.1)',
          boxShadow: metaAtingida ? 'inset 0px -80px 100px -40px rgba(60, 130, 255, 0.4), 0 24px 48px rgba(0,0,0,0.4)' : 'none',
          backdropFilter: 'blur(24px)',
          transition: 'all 0.5s'
        }}>
          {metaAtingida ? (
            <>
              <Trophy size={100} color="#fff" style={{marginBottom: '24px'}} />
              <h2 style={{fontSize: '56px', fontWeight: 800, marginBottom: '16px'}}>META ATINGIDA!</h2>
              <p style={{fontSize: '24px', opacity: 0.9}}>A equipe superou a meta da semana!</p>
            </>
          ) : (
            <>
              <h2 style={{fontSize: '32px', color: 'rgba(255,255,255,0.6)', marginBottom: '16px'}}>Meta da Semana</h2>
              <div style={{fontSize: '80px', fontWeight: 800, marginBottom: '40px'}}>
                {(data?.weeklySold ?? 0).toLocaleString('pt-BR')} / {(data?.weeklyTarget ?? 0).toLocaleString('pt-BR')}
              </div>

              <div style={{width: '100%', height: '24px', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: '12px', overflow: 'hidden'}}>
                <div style={{width: `${data?.percent ?? 0}%`, height: '100%', backgroundColor: 'var(--primary)'}}></div>
              </div>
              <p style={{marginTop: '16px', fontSize: '20px', color: 'rgba(255,255,255,0.6)'}}>Faltam {(data?.remaining ?? 0).toLocaleString('pt-BR')} vendas</p>
            </>
          )}
        </div>

        {/* Lado Direito - Destaques */}
        <div style={{display: 'flex', flexDirection: 'column', gap: '32px'}}>

          <div style={{display: 'flex', gap: '32px', flex: 1}}>
            {/* Top 3 Vendas */}
            <div style={{
              flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '24px', padding: '32px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <h3 style={{fontSize: '20px', color: 'rgba(255,255,255,0.6)', marginBottom: '24px'}}>Top 3 - Vendas</h3>
              <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                {(data?.topSales ?? []).map((item, i) => (
                  <div key={item.seller.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                      <span style={{fontSize: '18px', fontWeight: 700, color: 'rgba(255,255,255,0.5)'}}>{RANK_LABELS[i]}</span>
                      <span style={{fontSize: '20px', fontWeight: 600}}>{item.seller.name}</span>
                    </div>
                    <span style={{fontSize: '22px', fontWeight: 700, color: 'var(--primary)'}}>{item.sold}</span>
                  </div>
                ))}
                {(!data || data.topSales.length === 0) && (
                  <span style={{color: 'rgba(255,255,255,0.5)'}}>Sem vendas registradas esta semana.</span>
                )}
              </div>
            </div>

            {/* Top 3 Conversão */}
            <div style={{
              flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '24px', padding: '32px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <h3 style={{fontSize: '20px', color: 'rgba(255,255,255,0.6)', marginBottom: '24px'}}>Top 3 - Conversão</h3>
              <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                {(data?.topConversion ?? []).map((item, i) => (
                  <div key={item.seller.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                      <span style={{fontSize: '18px', fontWeight: 700, color: 'rgba(255,255,255,0.5)'}}>{RANK_LABELS[i]}</span>
                      <span style={{fontSize: '20px', fontWeight: 600}}>{item.seller.name}</span>
                    </div>
                    <span style={{fontSize: '22px', fontWeight: 700, color: 'var(--primary)'}}>{item.conversion}%</span>
                  </div>
                ))}
                {(!data || data.topConversion.length === 0) && (
                  <span style={{color: 'rgba(255,255,255,0.5)'}}>Sem dados de conversas ainda.</span>
                )}
              </div>
            </div>
          </div>

          <div style={{display: 'flex', gap: '32px'}}>
            <div style={{
              flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '24px', padding: '24px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <h4 style={{fontSize: '18px', color: 'rgba(255,255,255,0.6)', marginBottom: '12px'}}>Produto Mais Vendido</h4>
              <div style={{fontSize: '28px', fontWeight: 700}}>{data?.topProduct ?? '-'}</div>
            </div>
            <div style={{
              flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '24px', padding: '24px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <h4 style={{fontSize: '18px', color: 'rgba(255,255,255,0.6)', marginBottom: '12px'}}>Acessório Mais Vendido</h4>
              <div style={{fontSize: '28px', fontWeight: 700}}>{data?.topAccessory ?? '-'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
