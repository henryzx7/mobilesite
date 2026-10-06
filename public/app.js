const modal = document.getElementById('checkoutModal');
const buyButtons = document.querySelectorAll('.buy-button');
const closeButtons = document.querySelectorAll('[data-close-modal]');
const generatePixButton = document.getElementById('generatePix');
const checkoutStart = document.getElementById('checkoutStart');
const checkoutPix = document.getElementById('checkoutPix');
const checkoutPaid = document.getElementById('checkoutPaid');
const checkoutError = document.getElementById('checkoutError');
const pixQr = document.getElementById('pixQr');
const pixCode = document.getElementById('pixCode');
const copyPixButton = document.getElementById('copyPix');
const paymentStatus = document.getElementById('paymentStatus');
const downloadBook = document.getElementById('downloadBook');

let pollTimer = null;
let currentOrderToken = null;

function openModal() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function resetCheckout() {
  clearInterval(pollTimer);
  pollTimer = null;
  currentOrderToken = null;
  checkoutStart.hidden = false;
  checkoutPix.hidden = true;
  checkoutPaid.hidden = true;
  checkoutError.hidden = true;
  checkoutError.textContent = '';
  generatePixButton.disabled = false;
  generatePixButton.textContent = 'GERAR PIX';
}

buyButtons.forEach((button) => {
  button.addEventListener('click', () => {
    resetCheckout();
    openModal();
  });
});

closeButtons.forEach((button) => button.addEventListener('click', closeModal));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

async function generatePayment() {
  checkoutError.hidden = true;
  generatePixButton.disabled = true;
  generatePixButton.textContent = 'GERANDO...';

  try {
    const response = await fetch('/api/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Não foi possível gerar o Pix.');
    }

    currentOrderToken = data.orderToken;
    pixQr.src = data.qrCodeImage;
    pixCode.value = data.pixCopyPaste;

    checkoutStart.hidden = true;
    checkoutPix.hidden = false;
    checkoutPaid.hidden = true;

    pollPaymentStatus();
    pollTimer = setInterval(pollPaymentStatus, 4000);
  } catch (error) {
    checkoutError.textContent = error.message;
    checkoutError.hidden = false;
    generatePixButton.disabled = false;
    generatePixButton.textContent = 'TENTAR NOVAMENTE';
  }
}

async function pollPaymentStatus() {
  if (!currentOrderToken) return;

  try {
    const response = await fetch(`/api/payment/${encodeURIComponent(currentOrderToken)}/status`, {
      headers: { 'Accept': 'application/json' }
    });
    const data = await response.json();

    if (!response.ok || !data.ok) return;

    if (data.paid && data.downloadUrl) {
      clearInterval(pollTimer);
      pollTimer = null;
      downloadBook.href = data.downloadUrl;
      checkoutPix.hidden = true;
      checkoutPaid.hidden = false;
      return;
    }

    const label = paymentStatus.querySelector('b');
    if (label && data.status && data.status !== 'ATIVA') {
      label.textContent = `Status: ${data.status}`;
    }
  } catch {
    // Falhas temporárias de consulta não interrompem o polling.
  }
}

generatePixButton.addEventListener('click', generatePayment);
copyPixButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(pixCode.value);
    copyPixButton.textContent = 'Copiado!';
    setTimeout(() => { copyPixButton.textContent = 'Copiar'; }, 1600);
  } catch {
    pixCode.select();
    document.execCommand('copy');
    copyPixButton.textContent = 'Copiado!';
    setTimeout(() => { copyPixButton.textContent = 'Copiar'; }, 1600);
  }
});
