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
      <div className="mobile-header-inner">
        {/* Left: Prominent Hamburger Button (44x44px touch target) */}
        <button 
          className="mobile-menu-toggle-btn" 
          onClick={onToggleSidebar}
          aria-label="Abrir menu de navegação"
          type="button"
        >
          <Menu size={24} strokeWidth={2.2} />
        </button>

        {/* Center: System Logo */}
        <div className="mobile-header-brand">
          <img src={logoImg} alt="Você de iPhone" className="mobile-header-logo" />
        </div>

        {/* Right: Theme Switcher */}
        <div className="mobile-header-actions">
          <div 
            className={`sleek-theme-switch mobile-theme-switch ${theme === 'dark' ? 'dark-active' : ''}`} 
            onClick={toggleTheme} 
            title="Alternar Modo Claro/Escuro"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleTheme()}
            aria-label="Alternar Modo Claro/Escuro"
          >
            <Sun size={13} color="#ffffff" className="switch-icon-sun" />
            <Moon size={13} color="#ffffff" className="switch-icon-moon" />
            <div className="switch-thumb" />
          </div>
        </div>
      </div>
    </header>
  );
}
