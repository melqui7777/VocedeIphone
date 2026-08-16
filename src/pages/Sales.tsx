import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarClock,
  CalendarRange,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Trophy,
  Package,
} from 'lucide-react';
import './Sales.css';
import {
  fetchProducts,
  fetchSellers,
  fetchSalesInRange,
  getWeekRange,
  getMonthRange,
  getDayRange,
} from '../lib/api';
import type { Sale, Product, Seller } from '../lib/database.types';

const WEEKDAY_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTH_NAMES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type PeriodFilter = 'today' | 'week' | 'month' | 'custom';

interface SaleRow extends Sale {
  productName: string;
  productCategory: 'Aparelhos' | 'Acessórios' | null;
  sellerName: string;
}

interface BreakdownData {
  totalSales: number;
  totalUnits: number;
  sellerRanking: { id: string; name: string; count: number }[];
  productList: { id: string; name: string; qty: number }[];
}

/** Junta vendas (já vindas de uma consulta com período limitado) com os mapas de produto/vendedor. */
function joinSales(sales: Sale[], productMap: Map<string, Product>, sellerMap: Map<string, Seller>): SaleRow[] {
  return sales
    .map((sale) => {
      const product = productMap.get(sale.product_id);
      const seller = sellerMap.get(sale.seller_id);
      return {
        ...sale,
        productName: product?.name ?? 'Produto removido',
        productCategory: product?.category ?? null,
        sellerName: seller?.name ?? 'Vendedor removido',
      };
    })
    .sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime());
}

