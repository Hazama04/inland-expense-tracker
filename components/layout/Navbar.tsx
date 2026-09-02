'use client';

import React from 'react';
import { Menu, LogOut, User } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export interface NavbarProps {
  onToggleSidebar: () => void;
  user: {
    name: string;
    phoneNumber: string;
    role: string;
  } | null;
  onLogout: () => void;
}

export function Navbar({ onToggleSidebar, user, onLogout }: NavbarProps) {
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <Badge variant="purple" size="sm">Admin</Badge>;
      case 'FINANCE':
        return <Badge variant="info" size="sm">Finance</Badge>;
      default:
        return <Badge variant="neutral" size="sm">Staff</Badge>;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 sm:px-6 lg:px-8 bg-white border-b border-[#e6e6e1]">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger ONLY - Hidden on Desktop (lg:hidden) */}
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-1.5 rounded text-white bg-[#064e3b] hover:bg-[#047857] transition-colors"
          aria-label="Buka Menu Navigasi"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs sm:text-sm text-zinc-900">
            Inland Expense Tracker
          </span>
          <span className="hidden sm:inline text-zinc-300">·</span>
          <span className="hidden sm:inline text-xs text-zinc-500 font-normal">
            Operasional Keuangan & Struk Kantor
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-[#064e3b] text-white flex items-center justify-center font-bold text-[10px]">
                {getInitials(user.name)}
              </div>
              <div className="hidden sm:flex items-center gap-1.5 text-xs">
                <span className="font-medium text-zinc-900">{user.name}</span>
                {getRoleBadge(user.role)}
              </div>
            </div>

            <div className="h-4 w-px bg-zinc-200" />

            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="text-zinc-600 hover:text-rose-700 hover:bg-rose-50 h-7 px-2 text-xs"
              title="Keluar dari sistem"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <User className="w-3.5 h-3.5" />
            <span>Tamu</span>
          </div>
        )}
      </div>
    </header>
  );
}
