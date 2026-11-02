// Indian Currency, Date & Number Formatting Utilities

/**
 * Returns today's date formatted as YYYY-MM-DD in India Standard Time (IST, UTC+5:30)
 */
export function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/**
 * Returns current date and time formatted in IST
 */
export function getNowIST(): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date());
}

/**
 * Converts any number to words in the Indian numbering system (Crores, Lakhs, Thousands, Rupees & Paise)
 */
export function numberToIndianWords(num: number): string {
  if (isNaN(num) || num === 0) return 'Zero Rupees Only';

  const singleDigits = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];

  const tens = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
  ];

  const absNum = Math.abs(num);
  let roundNum = Math.floor(absNum);
  let paise = Math.round((absNum - roundNum) * 100);
  if (paise >= 100) {
    roundNum += 1;
    paise = 0;
  }

  function convertBelowThousand(n: number): string {
    let str = '';
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    if (hundred > 0) {
      str += `${singleDigits[hundred]} Hundred`;
    }
    if (rest > 0) {
      if (str) str += ' ';
      if (rest < 20) {
        str += singleDigits[rest];
      } else {
        const u = rest % 10;
        const t = Math.floor(rest / 10);
        str += tens[t] + (u ? ` ${singleDigits[u]}` : '');
      }
    }
    return str.trim();
  }

  function convertNumber(n: number): string {
    if (n === 0) return '';
    if (n >= 10000000) {
      const crore = Math.floor(n / 10000000);
      const remainder = n % 10000000;
      return `${convertNumber(crore)} Crore${remainder ? ' ' + convertNumber(remainder) : ''}`;
    }
    if (n >= 100000) {
      const lakh = Math.floor(n / 100000);
      const remainder = n % 100000;
      return `${convertBelowThousand(lakh)} Lakh${remainder ? ' ' + convertNumber(remainder) : ''}`;
    }
    if (n >= 1000) {
      const thousand = Math.floor(n / 1000);
      const remainder = n % 1000;
      return `${convertBelowThousand(thousand)} Thousand${remainder ? ' ' + convertBelowThousand(remainder) : ''}`;
    }
    return convertBelowThousand(n);
  }

  const words = convertNumber(roundNum).trim();
  let result = `Rupees ${words || 'Zero'}`;

  if (paise > 0) {
    const paiseText = paise < 20
      ? singleDigits[paise]
      : `${tens[Math.floor(paise / 10)]}${paise % 10 ? ' ' + singleDigits[paise % 10] : ''}`.trim();
    result += ` and ${paiseText} Paise`;
  }

  result += ' Only';
  return result;
}

export function formatINR(amount: number, showDecimals: boolean = false): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '₹0';
  const hasFraction = amount % 1 !== 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimals || hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