function computeBreakdown(rows: SaleRow[]): BreakdownData {
  const bySeller = new Map<string, { id: string; name: string; count: number }>();
  const byProduct = new Map<string, { id: string; name: string; qty: number }>();
  let totalUnits = 0;

  for (const row of rows) {
    totalUnits += row.quantity;

    const seller = bySeller.get(row.seller_id) ?? { id: row.seller_id, name: row.sellerName, count: 0 };
    seller.count += 1;
    bySeller.set(row.seller_id, seller);

    const product = byProduct.get(row.product_id) ?? { id: row.product_id, name: row.productName, qty: 0 };
    product.qty += row.quantity;
    byProduct.set(row.product_id, product);
  }

  return {
    totalSales: rows.length,
    totalUnits,
    sellerRanking: [...bySeller.values()].sort((a, b) => b.count - a.count),
    productList: [...byProduct.values()].sort((a, b) => b.qty - a.qty),
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

// ============================================================
// Stat card (clicável, abre popover de resumo)
// ============================================================
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: string;
  active: boolean;
  onClick: () => void;
}

function StatCard({ icon, label, value, trend, active, onClick }: StatCardProps) {
  return (
    <div
      className={`stat-card sales-stat-card ${active ? 'active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      <div className="stat-icon-wrapper">
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-info">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
        <span className="stat-trend">{trend}</span>
      </div>
    </div>
  );
}

// ============================================================
// Card "Vendas do Mês" — navegável por mês/ano, sem carregar o histórico inteiro
// ============================================================
interface MonthStatCardProps {
  viewDate: Date;
  value: string;
  trend: string;
  active: boolean;
  onOpenBreakdown: () => void;
  onOpenPicker: () => void;
  onNavigate: (delta: number) => void;
}

function MonthStatCard({ viewDate, value, trend, active, onOpenBreakdown, onOpenPicker, onNavigate }: MonthStatCardProps) {
  return (
    <div className={`stat-card sales-stat-card sales-month-card ${active ? 'active' : ''}`}>
      <div className="stat-icon-wrapper">
        <span className="stat-icon"><CalendarDays size={22} /></span>
      </div>
      <div className="stat-info" style={{ flex: 1 }}>
        <div className="sales-month-nav">
          <button className="sales-month-arrow" onClick={() => onNavigate(-1)} aria-label="Mês anterior">
            <ChevronLeft size={14} />
          </button>
          <button className="sales-month-label" onClick={onOpenPicker} title="Escolher mês e ano">
            {MONTH_NAMES_SHORT[viewDate.getMonth()]}/{viewDate.getFullYear()}
          </button>
          <button className="sales-month-arrow" onClick={() => onNavigate(1)} aria-label="Próximo mês">
            <ChevronRight size={14} />
          </button>
        </div>
        <button className="sales-stat-value-btn" onClick={onOpenBreakdown}>
          <span className="stat-value">{value}</span>
          <span className="stat-trend">{trend}</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Popover de resumo (Hoje / Semana / Mês / Data)
// ============================================================
interface BreakdownPopoverProps {
  title: string;
  subtitle: string;
  breakdown: BreakdownData;
  loading?: boolean;
  onClose: () => void;
  onViewAll: () => void;
  emptyLabel: string;
}

function BreakdownPopover({ title, subtitle, breakdown, loading, onClose, onViewAll, emptyLabel }: BreakdownPopoverProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="sales-popover" onClick={(e) => e.stopPropagation()}>
        <div className="sales-popover-header">
          <div>
            <h3 className="sales-popover-title">{title}</h3>
            <p className="text-muted text-sm">{subtitle}</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="sales-popover-empty text-muted">Carregando...</div>
        ) : breakdown.totalSales === 0 ? (
          <div className="sales-popover-empty text-muted">{emptyLabel}</div>
        ) : (
          <div className="sales-popover-body">
            <div className="sales-popover-totals">
              <div>
                <span className="sales-popover-total-value">{breakdown.totalSales}</span>
                <span className="text-muted text-sm">vendas</span>
              </div>
              <div>
                <span className="sales-popover-total-value">{breakdown.totalUnits}</span>
                <span className="text-muted text-sm">produtos vendidos</span>
              </div>
            </div>

            <div className="sales-popover-section">
              <h4 className="sales-popover-section-title">
                <Trophy size={14} color="var(--primary)" /> Ranking de vendedores
              </h4>
              <div className="sales-popover-list">
                {breakdown.sellerRanking.map((s, idx) => (
                  <div className="sales-popover-row" key={s.id}>
                    <span className="sales-popover-rank">{idx + 1}º</span>
                    <span className="sales-popover-row-name">{s.name}</span>
                    <span className="sales-popover-row-value">{s.count} vendas</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="sales-popover-section">
              <h4 className="sales-popover-section-title">
                <Package size={14} color="var(--primary)" /> Produtos vendidos
              </h4>
              <div className="sales-popover-list">
                {breakdown.productList.map((p) => (
                  <div className="sales-popover-row" key={p.id}>
                    <span className="sales-popover-row-name">{p.name}</span>
                    <span className="sales-popover-row-value">{p.qty} un.</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
          <button className="btn-primary" onClick={onViewAll} disabled={loading || breakdown.totalSales === 0}>
            Ver detalhes completos
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// "Vendas por data" popover — calendário (dia) + resumo
// ============================================================
interface DatePopoverProps {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  breakdown: BreakdownData | null;
  loading: boolean;
  onClose: () => void;
  onViewAll: () => void;
}

function DatePopover({ selectedDate, onSelectDate, breakdown, loading, onClose, onViewAll }: DatePopoverProps) {
  const [viewMonth, setViewMonth] = useState(() => selectedDate ?? new Date());

  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const today = new Date();

  const cells: (Date | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)),
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="sales-popover" onClick={(e) => e.stopPropagation()}>
        <div className="sales-popover-header">
          <div>
            <h3 className="sales-popover-title">Vendas por Data</h3>
            <p className="text-muted text-sm">Selecione uma data para ver o resumo</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="sales-calendar">
          <div className="sales-calendar-nav">
            <button
              className="sales-calendar-arrow"
              onClick={() => setViewMonth(addMonths(viewMonth, -1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="sales-calendar-month">{MONTH_NAMES_FULL[viewMonth.getMonth()]} {viewMonth.getFullYear()}</span>
            <button
              className="sales-calendar-arrow"
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              aria-label="Próximo mês"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="sales-calendar-grid sales-calendar-weekdays">
            {WEEKDAY_SHORT.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>

          <div className="sales-calendar-grid">
            {cells.map((date, i) => {
              if (!date) return <span key={i} />;
              const isToday = isSameDay(date, today);
              const isSelected = selectedDate && isSameDay(date, selectedDate);
              return (
                <button
                  key={i}
                  className={`sales-calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectDate(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {selectedDate && (
          loading ? (
            <div className="sales-popover-empty text-muted">Carregando...</div>
          ) : breakdown && breakdown.totalSales === 0 ? (
            <div className="sales-popover-empty text-muted">Nenhuma venda registrada em {formatDate(selectedDate.toISOString())}.</div>
          ) : breakdown ? (
            <div className="sales-popover-body">
              <div className="sales-popover-totals">
                <div>
                  <span className="sales-popover-total-value">{breakdown.totalSales}</span>
                  <span className="text-muted text-sm">vendas em {formatDate(selectedDate.toISOString())}</span>
                </div>
                <div>
                  <span className="sales-popover-total-value">{breakdown.totalUnits}</span>
                  <span className="text-muted text-sm">produtos vendidos</span>
                </div>
              </div>

              <div className="sales-popover-section">
                <h4 className="sales-popover-section-title">
                  <Trophy size={14} color="var(--primary)" /> Ranking de vendedores
                </h4>
                <div className="sales-popover-list">
                  {breakdown.sellerRanking.map((s, idx) => (
                    <div className="sales-popover-row" key={s.id}>
                      <span className="sales-popover-rank">{idx + 1}º</span>
                      <span className="sales-popover-row-name">{s.name}</span>
                      <span className="sales-popover-row-value">{s.count} vendas</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sales-popover-section">
                <h4 className="sales-popover-section-title">
                  <Package size={14} color="var(--primary)" /> Produtos vendidos
                </h4>
                <div className="sales-popover-list">
                  {breakdown.productList.map((p) => (
                    <div className="sales-popover-row" key={p.id}>
                      <span className="sales-popover-row-name">{p.name}</span>
                      <span className="sales-popover-row-value">{p.qty} un.</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
          <button className="btn-primary" onClick={onViewAll} disabled={loading || !selectedDate || !breakdown || breakdown.totalSales === 0}>
            Ver detalhes completos
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Popover "calendário de meses e anos" — navegar/pesquisar por período
// ============================================================
interface MonthYearPopoverProps {
  viewDate: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
}

function MonthYearPopover({ viewDate, onSelect, onClose }: MonthYearPopoverProps) {
  const [viewYear, setViewYear] = useState(viewDate.getFullYear());

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="sales-popover" onClick={(e) => e.stopPropagation()}>
        <div className="sales-popover-header">
          <div>
            <h3 className="sales-popover-title">Selecionar Período</h3>
            <p className="text-muted text-sm">Escolha o mês e o ano para consultar</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="sales-calendar">
          <div className="sales-calendar-nav">
            <button className="sales-calendar-arrow" onClick={() => setViewYear((y) => y - 1)} aria-label="Ano anterior">
              <ChevronLeft size={16} />
            </button>
            <span className="sales-calendar-month">{viewYear}</span>
            <button className="sales-calendar-arrow" onClick={() => setViewYear((y) => y + 1)} aria-label="Próximo ano">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="sales-month-grid">
            {MONTH_NAMES_SHORT.map((name, idx) => {
              const isSelected = viewYear === viewDate.getFullYear() && idx === viewDate.getMonth();
              return (
                <button
                  key={name}
                  className={`sales-month-grid-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => { onSelect(new Date(viewYear, idx, 1)); onClose(); }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Modal de detalhe de uma venda
// ============================================================
function SaleDetailModal({ sale, onClose }: { sale: SaleRow | null; onClose: () => void }) {
  if (!sale) return null;
  const unitPrice = sale.quantity > 0 ? sale.amount / sale.quantity : sale.amount;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="sales-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sales-popover-header">
          <div>
            <h3 className="sales-popover-title">Detalhes da Venda</h3>
            <p className="text-muted text-sm">{formatDateTime(sale.sold_at)}</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="sales-detail-grid">
          <div className="sales-detail-item">
            <span className="text-muted text-sm">Produto</span>
            <span className="sales-detail-value">{sale.productName}</span>
          </div>
          <div className="sales-detail-item">
            <span className="text-muted text-sm">Categoria</span>
            <span className="sales-detail-value">{sale.productCategory ?? '-'}</span>
          </div>
          <div className="sales-detail-item">
            <span className="text-muted text-sm">Vendedor</span>
            <span className="sales-detail-value">{sale.sellerName}</span>
          </div>
          <div className="sales-detail-item">
            <span className="text-muted text-sm">Quantidade</span>
            <span className="sales-detail-value">{sale.quantity} un.</span>
          </div>
          <div className="sales-detail-item">
            <span className="text-muted text-sm">Preço unitário</span>
            <span className="sales-detail-value">{formatCurrency(unitPrice)}</span>
          </div>
          <div className="sales-detail-item">
            <span className="text-muted text-sm">Valor total</span>
            <span className="sales-detail-value">{formatCurrency(sale.amount)}</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Página Vendas
// ============================================================
export function Sales() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loadingBase, setLoadingBase] = useState(true);

  const [todaySales, setTodaySales] = useState<Sale[]>([]);
  const [weekSales, setWeekSales] = useState<Sale[]>([]);

  const [viewDate, setViewDate] = useState(() => new Date());
  const [monthSales, setMonthSales] = useState<Sale[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(true);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [customDateSales, setCustomDateSales] = useState<Sale[]>([]);
  const [loadingCustomDate, setLoadingCustomDate] = useState(false);

  const [openPopover, setOpenPopover] = useState<'today' | 'week' | 'month' | 'date' | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [detailSale, setDetailSale] = useState<SaleRow | null>(null);

  const [productFilter, setProductFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Aparelhos' | 'Acessórios'>('all');
  const [sellerFilter, setSellerFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('month');
  const [search, setSearch] = useState('');

  const tableRef = React.useRef<HTMLDivElement>(null);

  // Carga inicial: só o essencial (produtos/vendedores p/ filtros) + hoje/semana, que são períodos pequenos.
  useEffect(() => {
    const now = new Date();
    const today = getDayRange(now);
    const week = getWeekRange(now);
    Promise.all([
      fetchProducts(),
      fetchSellers(),
      fetchSalesInRange(today.start, today.end),
      fetchSalesInRange(week.start, week.end),
    ])
      .then(([p, sel, todayS, weekS]) => {
        setProducts(p);
        setSellers(sel);
        setTodaySales(todayS);
        setWeekSales(weekS);
      })
      .finally(() => setLoadingBase(false));
  }, []);

  // Busca apenas o mês selecionado — nunca o histórico inteiro.
  useEffect(() => {
    setLoadingMonth(true);
    const { start, end } = getMonthRange(viewDate);
    fetchSalesInRange(start, end)
      .then(setMonthSales)
      .finally(() => setLoadingMonth(false));
  }, [viewDate]);

  // Busca sob demanda quando o dono escolhe uma data específica.
  useEffect(() => {
    if (!selectedDate) return;
    setLoadingCustomDate(true);
    const { start, end } = getDayRange(selectedDate);
    fetchSalesInRange(start, end)
      .then(setCustomDateSales)
      .finally(() => setLoadingCustomDate(false));
  }, [selectedDate]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const sellerMap = useMemo(() => new Map(sellers.map((s) => [s.id, s])), [sellers]);

  const todayRows = useMemo(() => joinSales(todaySales, productMap, sellerMap), [todaySales, productMap, sellerMap]);
  const weekRows = useMemo(() => joinSales(weekSales, productMap, sellerMap), [weekSales, productMap, sellerMap]);
  const monthRows = useMemo(() => joinSales(monthSales, productMap, sellerMap), [monthSales, productMap, sellerMap]);
  const selectedDateRows = useMemo(() => joinSales(customDateSales, productMap, sellerMap), [customDateSales, productMap, sellerMap]);

  const todayBreakdown = useMemo(() => computeBreakdown(todayRows), [todayRows]);
  const weekBreakdown = useMemo(() => computeBreakdown(weekRows), [weekRows]);
  const monthBreakdown = useMemo(() => computeBreakdown(monthRows), [monthRows]);
  const selectedDateBreakdown = useMemo(() => computeBreakdown(selectedDateRows), [selectedDateRows]);

  const sourceRows =
    periodFilter === 'today' ? todayRows :
    periodFilter === 'week' ? weekRows :
    periodFilter === 'custom' ? selectedDateRows :
    monthRows;

  const filteredRows = useMemo(() => {
    let result = sourceRows;
    if (productFilter !== 'all') result = result.filter((r) => r.product_id === productFilter);
    if (categoryFilter !== 'all') result = result.filter((r) => r.productCategory === categoryFilter);
    if (sellerFilter !== 'all') result = result.filter((r) => r.seller_id === sellerFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.productName.toLowerCase().includes(q));
    }
    return result;
  }, [sourceRows, productFilter, categoryFilter, sellerFilter, search]);

  const scrollToTable = () => {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const viewAll = (period: PeriodFilter) => {
    setProductFilter('all');
    setCategoryFilter('all');
    setSellerFilter('all');
    setSearch('');
    setPeriodFilter(period);
    setOpenPopover(null);
    scrollToTable();
  };

  const now = new Date();
  const weekRange = getWeekRange(now);
  const tableLoading =
    (periodFilter === 'month' && loadingMonth) ||
    (periodFilter === 'custom' && loadingCustomDate) ||
    ((periodFilter === 'today' || periodFilter === 'week') && loadingBase);

  return (
    <div className="flex-col gap-6" style={{ opacity: loadingBase ? 0.6 : 1 }}>
      <div>
        <h1 className="h1">Vendas</h1>
        <p className="text-muted" style={{ marginTop: '4px' }}>
          Gerencie as vendas realizadas na plataforma, acompanhe o desempenho dos vendedores e consulte o histórico por período.
        </p>
      </div>

      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard
          icon={<CalendarClock size={22} />}
          label="Vendas Hoje"
          value={String(todayBreakdown.totalSales)}
          trend={`${todayBreakdown.totalUnits} produtos vendidos`}
          active={openPopover === 'today'}
          onClick={() => setOpenPopover('today')}
        />
        <StatCard
          icon={<CalendarRange size={22} />}
          label="Vendas da Semana"
          value={String(weekBreakdown.totalSales)}
          trend={`${weekBreakdown.totalUnits} produtos vendidos`}
          active={openPopover === 'week'}
          onClick={() => setOpenPopover('week')}
        />
        <MonthStatCard
          viewDate={viewDate}
          value={loadingMonth ? '...' : String(monthBreakdown.totalSales)}
          trend={loadingMonth ? 'carregando...' : `${monthBreakdown.totalUnits} produtos vendidos`}
          active={openPopover === 'month'}
          onOpenBreakdown={() => setOpenPopover('month')}
          onOpenPicker={() => setMonthPickerOpen(true)}
          onNavigate={(delta) => setViewDate((d) => addMonths(d, delta))}
        />
        <StatCard
          icon={<CalendarDays size={22} />}
          label="Vendas por Data"
          value={selectedDate ? (loadingCustomDate ? '...' : String(selectedDateBreakdown.totalSales)) : '—'}
          trend={selectedDate ? formatDate(selectedDate.toISOString()) : 'Clique para escolher uma data'}
          active={openPopover === 'date'}
          onClick={() => setOpenPopover('date')}
        />
      </div>

      <div className="sales-filters card">
        <div className="sales-filters-row">
          <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
            <option value="all">Todos os produtos</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}>
            <option value="all">Todas as categorias</option>
            <option value="Aparelhos">Aparelhos</option>
            <option value="Acessórios">Acessórios</option>
          </select>

          <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}>
            <option value="all">Todos os vendedores</option>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}>
            <option value="month">{MONTH_NAMES_FULL[viewDate.getMonth()]} de {viewDate.getFullYear()}</option>
            <option value="today">Hoje</option>
            <option value="week">Esta semana</option>
            {selectedDate && <option value="custom">{formatDate(selectedDate.toISOString())}</option>}
          </select>

          <div className="search-bar sales-search">
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Buscar por produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="inventory-table-card" ref={tableRef} style={{ opacity: tableLoading ? 0.6 : 1 }}>
        <table className="inventory-table">
          <thead>
            <tr>
              <th>PRODUTO</th>
              <th>CATEGORIA</th>
              <th>QUANTIDADE</th>
              <th>DATA DA COMPRA</th>
              <th>VENDEDOR</th>
              <th>AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {!tableLoading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Nenhuma venda encontrada para os filtros selecionados.
                </td>
              </tr>
            )}
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="product-info">
                    <span className="product-name">{row.productName}</span>
                  </div>
                </td>
                <td>
                  {row.productCategory && (
                    <span className={`category-badge ${row.productCategory === 'Aparelhos' ? 'aparelhos' : 'acessorios'}`}>
                      {row.productCategory}
                    </span>
                  )}
                </td>
                <td className="qty-cell">{row.quantity} un.</td>
                <td>{formatDate(row.sold_at)}</td>
                <td>{row.sellerName}</td>
                <td>
                  <button className="sales-view-btn" onClick={() => setDetailSale(row)}>
                    <Eye size={14} /> Visualizar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openPopover === 'today' && (
        <BreakdownPopover
          title="Vendas de Hoje"
          subtitle={formatDate(now.toISOString())}
          breakdown={todayBreakdown}
          emptyLabel="Nenhuma venda registrada hoje ainda."
          onClose={() => setOpenPopover(null)}
          onViewAll={() => viewAll('today')}
        />
      )}
      {openPopover === 'week' && (
        <BreakdownPopover
          title="Vendas da Semana"
          subtitle={`${formatDate(weekRange.start.toISOString())} até ${formatDate(new Date(weekRange.end.getTime() - 86400000).toISOString())}`}
          breakdown={weekBreakdown}
          emptyLabel="Nenhuma venda registrada esta semana."
          onClose={() => setOpenPopover(null)}
          onViewAll={() => viewAll('week')}
        />
      )}
      {openPopover === 'month' && (
        <BreakdownPopover
          title="Vendas do Mês"
          subtitle={`${MONTH_NAMES_FULL[viewDate.getMonth()]} de ${viewDate.getFullYear()}`}
          breakdown={monthBreakdown}
          loading={loadingMonth}
          emptyLabel="Nenhuma venda registrada neste mês."
          onClose={() => setOpenPopover(null)}
          onViewAll={() => viewAll('month')}
        />
      )}
      {openPopover === 'date' && (
        <DatePopover
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          breakdown={selectedDate ? selectedDateBreakdown : null}
          loading={loadingCustomDate}
          onClose={() => setOpenPopover(null)}
          onViewAll={() => viewAll('custom')}
        />
      )}
      {monthPickerOpen && (
        <MonthYearPopover
          viewDate={viewDate}
          onSelect={setViewDate}
          onClose={() => setMonthPickerOpen(false)}
        />
      )}

      <SaleDetailModal sale={detailSale} onClose={() => setDetailSale(null)} />
    </div>
  );
}
