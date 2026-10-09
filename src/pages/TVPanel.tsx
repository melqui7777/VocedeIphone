import React, { useEffect, useState, useRef } from 'react';
import { 
  Trophy, 
  Target, 
  TrendingUp, 
  Users, 
  Smartphone, 
  Headphones, 
  Package,
  Maximize2, 
  Minimize2, 
  Calendar, 
  Sparkles,
  Sun,
  Moon
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  fetchGoals,
  fetchSalesInRange,
  fetchProducts,
  fetchVisibleSellers,
  fetchAllConversations,
  computeSellerPerformance,
  classifyProductCategory,
  isDeviceProduct,
  isCountableSale,
  isCountableAccessorySale,
  getWeekRange,
  type SellerPerformance,
} from '../lib/api';
import type { Sale } from '../lib/database.types';
import { LeaderboardPodium, type LeaderboardRanking } from '@/components/ui/leaderboard-podium';
import trophyGold from '../assets/trophy-gold.png';
import './TVPanel.css';

const MONTH_ABBR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

interface TVPanelData {
  weeklySold: number;
  weeklyTarget: number;
  metaAtingida: boolean;
  remaining: number;
  percent: number;
  topSales: SellerPerformance[];
  topProduct: string;
  topProductQty?: number;
  topDevice: string;
  topDeviceQty?: number;
  topAccessory: string;
  topAccessoryQty?: number;
}

