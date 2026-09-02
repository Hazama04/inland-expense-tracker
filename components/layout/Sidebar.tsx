'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Receipt,
  MessageSquare,
  Users,
  Tags,
  ShieldCheck,
  Settings,
  X,
} from 'lucide-react';

export interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
  badge?: string;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Pengeluaran', href: '/expenses', icon: Receipt },
  { name: 'WA Simulator', href: '/simulator', icon: MessageSquare, badge: 'Fase 2' },
  { name: 'Daftar Staf', href: '/staff', icon: Users, roles: ['ADMIN', 'FINANCE'] },
  { name: 'Kategori Master', href: '/categories', icon: Tags, roles: ['ADMIN'] },
  { name: 'Audit Logs', href: '/audit-logs', icon: ShieldCheck, roles: ['ADMIN'] },
  { name: 'Pengaturan', href: '/settings', icon: Settings },
];

export function Sidebar({ isOpen, onClose, userRole = 'STAFF' }: SidebarProps) {
  const pathname = usePathname();

  const filteredItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-zinc-950/50 lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container (Desktop width 216px, permanently visible on desktop) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-[216px] bg-[#064e3b] text-white flex flex-col transition-transform duration-150 ease-in-out lg:translate-x-0 border-r border-[#047857] shadow-sm ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-[#047857]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-white text-[#064e3b] flex items-center justify-center font-black text-xs shadow-xs shrink-0">
              IE
            </div>
            <div className="min-w-0">
              <div className="font-bold text-xs tracking-tight text-white leading-none truncate">
                Inland Expense
              </div>
              <div className="text-[10px] text-emerald-200/90 font-medium tracking-wide mt-0.5 truncate">
                Finance Portal
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="lg:hidden p-1 text-emerald-200 hover:text-white rounded"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto">
          <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300/80">
            Menu Utama
          </div>
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center justify-between px-3 py-1.5 rounded-md text-xs transition-colors ${
                  isActive
                    ? 'bg-white text-[#064e3b] font-bold shadow-xs'
                    : 'text-emerald-100/90 hover:bg-[#047857] hover:text-white font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#064e3b]' : 'text-emerald-200'}`} />
                  <span className="truncate">{item.name}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-medium shrink-0 ${
                      isActive
                        ? 'bg-emerald-100 text-[#064e3b]'
                        : 'bg-[#047857] text-emerald-100 border border-emerald-500/40'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
