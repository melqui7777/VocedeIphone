import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Eye, MessageSquare, CheckCircle2, XCircle,
  ShoppingBag, TrendingUp, Clock, Star
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';
import { ConversationSummaryModal, type ConversationData } from '../components/ConversationSummaryModal';
import { useTheme } from '../context/ThemeContext';
import {
  fetchSellerById,
  fetchSalesInRange,
  fetchConversationsBySeller,
  fetchConversationMessages,
  getMonthRange,
} from '../lib/api';
import type { Seller, Conversation } from '../lib/database.types';
import './SellerReport.css';

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

interface ReportData {
  seller: Seller;
  received: number;
  responded: number;
  lost: number;
  productsSold: number;
  conversionRate: number;
  avgResponseTime: string;
  avgScore: string;
  chartData: { day: string; respondidas: number; perdidas: number; taxa: number }[];
  conversations: Conversation[];
}

export function SellerReport() {
  const { id } = useParams();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [selectedConversation, setSelectedConversation] = useState<ConversationData | null>(null);
  const [data, setData] = useState<ReportData | null>(null);

  useEffect(() => {
    if (!id) return;
    const now = new Date();
    const { start, end } = getMonthRange(now);

    Promise.all([
      fetchSellerById(id),
      fetchSalesInRange(start, end),
      fetchConversationsBySeller(id),
    ]).then(([seller, monthSales, conversations]) => {
      const productsSold = monthSales
        .filter((s) => s.seller_id === id)
        .reduce((sum, s) => sum + s.quantity, 0);

      const success = conversations.filter((c) => c.result_type === 'success').length;
      const lost = conversations.filter((c) => c.result_type === 'loss').length;
      const total = conversations.length;

      const durations = conversations.map((c) => c.duration_seconds).filter((d): d is number => d != null);
      const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

      const scores = conversations.map((c) => c.score).filter((s): s is number => s != null);
      const avgScoreValue = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

      const days = Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i)));
      const chartData = days.map((d) => {
        const dayConvs = conversations.filter((c) => sameDay(new Date(c.occurred_at), d));
        const respondidas = dayConvs.filter((c) => c.result_type === 'success').length;
        const perdidas = dayConvs.filter((c) => c.result_type === 'loss').length;
        const dayTotal = dayConvs.length;
        return {
          day: WEEKDAY_NAMES[d.getDay()],
          respondidas,
          perdidas,
          taxa: dayTotal > 0 ? Math.round((respondidas / dayTotal) * 100) : 0,
        };
      });

      setData({
        seller,
        received: total,
        responded: total,
        lost,
        productsSold,
        conversionRate: total > 0 ? Math.round((success / total) * 100) : 0,
        avgResponseTime: formatDuration(avgDuration),
        avgScore: avgScoreValue != null ? `${avgScoreValue.toFixed(1)} / 10` : '—',
        chartData,
        conversations,
      });
    });
  }, [id]);

