// Utility to convert numbers into Indian Rupees words
// e.g. 22081 -> "Rupees Twenty Two Thousand Eighty One Only"
// e.g. 188774 -> "Rupees One Lakh Eighty Eight Thousand Seven Hundred Seventy Four Only"

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const tens = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function convertLessThanThousand(n) {
  if (n === 0) return '';
  if (n < 20) return ones[n];
  const t = tens[Math.floor(n / 10)];
  const o = ones[n % 10];
  return (t + (o ? ' ' + o : '')).trim();
}

function convertThreeDigit(n) {
  let str = '';
  if (n >= 100) {
    str += ones[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n > 0) {
    str += convertLessThanThousand(n);
  }
  return str.trim();
}

export function numberToWordsINR(num) {
  const n = Math.round(Number(num) || 0);
  if (n === 0) return 'Rupees Zero Only';
  if (n < 0) return 'Minus ' + numberToWordsINR(-n);

  let numStr = n.toString();
  let words = '';

  // Crores
  if (n >= 10000000) {
    const crore = Math.floor(n / 10000000);
    words += numberToWordsINR(crore).replace('Rupees ', '').replace(' Only', '') + ' Crore ';
    numStr = (n % 10000000).toString();
  }

  const remainder = parseInt(numStr, 10);
  if (remainder === 0) {
    return ('Rupees ' + words + 'Only').replace(/\s+/g, ' ').trim();
  }

  // Lakhs (position 6-7 from right)
  if (remainder >= 100000) {
    const lakh = Math.floor(remainder / 100000);
    words += convertLessThanThousand(lakh) + ' Lakh ';
  }

  // Thousands (position 4-5 from right)
  const remThousands = remainder % 100000;
  if (remThousands >= 1000) {
    const thousand = Math.floor(remThousands / 1000);
    words += convertLessThanThousand(thousand) + ' Thousand ';
  }

  // Hundreds & Below (last 3 digits)
  const remHundreds = remThousands % 1000;
  if (remHundreds > 0) {
    words += convertThreeDigit(remHundreds);
  }

  return ('Rupees ' + words + ' Only').replace(/\s+/g, ' ').trim();
}
