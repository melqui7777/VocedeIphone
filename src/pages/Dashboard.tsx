import React, { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip, Legend } from 'chart.js';
import { TrendingUp, Target, CircleDollarSign, ChevronLeft, ChevronRight } from 'lucide-react';
import './Dashboard.css';
import { useTheme } from '../context/ThemeContext';
import {
  fetchGoals,
  fetchSalesInRange,
  fetchProducts,
  fetchVisibleSellers,
  fetchAllConversations,
  computeSellerPerformance,
  getWeekRange,
  getMonthRange,
  getDayRange,
  type SellerPerformance,
} from '../lib/api';

ChartJS.register(ArcElement, ChartTooltip, Legend);

const donutOptions = {
  plugins: {
    legend: {
      display: false
    }
  },
  maintainAspectRatio: false,
};

const MONTH_NAMES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface DashboardData {
  weeklySold: number;
  weeklyTarget: number;
  monthlySold: number;
  monthlyTarget: number;
  topProducts: { name: string; qty: number }[];
  totalUnitsSold: number;
  topSellers: SellerPerformance[];
  topConversion: SellerPerformance[];
}

export function Dashboard() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [dayChartData, setDayChartData] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    const now = new Date();
    const { start: weekStart, end: weekEnd } = getWeekRange(now);
    const { start: monthStart, end: monthEnd } = getMonthRange(now);

    Promise.all([
      fetchGoals(),
      fetchSalesInRange(weekStart, weekEnd),
      fetchSalesInRange(monthStart, monthEnd),
      fetchProducts(),
      fetchVisibleSellers(),
      fetchAllConversations(),
    ]).then(([goals, weekSales, monthSales, products, sellers, conversations]) => {
      const weeklySold = weekSales.reduce((sum, s) => sum + s.quantity, 0);
      const monthlySold = monthSales.reduce((sum, s) => sum + s.quantity, 0);

      const productMap = new Map(products.map((p) => [p.id, p]));
      const qtyByProduct = new Map<string, number>();
      monthSales.forEach((s) => qtyByProduct.set(s.product_id, (qtyByProduct.get(s.product_id) ?? 0) + s.quantity));
      const topProducts = [...qtyByProduct.entries()]
        .map(([id, qty]) => ({ name: productMap.get(id)?.name ?? 'Produto removido', qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 3);

      const performance = computeSellerPerformance(sellers, monthSales, conversations, products);
      const topSellers = [...performance].sort((a, b) => b.sold - a.sold).slice(0, 3);
      const topConversion = [...performance].sort((a, b) => b.conversion - a.conversion).slice(0, 3);

      setData({
        weeklySold,
        weeklyTarget: goals.weekly_devices_target + goals.weekly_accessories_target,
        monthlySold,
        monthlyTarget: goals.monthly_devices_target + goals.monthly_accessories_target,
        topProducts,
        totalUnitsSold: monthlySold,
        topSellers,
        topConversion,
      });
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const { start, end } = getDayRange(selectedDate);
    fetchSalesInRange(start, end).then((sales) => {
      const byHour = new Array(24).fill(0);
      sales.forEach((s) => {
        byHour[new Date(s.sold_at).getHours()] += s.quantity;
      });
      setDayChartData(byHour.map((value, hour) => ({ name: `${String(hour).padStart(2, '0')}h`, value })));
    });
  }, [selectedDate]);

  const chartColor = isDark ? '#3B82F6' : '#0A25FF';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#E5E7EB';
  const donutBg = isDark ? ['#3B82F6', '#8B5CF6', '#334155'] : ['#0A25FF', '#000000', '#E5E7EB'];

  const weekDays = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    const { start } = getWeekRange(d);
    return Array.from({ length: 7 }, (_, i) => {
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    });
  }, [weekOffset]);

  const displayMonthYear = useMemo(() => {
    if (weekDays.length === 0) return '';
    const first = weekDays[0];
    const last = weekDays[6];
    if (first.getMonth() === last.getMonth()) {
      return `${MONTH_NAMES_FULL[first.getMonth()]} ${first.getFullYear()}`;
    } else if (first.getFullYear() === last.getFullYear()) {
      return `${MONTH_NAMES_FULL[first.getMonth()]} / ${MONTH_NAMES_FULL[last.getMonth()]} ${first.getFullYear()}`;
    } else {
      return `${MONTH_NAMES_FULL[first.getMonth()]} ${first.getFullYear()} / ${MONTH_NAMES_FULL[last.getMonth()]} ${last.getFullYear()}`;
    }
  }, [weekDays]);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const handlePrevWeek = () => {
    setWeekOffset((prev) => {
      const nextOffset = prev - 1;
      const d = new Date();
      d.setDate(d.getDate() + nextOffset * 7);
      const { start } = getWeekRange(d);
      const currentDayIdx = (selectedDate.getDay() + 6) % 7;
      const targetDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + currentDayIdx);
      setSelectedDate(targetDate);
      return nextOffset;
    });
  };

  const handleNextWeek = () => {
    setWeekOffset((prev) => {
      const nextOffset = prev + 1;
      const d = new Date();
      d.setDate(d.getDate() + nextOffset * 7);
      const { start } = getWeekRange(d);
      const currentDayIdx = (selectedDate.getDay() + 6) % 7;
      const targetDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + currentDayIdx);
      setSelectedDate(targetDate);
      return nextOffset;
    });
  };

  const donutData = {
    labels: data?.topProducts.map((p) => p.name) ?? [],
    datasets: [
      {
        data: data?.topProducts.map((p) => p.qty) ?? [],
        backgroundColor: donutBg,
        borderWidth: 0,
        cutout: '75%',
      },
    ],
  };

  const weeklyPercent = data && data.weeklyTarget > 0 ? Math.round((data.weeklySold / data.weeklyTarget) * 100) : 0;
  const monthlyPercent = data && data.monthlyTarget > 0 ? Math.round((data.monthlySold / data.monthlyTarget) * 100) : 0;

  return (
    <div className="dashboard" style={{ opacity: loading ? 0.6 : 1 }}>
      <div className="grid-cards">
        <div className="stat-card">
          <div className="stat-icon-wrapper">
            <span className="stat-icon"><TrendingUp size={24} /></span>
          </div>
          <div className="stat-info">
            <span className="stat-label">Meta da Semana</span>
            <span className="stat-value">{(data?.weeklySold ?? 0).toLocaleString('pt-BR')}</span>
            <span className="stat-trend positive">{weeklyPercent}% da meta ({(data?.weeklyTarget ?? 0).toLocaleString('pt-BR')})</span>
          </div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-icon-wrapper">
            <span className="stat-icon"><Target size={24} /></span>
          </div>
          <div className="stat-info">
            <span className="stat-label">Meta do Mês</span>
            <span className="stat-value">{(data?.monthlySold ?? 0).toLocaleString('pt-BR')}</span>
            <span className="stat-trend positive">{monthlyPercent}% da meta ({(data?.monthlyTarget ?? 0).toLocaleString('pt-BR')})</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper">
            <span className="stat-icon"><CircleDollarSign size={24} /></span>
          </div>
          <div className="stat-info">
            <span className="stat-label">Total de Vendas no Mês</span>
            <span className="stat-value">{(data?.monthlySold ?? 0).toLocaleString('pt-BR')}</span>
            <span className="stat-trend">Produtos vendidos</span>
          </div>
        </div>
      </div>

      <div className="grid-dashboard" style={{marginTop: '24px'}}>
        <div className="flex-col gap-6">
          <div className="card chart-card">
            <div className="chart-header">
              <h2 className="h2">Evolução de Vendas</h2>
              <span className="text-muted text-sm">{selectedDate.getDate()} de {MONTH_NAMES_FULL[selectedDate.getMonth()]}</span>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dayChartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} width={70} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#131926' : '#FFFFFF',
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                      color: isDark ? '#F9FAFB' : '#1F2937',
                      borderRadius: '8px'
                    }}
                  />
                  <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="date-selector">
            <h2 className="h2" style={{marginBottom: '16px'}}>{displayMonthYear}</h2>
            <div className="days-row">
              <button 
                className="nav-arrow" 
                onClick={handlePrevWeek} 
                title="Semana anterior" 
                aria-label="Semana anterior"
              >
                <ChevronLeft size={20} />
              </button>
              {weekDays.map((d) => (
                <div
                  className={`day ${isSameDay(d, selectedDate) ? 'active' : ''}`}
                  key={d.toISOString()}
                  onClick={() => setSelectedDate(d)}
                >
                  <span className="day-name">{WEEKDAY_NAMES[d.getDay()]}</span>
                  <span className="day-num">{d.getDate()}</span>
                </div>
              ))}
              <button 
                className="nav-arrow" 
                onClick={handleNextWeek} 
                title="Próxima semana" 
                aria-label="Próxima semana"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-col gap-6">
          <div className="card donut-card">
            <h2 className="h2">Produto Mais Vendido</h2>
            {data && data.topProducts.length > 0 ? (
              <div className="donut-container">
                <div className="donut-chart-wrapper">
                  <Doughnut data={donutData} options={donutOptions} />
                  <div className="donut-center-text">
                    <span className="donut-label">Total Vendas</span>
                    <span className="donut-value">{data.totalUnitsSold.toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                <div className="donut-legend">
                  {data.topProducts.map((p, i) => (
                    <div className="legend-item" key={p.name}>
                      <span className="legend-color" style={{backgroundColor: donutBg[i]}}></span>
                      <span className="legend-text">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted" style={{ padding: '24px 0', textAlign: 'center' }}>Nenhuma venda registrada este mês.</p>
            )}
          </div>

          <div className="card progress-card">
            <h2 className="h2">Vendedor do Mês</h2>
            {data && data.topSellers.length > 0 ? (
              <div className="progress-list">
                {data.topSellers.map(({ seller, sold }, i) => (
                  <div className="progress-item" key={seller.id}>
                    <div className="progress-header">
                      <span className="progress-name">{seller.name}</span>
                      <span className="progress-percent">{sold} un.</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{width: `${data.totalUnitsSold > 0 ? Math.round((sold / data.totalUnitsSold) * 100) : 0}%`, backgroundColor: donutBg[i % donutBg.length]}}></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ padding: '16px 0', textAlign: 'center' }}>Sem vendas registradas este mês.</p>
            )}
          </div>

          <div className="card progress-card">
            <h2 className="h2">Ranking de Conversão</h2>
            {data && data.topConversion.length > 0 ? (
              <div className="progress-list">
                {data.topConversion.map(({ seller, conversion }, i) => (
                  <div className="progress-item" key={seller.id}>
                    <div className="progress-header">
                      <span className="progress-name">{seller.name}</span>
                      <span className="progress-percent">{conversion}%</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{width: `${conversion}%`, backgroundColor: donutBg[i % donutBg.length]}}></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ padding: '16px 0', textAlign: 'center' }}>Sem dados de conversas ainda.</p>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
