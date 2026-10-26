// Currency per trip (ISO 4217). Amounts are stored as plain numbers in the trip's currency.

export const CURRENCIES: { code: string; label: string }[] = [
  { code: 'THB', label: 'Thai baht' },
  { code: 'JPY', label: 'Japanese yen' },
  { code: 'KRW', label: 'Korean won' },
  { code: 'CNY', label: 'Chinese yuan' },
  { code: 'HKD', label: 'Hong Kong dollar' },
  { code: 'TWD', label: 'Taiwan dollar' },
  { code: 'SGD', label: 'Singapore dollar' },
  { code: 'MYR', label: 'Malaysian ringgit' },
  { code: 'VND', label: 'Vietnamese dong' },
  { code: 'IDR', label: 'Indonesian rupiah' },
  { code: 'USD', label: 'US dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British pound' },
  { code: 'AUD', label: 'Australian dollar' },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

/** e.g. currencySymbol('JPY') -> "¥"; falls back to the code */
export function currencySymbol(currency: string = 'THB', locale: string = 'en'): string {
  try {
    const parts = new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', { style: 'currency', currency }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || currency;
  } catch {
    return currency;
  }
}

/** e.g. formatMoney(1500, 'JPY') -> "¥1,500"; formatMoney(99.5, 'THB', 'th') -> "฿99.50" */
export function formatMoney(amount: number | null | undefined, currency: string = 'THB', locale: string = 'en'): string {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}
