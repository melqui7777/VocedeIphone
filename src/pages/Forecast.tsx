import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Package, Target, Users, Calendar, TrendingUp, ShoppingBag } from 'lucide-react';
import './Forecast.css';
import { useTheme } from '../context/ThemeContext';
import {
  fetchGoals,
  fetchSalesInRange,
  fetchProducts,
  fetchVisibleSellers,
  classifyProductCategory,
  getMonthRange,
} from '../lib/api';
import type { Sale, Product, Seller, Goals } from '../lib/database.types';

type CategoryFilter = 'all' | 'devices' | 'accessories';

interface ForecastCategoryData {
  title: string;
  totalForecast: number;
  target: number;
  metaChance: number;
  avgSeller: number;
  dailyRate: number;
  dailyActual: number;
  chartData: { name: string; produtos: number; meta: number }[];
}

interface CategoryBreakdownItem {
  name: string;
  projected: number;
  target: number;
  color: string;
}

interface SellerForecastItem {
  name: string;
  initials: string;
  projectedUnits: number;
  targetUnits: number;
  percent: number;
}

const CHART_POINTS = [0, 0.25, 0.5, 0.75, 1];
const CHART_LABELS = ['Atual', 'Semana 1', 'Semana 2', 'Semana 3', 'Fim do Mês'];

function buildCategoryData(title: string, soldSoFar: number, target: number, daysElapsed: number, daysInMonth: number): ForecastCategoryData {
  const dailyActual = daysElapsed > 0 ? soldSoFar / daysElapsed : 0;
  const totalForecast = Math.round(dailyActual * daysInMonth);
  const remainingDays = Math.max(0, daysInMonth - daysElapsed);
  const dailyRate = remainingDays > 0 ? Math.ceil(Math.max(0, target - soldSoFar) / remainingDays) : Math.max(0, target - soldSoFar);
  const progressFraction = daysInMonth > 0 ? daysElapsed / daysInMonth : 0;

  const chartData = CHART_POINTS.map((t, i) => ({
    name: CHART_LABELS[i],
    produtos: Math.round(soldSoFar + (totalForecast - soldSoFar) * t),
    meta: Math.round(target * (progressFraction + t * (1 - progressFraction))),
  }));

  return {
    title,
    totalForecast,
    target,
    metaChance: target > 0 ? Math.min(100, Math.round((totalForecast / target) * 100)) : 0,
    avgSeller: 0,
    dailyRate,
    dailyActual: Math.round(dailyActual),
    chartData,
  };
}

function computeForecast(sales: Sale[], products: Product[], sellers: Seller[], goals: Goals, activeSellerCount: number) {
  const now = new Date();
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const productMap = new Map(products.map((p) => [p.id, p]));
  const soldByCategory = { Aparelhos: 0, Acessórios: 0 };
  sales.forEach((s) => {
    const prod = productMap.get(s.product_id);
    const category = classifyProductCategory(prod?.name);
    const amount = Number(s.amount) || 0;
    if (category === 'Aparelhos') {
      soldByCategory.Aparelhos += s.quantity;
    } else if (category === 'Acessórios' && amount > 0) {
      soldByCategory.Acessórios += s.quantity;
    }
  });

  const devicesTarget = goals.monthly_devices_target;
  const accessoriesTarget = goals.monthly_accessories_target;

  const byFilter: Record<CategoryFilter, ForecastCategoryData> = {
    all: buildCategoryData('Previsão Geral de Produtos', soldByCategory.Aparelhos + soldByCategory['Acessórios'], devicesTarget + accessoriesTarget, daysElapsed, daysInMonth),
    devices: buildCategoryData('Previsão de Aparelhos (iPhones)', soldByCategory.Aparelhos, devicesTarget, daysElapsed, daysInMonth),
    accessories: buildCategoryData('Previsão de Acessórios', soldByCategory['Acessórios'], accessoriesTarget, daysElapsed, daysInMonth),
  };
  (Object.keys(byFilter) as CategoryFilter[]).forEach((key) => {
    byFilter[key].avgSeller = activeSellerCount > 0 ? Math.round(byFilter[key].totalForecast / activeSellerCount) : 0;
  });

  const categoryBreakdown: CategoryBreakdownItem[] = [
    { name: 'Aparelhos', projected: byFilter.devices.totalForecast, target: devicesTarget, color: '#0A25FF' },
    { name: 'Acessórios', projected: byFilter.accessories.totalForecast, target: accessoriesTarget, color: '#10B981' },
  ];

  const soldBySeller = new Map<string, number>();
  sales.forEach((s) => {
    const prod = productMap.get(s.product_id);
    const category = classifyProductCategory(prod?.name);
    const amount = Number(s.amount) || 0;
    if (category === 'Aparelhos' || (category === 'Acessórios' && amount > 0) || (!category && amount > 0)) {
      soldBySeller.set(s.seller_id, (soldBySeller.get(s.seller_id) ?? 0) + s.quantity);
    }
  });
  const perSellerTarget = activeSellerCount > 0 ? Math.round((devicesTarget + accessoriesTarget) / activeSellerCount) : 0;

  const sellerForecast: SellerForecastItem[] = sellers
    .filter((seller) => seller.active)
    .map((seller) => {
      const soldSoFar = soldBySeller.get(seller.id) ?? 0;
      const dailyActual = daysElapsed > 0 ? soldSoFar / daysElapsed : 0;
      const projectedUnits = Math.round(dailyActual * daysInMonth);
      const initials = seller.name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
      return {
        name: seller.name,
        initials,
        projectedUnits,
        targetUnits: perSellerTarget,
        percent: perSellerTarget > 0 ? Math.round((projectedUnits / perSellerTarget) * 100) : 0,
      };
    })
    .sort((a, b) => b.projectedUnits - a.projectedUnits);

  return { byFilter, categoryBreakdown, sellerForecast };
}

