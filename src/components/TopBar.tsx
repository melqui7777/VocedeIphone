import React from 'react';
import { Search, Bell, Mail, Home, UserCircle, Moon, Sun } from 'lucide-react';
import './TopBar.css';
import { useTheme } from '../context/ThemeContext';

export function TopBar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="topbar" style={{ justifyContent: 'flex-end' }}>
      <div className="topbar-actions">

        <div className={`sleek-theme-switch ${theme === 'dark' ? 'dark-active' : ''}`} onClick={toggleTheme} title="Alternar Modo Claro/Escuro" style={{cursor: 'pointer'}}>
          <Sun size={13} color="#ffffff" className="switch-icon-sun" />
          <Moon size={13} color="#ffffff" className="switch-icon-moon" />
          <div className="switch-thumb" />
        </div>


        <button className="action-btn">
          <Bell size={20} />
        </button>
        <button className="action-btn">
          <Home size={20} />
        </button>

        <div className="profile-section">
          <span className="profile-name">ROBERT WILLIAM</span>
          <UserCircle size={32} className="profile-avatar" />
        </div>
      </div>
    </header>
  );
}