export function TVPanel() {
  const { theme, toggleTheme } = useTheme();
  const [data, setData] = useState<TVPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const now = new Date();

  useEffect(() => {
    let isMounted = true;
    const { start, end } = getWeekRange(new Date());

    setLoading(true);
    Promise.all([
      fetchGoals(),
      fetchSalesInRange(start, end),
      fetchProducts(),
      fetchVisibleSellers(),
      fetchAllConversations(),
    ])
      .then(([goals, sales, products, sellers, conversations]) => {
        if (!isMounted) return;

        const productMap = new Map(products.map((p) => [p.id, p]));
        const checkCountable = (s: Sale) => {
          const prod = productMap.get(s.product_id);
          return isCountableSale(s, prod?.name);
        };

        const weeklyTarget = goals.weekly_devices_target + goals.weekly_accessories_target;
        const weeklySold = sales.filter(checkCountable).reduce((sum, s) => sum + s.quantity, 0);

        const performance = computeSellerPerformance(sellers, sales, conversations, products);
        const topSales = [...performance].sort((a, b) => b.sold - a.sold).slice(0, 3);

        // 1. Produto Mais Vendido (Geral - Aparelhos e Acessórios agrupados por nome)
        const qtyByProduct = new Map<string, { name: string; qty: number; revenue: number }>();
        sales.filter(checkCountable).forEach((s) => {
          const prod = productMap.get(s.product_id);
          const name = prod?.name?.trim() ?? 'Produto sem nome';
          const prev = qtyByProduct.get(name) ?? { name, qty: 0, revenue: 0 };
          qtyByProduct.set(name, {
            name,
            qty: prev.qty + s.quantity,
            revenue: prev.revenue + (Number(s.amount) || 0) * s.quantity,
          });
        });

        const rankedProducts = [...qtyByProduct.values()]
          .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);

        // 2. Aparelho Mais Vendido (SOMENTE produtos que começam com 'iPhone', agrupados por modelo)
        const deviceSales = sales.filter((s) => {
          const prod = productMap.get(s.product_id);
          return isDeviceProduct(prod?.name);
        });
        const qtyByDevice = new Map<string, { name: string; qty: number; revenue: number }>();
        deviceSales.forEach((s) => {
          const prod = productMap.get(s.product_id);
          const name = prod?.name?.trim() ?? 'Aparelho sem nome';
          const prev = qtyByDevice.get(name) ?? { name, qty: 0, revenue: 0 };
          qtyByDevice.set(name, {
            name,
            qty: prev.qty + s.quantity,
            revenue: prev.revenue + (Number(s.amount) || 0) * s.quantity,
          });
        });
        const rankedDevices = [...qtyByDevice.values()]
          .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);

        // 3. Acessório Mais Vendido (apenas pagos / valor > 0, agrupados por nome)
        const accessorySales = sales.filter((s) => {
          const prod = productMap.get(s.product_id);
          return isCountableAccessorySale(s, prod?.name);
        });
        const qtyByAccessory = new Map<string, { name: string; qty: number; revenue: number }>();
        accessorySales.forEach((s) => {
          const prod = productMap.get(s.product_id);
          const name = prod?.name?.trim() ?? 'Acessório sem nome';
          const prev = qtyByAccessory.get(name) ?? { name, qty: 0, revenue: 0 };
          qtyByAccessory.set(name, {
            name,
            qty: prev.qty + s.quantity,
            revenue: prev.revenue + (Number(s.amount) || 0) * s.quantity,
          });
        });
        const rankedAccessories = [...qtyByAccessory.values()]
          .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue);

        setData({
          weeklySold,
          weeklyTarget,
          metaAtingida: weeklyTarget > 0 && weeklySold >= weeklyTarget,
          remaining: Math.max(0, weeklyTarget - weeklySold),
          percent: weeklyTarget > 0 ? Math.min(100, Math.round((weeklySold / weeklyTarget) * 100)) : 0,
          topSales,
          topProduct: rankedProducts[0]?.name ?? 'Sem vendas',
          topProductQty: rankedProducts[0]?.qty ?? 0,
          topDevice: rankedDevices[0]?.name ?? 'Nenhum aparelho vendido',
          topDeviceQty: rankedDevices[0]?.qty ?? 0,
          topAccessory: rankedAccessories[0]?.name ?? 'Sem vendas de acessórios',
          topAccessoryQty: rankedAccessories[0]?.qty ?? 0,
        });
      })
      .catch((err) => {
        console.error('Erro ao carregar dados do Painel da Loja:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const metaAtingida = data?.metaAtingida ?? false;

  return (
    <div className="store-panel-container" ref={containerRef}>
      {/* Top Header */}
      <div className="store-panel-header">
        <div className="store-panel-header-badges">
          <div 
            className={`sleek-theme-switch ${theme === 'dark' ? 'dark-active' : ''}`} 
            onClick={toggleTheme} 
            title="Alternar Modo Claro/Escuro"
            style={{ cursor: 'pointer' }}
          >
            <Sun size={13} color="#ffffff" className="switch-icon-sun" />
            <Moon size={13} color="#ffffff" className="switch-icon-moon" />
            <div className="switch-thumb" />
          </div>

          <div className="live-indicator">
            <span className="live-dot" />
            Ao Vivo
          </div>

          <div className="store-panel-date-badge">
            <Calendar size={16} color="var(--primary)" />
            <span>
              {String(now.getDate()).padStart(2, '0')} {MONTH_ABBR[now.getMonth()]} {now.getFullYear()}
            </span>
          </div>

          <button 
            className="btn-fullscreen" 
            onClick={toggleFullscreen}
            title={isFullscreen ? "Sair da tela cheia" : "Modo tela cheia"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span>{isFullscreen ? 'Janela' : 'Tela Cheia'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="store-panel-grid">
          <div className="skeleton-card" style={{ minHeight: '480px' }} />
          <div className="store-panel-right-col">
            <div className="store-rankings-row">
              <div className="skeleton-card" style={{ minHeight: '260px' }} />
            </div>
            <div className="store-bottom-row">
              <div className="skeleton-card" style={{ minHeight: '100px' }} />
              <div className="skeleton-card" style={{ minHeight: '100px' }} />
            </div>
          </div>
        </div>
      ) : (
        <div className="store-panel-grid">
          {/* Lado Esquerdo - Card de Meta */}
          <div className={`store-goal-card ${metaAtingida ? 'goal-achieved' : ''}`}>
            {metaAtingida ? (
              <>
                <div className="goal-card-tag">
                  <img src={trophyGold} alt="" className="goal-tag-trophy-icon" />
                  Meta Superada
                </div>
                <img 
                  src={trophyGold} 
                  alt="Meta Superada" 
                  className="goal-trophy-image"
                />
                <h2 style={{ fontSize: '38px', fontWeight: 800, marginBottom: '12px', color: 'var(--text-dark)' }}>
                  META ATINGIDA!
                </h2>
                <p style={{ fontSize: '18px', color: 'var(--text-muted)', maxWidth: '380px', marginBottom: '24px' }}>
                  A equipe superou a meta semanal com maestria!
                </p>
                <div className="goal-numbers-wrapper">
                  <span className="goal-current-num" style={{ color: '#10B981' }}>
                    {(data?.weeklySold ?? 0).toLocaleString('pt-BR')}
                  </span>
                  <span className="goal-separator">/</span>
                  <span className="goal-target-num">
                    {(data?.weeklyTarget ?? 0).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="goal-progress-bar-bg">
                  <div 
                    className="goal-progress-bar-fill achieved" 
                    style={{ width: '100%' }} 
                  />
                </div>
                <div className="goal-footer-info">
                  <span>Concluído</span>
                  <span className="goal-percent-badge" style={{ color: '#10B981' }}>
                    {data?.percent ?? 100}%
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="goal-card-tag">
                  <Target size={16} />
                  Objetivo Semanal
                </div>
                <h2 className="goal-card-title">Meta da Semana</h2>
                
                <div className="goal-numbers-wrapper">
                  <span className="goal-current-num">
                    {(data?.weeklySold ?? 0).toLocaleString('pt-BR')}
                  </span>
                  <span className="goal-separator">/</span>
                  <span className="goal-target-num">
                    {(data?.weeklyTarget ?? 0).toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className="goal-progress-bar-bg">
                  <div 
                    className="goal-progress-bar-fill" 
                    style={{ width: `${data?.percent ?? 0}%` }} 
                  />
                </div>

                <div className="goal-footer-info">
                  <span>Faltam <strong>{(data?.remaining ?? 0).toLocaleString('pt-BR')}</strong> vendas</span>
                  <span className="goal-percent-badge">{data?.percent ?? 0}%</span>
                </div>
              </>
            )}
          </div>

          {/* Lado Direito - Rankings e Produtos */}
          <div className="store-panel-right-col">
            <div className="store-rankings-row">
              {/* Top 3 Vendas - Pódio */}
              <div className="store-ranking-card store-podium-card">
                <div className="store-ranking-header">
                  <Trophy size={18} color="var(--primary)" />
                  <h3>Top Vendedores da Semana</h3>
                </div>

                {(data?.topSales ?? []).length > 0 ? (
                  <div className="store-podium-wrapper">
                    <LeaderboardPodium
                      rankings={(data?.topSales ?? []).map((item, index) => ({
                        userId: item.seller.id,
                        userName: item.seller.name,
                        rank: index + 1,
                        value: item.sold,
                        avatarUrl: item.seller.photo_url || null,
                      }))}
                      size="default"
                      medalStyle="classic"
                      showValue={true}
                      showAvatar={true}
                    />
                  </div>
                ) : (
                  <span className="text-muted" style={{ textAlign: 'center', padding: '32px 0' }}>
                    Sem vendas registradas nesta semana.
                  </span>
                )}
              </div>
            </div>

            {/* Destaques de Aparelhos e Acessórios */}
            <div className="store-bottom-row">
              {/* Card 1: Aparelho Mais Vendido (iPhones) */}
              <div className="store-stat-pill-card">
                <div className="store-stat-icon-wrapper device">
                  <Smartphone size={24} />
                </div>
                <div className="store-stat-info">
                  <span className="store-stat-label">Aparelho Mais Vendido</span>
                  <span className="store-stat-val" title={data?.topDevice}>
                    {data?.topDevice ?? 'Nenhum aparelho vendido'}
                  </span>
                  {Boolean(data?.topDeviceQty && data.topDeviceQty > 0) && (
                    <span className="store-stat-subtext">
                      {data?.topDeviceQty} {data?.topDeviceQty === 1 ? 'unidade vendida' : 'unidades vendidas'}
                    </span>
                  )}
                </div>
              </div>

              {/* Card 2: Acessório Mais Vendido */}
              <div className="store-stat-pill-card">
                <div className="store-stat-icon-wrapper accessory">
                  <Headphones size={24} />
                </div>
                <div className="store-stat-info">
                  <span className="store-stat-label">Acessório Mais Vendido</span>
                  <span className="store-stat-val" title={data?.topAccessory}>
                    {data?.topAccessory ?? '-'}
                  </span>
                  {Boolean(data?.topAccessoryQty && data.topAccessoryQty > 0) && (
                    <span className="store-stat-subtext">
                      {data?.topAccessoryQty} {data?.topAccessoryQty === 1 ? 'unidade vendida' : 'unidades vendidas'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