export function Forecast() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const chartColor = isDark ? '#3B82F6' : '#0A25FF';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#E5E7EB';

  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [forecast, setForecast] = useState<ReturnType<typeof computeForecast> | null>(null);

  useEffect(() => {
    const now = new Date();
    const { start, end } = getMonthRange(now);
    Promise.all([fetchGoals(), fetchSalesInRange(start, end), fetchProducts(), fetchVisibleSellers()]).then(
      ([goals, sales, products, sellers]) => {
        const activeSellerCount = sellers.filter((s) => s.active).length;
        setForecast(computeForecast(sales, products, sellers, goals, activeSellerCount));
      }
    );
  }, []);

  const currentData = forecast?.byFilter[filter];

  return (

    <div className="forecast-container">
      {/* Header with Title and Category Filters */}
      <div className="forecast-header-row">
        <div>
          <h1 className="h1">Forecast de Produtos</h1>
          <p className="text-muted" style={{ fontSize: '13px', marginTop: '4px' }}>
            Projeção linear com base no ritmo de vendas do mês até agora
          </p>
        </div>

        <div className="category-tabs">
          <button
            className={`category-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todos os Produtos
          </button>
          <button
            className={`category-tab ${filter === 'devices' ? 'active' : ''}`}
            onClick={() => setFilter('devices')}
          >
            Aparelhos
          </button>
          <button
            className={`category-tab ${filter === 'accessories' ? 'active' : ''}`}
            onClick={() => setFilter('accessories')}
          >
            Acessórios
          </button>
        </div>
      </div>

      {/* Top Cards Row */}
      <div className="forecast-cards-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper">
            <Package size={22} color="var(--primary)" />
          </div>
          <div className="stat-info">
            <span className="stat-label">Previsão de Produtos</span>
            <span className="stat-value">{(currentData?.totalForecast ?? 0).toLocaleString('pt-BR')} un.</span>
            <span className="forecast-stat-sub">Meta: {(currentData?.target ?? 0).toLocaleString('pt-BR')} un.</span>
          </div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-icon-wrapper">
            <Target size={22} color="#FFFFFF" />
          </div>
          <div className="stat-info">
            <span className="stat-label">Chance de Bater a Meta</span>
            <span className="stat-value">{currentData?.metaChance ?? 0}%</span>
            <span className="forecast-stat-sub">Estimativa por ritmo linear de vendas</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper">
            <Users size={22} color="var(--primary)" />
          </div>
          <div className="stat-info">
            <span className="stat-label">Projeção Média/Vendedor</span>
            <span className="stat-value">{(currentData?.avgSeller ?? 0).toLocaleString('pt-BR')} un.</span>
            <span className="forecast-stat-sub">Base de {forecast?.sellerForecast.length ?? 0} vendedores ativos</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper">
            <Calendar size={22} color="var(--primary)" />
          </div>
          <div className="stat-info">
            <span className="stat-label">Ritmo Diário Necessário</span>
            <span className="stat-value">{currentData?.dailyRate ?? 0} un./dia</span>
            <span className="forecast-stat-sub">Ritmo atual: {currentData?.dailyActual ?? 0} un./dia</span>
          </div>
        </div>
      </div>

      {/* Main Chart Section */}
      <div className="card forecast-chart-card">
        <div className="forecast-chart-header">
          <div>
            <h2 className="h2">{currentData?.title ?? ''}</h2>
            <span className="text-muted text-sm">Trajetória projetada em unidades de produtos até o fim do mês</span>
          </div>
          <div className="forecast-chart-legend text-sm">
            <div className="flex-center gap-2">
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#0A25FF', display: 'inline-block' }}></span>
              <span className="text-muted">Projeção de Unidades</span>
            </div>
            <div className="flex-center gap-2">
              <span style={{ width: '12px', height: '2px', backgroundColor: '#9CA3AF', display: 'inline-block' }}></span>
              <span className="text-muted">Curva de Meta</span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={currentData?.chartData ?? []} margin={{ top: 10, right: 30, left: 15, bottom: 0 }}>
              <defs>
                <linearGradient id="colorForecastProducts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} unit=" un" width={75} />
              <Tooltip
                formatter={(value: any, name: any) => [
                  `${Number(value || 0).toLocaleString('pt-BR')} unidades`,
                  name === 'produtos' ? 'Projeção de Produtos' : 'Meta Acumulada'
                ]}
                contentStyle={{
                  backgroundColor: isDark ? '#131926' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                  color: isDark ? '#F9FAFB' : '#1F2937',
                  borderRadius: '8px'
                }}
              />
              <Area
                type="monotone"
                dataKey="produtos"
                name="produtos"
                stroke={chartColor}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorForecastProducts)"
              />
            </AreaChart>

          </ResponsiveContainer>
        </div>
      </div>

      {/* Breakdown Grid: Category Progress & Seller Ranking Forecast */}
      <div className="grid-dashboard">
        {/* Left Column: Projeção por Categoria */}
        <div className="card flex-col gap-4">
          <div className="flex-between">
            <h2 className="h2 flex-center gap-2">
              <ShoppingBag size={20} color="var(--primary)" />
              Projeção por Categoria de Produto
            </h2>
            <span className="text-muted text-sm">Unidades Projetadas vs Meta</span>
          </div>

          <div className="progress-list" style={{ marginTop: '12px' }}>
            {(forecast?.categoryBreakdown ?? []).map((cat, index) => {
              const percentage = cat.target > 0 ? Math.round((cat.projected / cat.target) * 100) : 0;
              return (
                <div key={index} className="flex-col gap-1">
                  <div className="progress-header">
                    <span className="progress-name">{cat.name}</span>
                    <span className="progress-percent">
                      <strong>{cat.projected.toLocaleString('pt-BR')} un.</strong> / {cat.target.toLocaleString('pt-BR')} un. ({percentage}%)
                    </span>
                  </div>
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(percentage, 100)}%`,
                        backgroundColor: index === 0 ? chartColor : cat.color,
                      }}
                    />
                  </div>

                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Top Projeções por Vendedor */}
        <div className="card flex-col gap-4">
          <div className="flex-between">
            <h2 className="h2 flex-center gap-2">
              <TrendingUp size={20} color="var(--primary)" />
              Projeção por Vendedor
            </h2>
            <span className="text-muted text-sm">Em produtos</span>
          </div>

          <div className="flex-col gap-3" style={{ marginTop: '4px' }}>
            {(forecast?.sellerForecast ?? []).length === 0 && (
              <span className="text-muted">Nenhum vendedor ativo cadastrado.</span>
            )}
            {(forecast?.sellerForecast ?? []).map((seller, idx) => (
              <div key={idx} className="seller-forecast-item">
                <div className="flex-center gap-3">
                  <div className="seller-avatar">{seller.initials}</div>
                  <div className="flex-col">
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{seller.name}</span>
                    <span className="text-muted text-sm">
                      Meta: {seller.targetUnits} un.
                    </span>
                  </div>
                </div>

                <div className="flex-col" style={{ alignItems: 'flex-end', gap: '2px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-dark)' }}>
                    {seller.projectedUnits} un.
                  </span>
                  <span className={`badge-unit ${seller.percent >= 100 ? 'success' : seller.percent < 90 ? 'warning' : ''}`}>
                    {seller.percent}% da meta
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
