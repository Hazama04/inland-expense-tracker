'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { apiClient, UserProfile } from '@/lib/client/api';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Phone, ShieldCheck } from 'lucide-react';

export interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Login form state
  const [phoneInput, setPhoneInput] = useState('+6281234567890');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    apiClient.getMe().then((res) => {
      if (!ignore) {
        if (res.data) {
          setUser(res.data);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    const res = await apiClient.createSession(phoneInput);
    if (res.data) {
      setUser(res.data.staff);
      window.location.reload();
    } else {
      setLoginError(res.error?.message || 'Nomor telepon tidak terdaftar sebagai staf aktif.');
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await apiClient.logout();
    setUser(null);
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f7f3]">
        <div className="flex flex-col items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#064e3b] text-white flex items-center justify-center font-black text-xs shadow-md animate-pulse">
            IE
          </div>
          <span className="text-xs text-zinc-500 font-medium">Memuat portal Inland Expense...</span>
        </div>
      </div>
    );
  }

  // If unauthenticated, show corporate login view
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f6f7f3]">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-[#064e3b] text-white font-black text-sm shadow-sm mb-3">
              IE
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              Inland <span className="text-[#065f46]">Expense</span> Tracker
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Portal Keuangan & Pencatatan Struk WhatsApp
            </p>
          </div>

          <Card className="border-[#e6e6e1] shadow-xs">
            <CardHeader className="text-center pb-3">
              <CardTitle className="text-sm font-semibold">Masuk ke Portal Staf</CardTitle>
              <CardDescription>
                Masukkan nomor WhatsApp staf yang telah terdaftar pada whitelist sistem.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  label="Nomor WhatsApp Staf"
                  placeholder="081234567890"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  leftIcon={<Phone className="w-3.5 h-3.5" />}
                  error={loginError || undefined}
                  autoFocus
                />

                <Button type="submit" className="w-full" isLoading={loginLoading}>
                  Masuk Sekarang
                </Button>
              </form>

              <div className="mt-4 pt-3 border-t border-[#f0f0eb] flex items-center justify-center gap-1.5 text-center text-[10px] text-zinc-400">
                <ShieldCheck className="w-3.5 h-3.5 text-[#065f46]" />
                <span>Akses aman terotentikasi RBAC</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f6f7f3] text-zinc-900">
      <Navbar onToggleSidebar={() => setSidebarOpen(true)} user={user} onLogout={handleLogout} />

      <div className="flex-1 flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} userRole={user.role} />

        <main className="flex-1 lg:pl-[216px] flex flex-col min-w-0">
          <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1560px] w-full mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
