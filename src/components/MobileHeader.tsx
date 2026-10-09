import React from 'react';
import { Menu, Sun, Moon } from 'lucide-react';
import logoImg from '../assets/logo.png';
import { useTheme } from '../context/ThemeContext';
import './MobileHeader.css';

interface MobileHeaderProps {
  onToggleSidebar: () => void;
}

export function MobileHeader({ onToggleSidebar }: MobileHeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="mobile-header">
      <div className="mobile-header-left">
        <button 
          className="mobile-menu-toggle-btn" 
          onClick={onToggleSidebar}
          aria-label="Abrir menu de navegação"
          type="button"
        >
          <Menu size={24} />
        </button>
        <img src={logoImg} alt="Você de iPhone" className="mobile-header-logo" />
      </div>

      <div className="mobile-header-right">
        <div 
          className={`sleek-theme-switch mobile-theme-switch ${theme === 'dark' ? 'dark-active' : ''}`} 
          onClick={toggleTheme} 
          title="Alternar Modo Claro/Escuro"
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleTheme()}
        >
          <Sun size={13} color="#ffffff" className="switch-icon-sun" />
          <Moon size={13} color="#ffffff" className="switch-icon-moon" />
          <div className="switch-thumb" />
        </div>
      </div>
    </header>
  );
}
