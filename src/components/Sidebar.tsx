import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Package,
  Target,
  MonitorPlay,
  Settings,
  Receipt,
  LogOut,
  Sun,
  Moon
} from 'lucide-react';

import logoImg from '../assets/logo.png';
import './Sidebar.css';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';


const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/forecast', label: 'Forecast', icon: TrendingUp },
  { path: '/vendas', label: 'Vendas', icon: Receipt },
  { path: '/vendedores', label: 'Vendedores', icon: Users },
  { path: '/estoque', label: 'Estoque', icon: Package },
  { path: '/metas', label: 'Metas', icon: Target },
  { path: '/tv', label: 'Painel da Loja', icon: MonitorPlay },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src={logoImg} alt="Você de iPhone" className="sidebar-logo" />
      </div>
      
      <nav className="sidebar-nav">
        <ul>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <NavLink 
                  to={item.path} 
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <div 
          className={`sleek-theme-switch ${theme === 'dark' ? 'dark-active' : ''}`} 
          onClick={toggleTheme} 
          title="Alternar Modo Claro/Escuro"
          style={{ cursor: 'pointer', margin: '0 0 16px 0' }}
        >
          <Sun size={13} color="#ffffff" className="switch-icon-sun" />
          <Moon size={13} color="#ffffff" className="switch-icon-moon" />
          <div className="switch-thumb" />
        </div>

        <button className="btn-logout" onClick={() => signOut()}>

          <LogOut size={20} />
          <span>LOGOUT</span>
        </button>
      </div>
    </aside>

  );
}