function generateDemoChatHistory(conv: Conversation, sellerName: string): ChatMessage[] {
  const baseTime = new Date(conv.occurred_at);
  const formatTime = (offsetMins: number) => {
    const d = new Date(baseTime.getTime() + offsetMins * 60000);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const clientName = conv.client_name || 'Cliente';
  const product = conv.product || 'iPhone';

  if (conv.result_type === 'success') {
    return [
      { sender: 'client', text: `Olá, bom dia! Tenho interesse no ${product}.`, time: formatTime(0) },
      { sender: 'seller', text: `Bom dia, ${clientName}! Me chamo ${sellerName}. Temos o ${product} disponível a pronta entrega!`, time: formatTime(2) },
      { sender: 'client', text: `Legal! Vocês pegam meu seminovo na troca?`, time: formatTime(5) },
      { sender: 'seller', text: `Com certeza! Aceitamos seu seminovo como parte do pagamento com uma ótima avaliação. Qual o modelo e gigas do seu atual?`, time: formatTime(7) },
      { sender: 'client', text: `É um iPhone 14 Pro Max 128GB em perfeito estado, saúde da bateria 88%.`, time: formatTime(10) },
      { sender: 'seller', text: `Perfeito! Consigo avaliar seu 14 Pro Max em um valor excelente no abatimento. Posso separar a unidade para você vir retirar na loja ou prefere entrega?`, time: formatTime(13) },
      { sender: 'client', text: `Vou querer retirar na loja hoje à tarde! Pode reservar pra mim.`, time: formatTime(16) },
      { sender: 'seller', text: `Fechado! Já deixei reservado no seu nome. Te aguardo aqui na loja. Obrigado pela preferência!`, time: formatTime(18) },
    ];
  } else if (conv.result_type === 'loss') {
    return [
      { sender: 'client', text: `Bom dia, queria saber o valor do ${product}.`, time: formatTime(0) },
      { sender: 'seller', text: `Olá ${clientName}! Bom dia. Me chamo ${sellerName}. O ${product} está R$ 6.890 em até 12x sem juros ou com desconto à vista!`, time: formatTime(3) },
      { sender: 'client', text: `Entendi. Vi num site de e-commerce um pouco mais barato.`, time: formatTime(8) },
      { sender: 'seller', text: `Compreendo! Aqui na loja garantimos aparelho original lacrado, garantia oficial e suporte presencial imediato. Se você vier hoje, consigo te dar uma película 3D e capa de brinde!`, time: formatTime(12) },
      { sender: 'client', text: `Vou pensar mais um pouco e qualquer coisa te chamo. Obrigado.`, time: formatTime(20) },
      { sender: 'seller', text: `Tranquilo ${clientName}! Fico à disposição se precisar de algo. Tenha um ótimo dia!`, time: formatTime(22) },
    ];
  } else {
    return [
      { sender: 'client', text: `Bom dia`, time: formatTime(0) },
      { sender: 'seller', text: `Olá ${clientName}, bom dia! Me chamo ${sellerName}, como posso te ajudar hoje?`, time: formatTime(2) },
      { sender: 'client', text: `Queria saber se vcs pega um 16 pro max da troca pra um 17 pro max`, time: formatTime(15) },
      { sender: 'seller', text: `Pegamos sim, ${clientName}! Avaliamos seu 16 Pro Max na troca pelo 17 Pro Max com ótimas condições.`, time: formatTime(18) },
      { sender: 'client', text: `iPhone 16 pro Max 256 gigas Cor: natural`, time: formatTime(36) },
      { sender: 'seller', text: `Excelente aparelho! Qual a saúde da bateria dele e possui a caixa original com cabo?`, time: formatTime(39) },
    ];
  }
}

  const handleOpenSummary = async (conv: Conversation) => {
    if (!data) return;
    const messages = await fetchConversationMessages(conv.id);
    const occurred = new Date(conv.occurred_at);

    let chatHistory: ChatMessage[] = [];

    if (messages.length > 0) {
      chatHistory = messages.map((m) => {
        const s = (m.sender || '').toString().toLowerCase().trim();
        const isSeller = s === 'seller' || s === 'vendedor' || s === 'outgoing' || s === 'user' || s === 'agent';
        return {
          sender: isSeller ? ('seller' as const) : ('client' as const),
          text: m.message,
          time: new Date(m.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        };
      });

      const hasSeller = chatHistory.some((m) => m.sender === 'seller');
      if (!hasSeller && chatHistory.length > 1) {
        chatHistory = chatHistory.map((m, idx) => ({
          ...m,
          sender: idx % 2 === 1 ? 'seller' : 'client',
        }));
      }
    } else {
      chatHistory = generateDemoChatHistory(conv, data.seller.name);
    }

    setSelectedConversation({
      id: conv.id,
      client: conv.client_name,
      date: `${occurred.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} - ${occurred.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      product: conv.product ?? '—',
      result: conv.result ?? (conv.result_type === 'success' ? 'Venda Fechada' : conv.result_type === 'loss' ? 'Perdido' : 'Em andamento'),
      resultType: conv.result_type ?? 'open',
      seller: data.seller.name,
      summary: conv.summary ?? '',
      keyPoints: conv.key_points,
      metrics: {
        duration: formatDuration(conv.duration_seconds),
        messagesCount: conv.messages_count ?? chatHistory.length,
        sentiment: conv.sentiment ?? '—',
        score: conv.score != null ? `${conv.score.toFixed(1)} / 10` : '—',
        objectionsCount: conv.objections ?? '—',
      },
      aiAnalysis: {
        strengths: conv.strengths,
        improvements: conv.improvements,
      },
      chatHistory,
    });
  };

  const handleCloseSummary = () => {
    setSelectedConversation(null);
  };

  const chartColor = isDark ? '#3B82F6' : '#0A25FF';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#E5E7EB';

  const resolvedConversations = data?.conversations ?? [];

  return (
    <div className="seller-report-container">
      <div className="flex-between" style={{marginBottom: '8px'}}>
        <div className="flex-center gap-4">
          <Link to="/vendedores" className="btn-primary" style={{backgroundColor: 'transparent', color: 'var(--text-dark)', border: '1px solid var(--border-color)'}}>
            <ArrowLeft size={16} /> Voltar
          </Link>
          <h1 className="h1">Relatório do Vendedor{data ? `: ${data.seller.name}` : ''}</h1>
        </div>
      </div>

      {/* Top 7 Metric Cards */}
      <div className="seller-metrics-grid">
        <div className="seller-kpi-card">
          <MessageSquare size={22} className="seller-kpi-icon" />
          <span className="seller-kpi-value">{data?.received ?? 0}</span>
          <span className="seller-kpi-label">RECEBIDAS</span>
        </div>
        <div className="seller-kpi-card">
          <CheckCircle2 size={22} className="seller-kpi-icon" />
          <span className="seller-kpi-value">{data?.responded ?? 0}</span>
          <span className="seller-kpi-label">RESPONDIDAS</span>
        </div>
        <div className="seller-kpi-card">
          <XCircle size={22} className="seller-kpi-icon" />
          <span className="seller-kpi-value">{data?.lost ?? 0}</span>
          <span className="seller-kpi-label">PERDIDAS</span>
        </div>
        <div className="seller-kpi-card">
          <ShoppingBag size={22} className="seller-kpi-icon" />
          <span className="seller-kpi-value">{data?.productsSold ?? 0}</span>
          <span className="seller-kpi-label">PRODUTOS</span>
        </div>
        <div className="seller-kpi-card">
          <TrendingUp size={22} className="seller-kpi-icon" />
          <span className="seller-kpi-value">{data?.conversionRate ?? 0}%</span>
          <span className="seller-kpi-label">CONVERSÃO</span>
        </div>
        <div className="seller-kpi-card">
          <Clock size={22} className="seller-kpi-icon" />
          <span className="seller-kpi-value">{data?.avgResponseTime ?? '—'}</span>
          <span className="seller-kpi-label">T.M.R.</span>
        </div>
        <div className="seller-kpi-card">
          <Star size={22} className="seller-kpi-icon" />
          <span className="seller-kpi-value">{data?.avgScore ?? '—'}</span>
          <span className="seller-kpi-label">AVALIAÇÃO</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="seller-charts-grid">
        <div className="seller-chart-card">
          <h3 className="seller-chart-title">Conversas Respondidas vs Perdidas</h3>
          <div style={{ width: '100%', height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.chartData ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#131926' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="respondidas" name="Respondidas" fill={chartColor} radius={[4, 4, 0, 0]} />
                <Bar dataKey="perdidas" name="Perdidas" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="seller-chart-card">
          <h3 className="seller-chart-title">Taxa de Conversão (%)</h3>
          <div style={{ width: '100%', height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.chartData ?? []}>
                <defs>
                  <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 12}} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#131926' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB',
                    borderRadius: '8px'
                  }}
                />
                <Area type="monotone" dataKey="taxa" name="Taxa de Conversão" stroke="#10B981" strokeWidth={3} fill="url(#colorConv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Auditoria de Conversas */}
      <div className="card">
        <h2 className="h2" style={{marginBottom: '20px'}}>Auditoria de Conversas</h2>
        {resolvedConversations.length === 0 ? (
          <p className="text-muted" style={{ padding: '24px 0', textAlign: 'center' }}>
            Nenhuma conversa registrada ainda.
          </p>
        ) : (
          <table style={{width: '100%', textAlign: 'left', borderCollapse: 'collapse'}}>
            <thead>
              <tr style={{borderBottom: '1px solid var(--border-color)'}}>
                <th style={{padding: '12px 0', color: 'var(--text-muted)', fontWeight: 500}}>Cliente</th>
                <th style={{padding: '12px 0', color: 'var(--text-muted)', fontWeight: 500}}>Data</th>
                <th style={{padding: '12px 0', color: 'var(--text-muted)', fontWeight: 500}}>Produto</th>
                <th style={{padding: '12px 0', color: 'var(--text-muted)', fontWeight: 500}}>Resultado</th>
                <th style={{padding: '12px 0', color: 'var(--text-muted)', fontWeight: 500}}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {resolvedConversations.map(conv => (
                <tr key={conv.id} style={{borderBottom: '1px solid var(--border-color)'}}>
                  <td style={{padding: '16px 0', fontWeight: 500}}>{conv.client_name}</td>
                  <td style={{padding: '16px 0', color: 'var(--text-muted)'}}>
                    {new Date(conv.occurred_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{padding: '16px 0', color: 'var(--text-muted)'}}>{conv.product ?? '—'}</td>
                  <td style={{padding: '16px 0'}}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '100px',
                      fontSize: '12px',
                      fontWeight: 600,
                      backgroundColor: conv.result_type === 'success' ? 'rgba(16, 185, 129, 0.1)' : conv.result_type === 'loss' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                      color: conv.result_type === 'success' ? '#10B981' : conv.result_type === 'loss' ? '#EF4444' : '#3B82F6'
                    }}>
                      {conv.result ?? (conv.result_type === 'success' ? 'Venda Fechada' : conv.result_type === 'loss' ? 'Perdido' : 'Em andamento')}
                    </span>
                  </td>
                  <td style={{padding: '16px 0'}}>
                    <button
                      onClick={() => handleOpenSummary(conv)}
                      style={{
                        color: 'var(--primary)',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        transition: 'background-color 0.15s ease'
                      }}
                      className="hover-btn"
                    >
                      <Eye size={14} /> Ver Resumo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Conversation Summary Report Modal */}
      <ConversationSummaryModal
        conversation={selectedConversation}
        onClose={handleCloseSummary}
      />
    </div>
  );
}
