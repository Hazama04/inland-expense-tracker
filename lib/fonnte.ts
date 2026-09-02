import { ExpenseWithRelations } from '../repositories/expense.repository';

export interface SendWhatsAppMessageParams {
  target: string;
  message: string;
  url?: string;
}

export interface FonnteSendResponse {
  status: boolean;
  target?: string[];
  message?: string;
  reason?: string;
}

/**
 * Format currency into standard Indonesian Rupiah (e.g. "Rp 145.000")
 */
export function formatIDR(amount: number | { toString(): string }): string {
  const num = typeof amount === 'number' ? amount : parseFloat(amount.toString());
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Format date into Indonesian readable format (e.g. "1 Sep 2026")
 */
export function formatIndonesianDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export class FonnteClient {
  private getApiToken(): string | null {
    return process.env.FONNTE_API_TOKEN || process.env.FONNTE_TOKEN || null;
  }

  /**
   * Sends a WhatsApp message via Fonnte REST API.
   * In testing/mock mode or if token is not configured, logs safely without throwing.
   */
  async sendMessage(params: SendWhatsAppMessageParams): Promise<FonnteSendResponse> {
    const token = this.getApiToken();

    if (!token || process.env.NODE_ENV === 'test' || process.env.MOCK_FONNTE === 'true') {
      // Mock / safe development log
      console.log(`[Fonnte Mock Send] Target: ${params.target} | Message:\n${params.message}`);
      return {
        status: true,
        message: 'Mock message sent successfully',
      };
    }

    try {
      const formData = new URLSearchParams();
      formData.append('target', params.target);
      formData.append('message', params.message);
      if (params.url) {
        formData.append('url', params.url);
      }

      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          Authorization: token,
        },
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('[Fonnte API Error]:', res.status, text);
        return {
          status: false,
          reason: `HTTP ${res.status}: ${text}`,
        };
      }

      const json = (await res.json()) as FonnteSendResponse;
      return json;
    } catch (error) {
      console.error('[Fonnte Request Exception]:', error instanceof Error ? error.message : error);
      return {
        status: false,
        reason: error instanceof Error ? error.message : 'Network request failed',
      };
    }
  }

  // ==========================================
  // Copywriting & Message Formatting Helpers
  // ==========================================

  formatReceiptReceived(): string {
    return '📸 Struk diterima, sedang diproses...';
  }

  formatUnauthorizedMessage(): string {
    return (
      'Maaf, nomor Anda belum terdaftar sebagai staf Inland Property.\n' +
      'Hubungi admin untuk pendaftaran.'
    );
  }

  formatHelpMessage(): string {
    return (
      '👋 Halo! Saya bot pencatat pengeluaran kantor Inland Property.\n\n' +
      'Cara pakai:\n' +
      '1. Foto struk pengeluaran kantor\n' +
      '2. Kirim ke chat ini\n' +
      '3. Saya akan baca & catat otomatis ke sistem finance\n\n' +
      'Kalau ada koreksi, balas setelah konfirmasi muncul:\n' +
      '• "kategori: transport"\n' +
      '• "nominal: 150000"\n' +
      '• "catatan: beli kertas HVS"\n\n' +
      'Perintah lain:\n' +
      '• "riwayat" : 5 pengeluaran terakhir\n' +
      '• "total bulan ini" : Total pengeluaran bulan berjalan\n' +
      '• "manual: Merchant | Nominal | Kategori" : Catat manual jika struk buram'
    );
  }

  formatReceiptProcessedSuccess(expense: ExpenseWithRelations): string {
    const formattedAmount = formatIDR(expense.amount);
    const formattedDate = formatIndonesianDate(expense.transactionDate);
    const categoryName = expense.category?.name || 'Lain-lain';
    const staffName = expense.staff.name;

    return (
      '✅ Pengeluaran tercatat otomatis!\n\n' +
      `🏪 Merchant : ${expense.merchant}\n` +
      `📅 Tanggal  : ${formattedDate}\n` +
      `💰 Nominal  : ${formattedAmount}\n` +
      `🏷️ Kategori : ${categoryName}\n` +
      `👤 Dicatat  : ${staffName}\n\n` +
      'Balas pesan ini jika ingin koreksi:\n' +
      '• "kategori: [Nama]"\n' +
      '• "nominal: [Jumlah]"\n' +
      '• "catatan: [Keterangan]"'
    );
  }

  formatReceiptNeedsReview(expense: ExpenseWithRelations, reasonMessage?: string): string {
    const formattedAmount = formatIDR(expense.amount);
    const formattedDate = formatIndonesianDate(expense.transactionDate);
    const categoryName = expense.category?.name || 'Belum Terklasifikasi';

    return (
      '⚠️ Struk diterima (Perlu Review)\n\n' +
      `🏪 Merchant : ${expense.merchant}\n` +
      `📅 Tanggal  : ${formattedDate}\n` +
      `💰 Nominal  : ${formattedAmount}\n` +
      `🏷️ Kategori : ${categoryName}\n` +
      `📝 Info     : ${reasonMessage || 'Data struk akan dicek oleh Finance.'}\n\n` +
      'Anda juga dapat membalas dengan nominal atau kategori yang benar.'
    );
  }

  formatReceiptProcessingFailed(customReason?: string): string {
    return (
      '⚠️ Struk belum dapat diproses.\n' +
      (customReason ? `${customReason}\n` : '') +
      'Silakan kirim ulang foto struk yang lebih jelas dan terang, atau gunakan perintah "manual: Merchant | Nominal | Kategori".'
    );
  }

  formatManualExpenseSuccess(expense: ExpenseWithRelations): string {
    const formattedAmount = formatIDR(expense.amount);
    const formattedDate = formatIndonesianDate(expense.transactionDate);
    const categoryName = expense.category?.name || 'Lain-lain';
    const staffName = expense.staff.name;

    return (
      '✅ Pengeluaran tercatat secara manual!\n' +
      `🏪 Merchant : ${expense.merchant}\n` +
      `📅 Tanggal  : ${formattedDate}\n` +
      `💰 Nominal  : ${formattedAmount}\n` +
      `🏷️ Kategori : ${categoryName}\n` +
      `👤 Dicatat  : ${staffName}`
    );
  }

  formatCorrectionSuccess(
    fieldLabel: string,
    newValue: string,
    expense: ExpenseWithRelations
  ): string {
    const formattedAmount = formatIDR(expense.amount);
    return (
      `✅ Data pengeluaran diperbarui!\n` +
      `• ${fieldLabel}: ${newValue}\n\n` +
      `🏪 ${expense.merchant} · 💰 ${formattedAmount}`
    );
  }

  formatHistoryMessage(expenses: ExpenseWithRelations[], staffName: string): string {
    if (!expenses.length) {
      return `📋 Belum ada riwayat pengeluaran yang dicatat oleh ${staffName}.`;
    }

    const lines = expenses.map((exp, idx) => {
      const date = formatIndonesianDate(exp.transactionDate);
      const amount = formatIDR(exp.amount);
      const cat = exp.category?.name || 'Lain-lain';
      const statusLabel = exp.status === 'AUTO' ? 'Auto' : 'Manual';
      return `${idx + 1}. ${date} · ${exp.merchant} · ${amount} (${cat}) [${statusLabel}]`;
    });

    return `📋 5 Pengeluaran Terakhir (${staffName}):\n\n` + lines.join('\n');
  }

  formatMonthTotalMessage(total: number, count: number, monthName: string, staffName: string): string {
    const formattedTotal = formatIDR(total);
    return (
      `💰 Total Pengeluaran Bulan ${monthName} (${staffName}):\n` +
      `Total: ${formattedTotal} (${count} transaksi)`
    );
  }

  formatNoRecentExpenseMessage(): string {
    return '⚠️ Tidak ditemukan transaksi dalam 30 menit terakhir untuk dikoreksi.';
  }

  formatUnrecognizedCommandMessage(): string {
    return (
      '❓ Perintah tidak dikenali.\n\n' +
      'Kirim foto struk untuk mencatat otomatis, atau ketik "bantuan" untuk melihat panduan.'
    );
  }
}

export const fonnteClient = new FonnteClient();
