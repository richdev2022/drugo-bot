import Head from 'next/head';

const LOGO_URL = 'https://cdn.builder.io/api/v1/image/assets%2F89edfb014b264aa1be87a238c6cee9b8%2F26c24c9523574d838f55b9611e7fecf7?format=webp&width=800';

function formatPhoneForWa(raw){
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  return digits.startsWith('0') ? digits.replace(/^0+/, '') : digits;
}

export default function DrugoLanding(){
  const rawPhone = process.env.NEXT_PUBLIC_DRUGO_PHONE || '+1 555 175 1458';
  const phoneDigits = formatPhoneForWa(rawPhone).replace(/^\+/, '');
  // Ensure international format (no spaces, no symbols)
  const waNumber = phoneDigits;
  const waHref = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent('Hello')}` : '#';

  return (
    <div className="drugo-root">
      <Head>
        <title>Drugo — Medicines Delivered, Instant Help</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" href="/favicon.svg" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/drugo-landing/styles.css" />
      </Head>

      <main className="drugo-container">
        <header className="drugo-header">
          <img className="drugo-logo" src={LOGO_URL} alt="Drugo logo" />
        </header>

        <section className="drugo-hero">
          <div className="hero-text">
            <h1 className="hero-title">Drugo — Medicines Delivered, Questions Answered</h1>
            <p className="hero-sub">Order medicines, consult pharmacists and track deliveries — all from WhatsApp.</p>

            <div className="hero-actions">
              <a className="btn-primary" href={waHref} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>
              <a className="btn-outline" href="#features">Learn More</a>
            </div>

            <p className="contact-note">Need immediate help? <a className="contact-link" href={waHref} target="_blank" rel="noopener noreferrer">{rawPhone}</a></p>
          </div>

          <div className="hero-visual">
            <img className="pill-illustration" src={LOGO_URL} alt="Drugo illustration" />
          </div>
        </section>

        <section id="features" className="drugo-features">
          <h2 className="section-title">What you can do with Drugo</h2>
          <div className="features-grid">
            <article className="feature-card">
              <h3 className="feature-title">Order Medicines</h3>
              <p className="feature-desc">Search, upload prescriptions and get fast delivery for essential medicines.</p>
            </article>

            <article className="feature-card">
              <h3 className="feature-title">Chat with Pharmacists</h3>
              <p className="feature-desc">Ask medication questions and get professional guidance directly on WhatsApp.</p>
            </article>

            <article className="feature-card">
              <h3 className="feature-title">Secure Payments</h3>
              <p className="feature-desc">Pay safely and receive instant confirmation of your orders.</p>
            </article>

            <article className="feature-card">
              <h3 className="feature-title">Track Orders</h3>
              <p className="feature-desc">Real-time order updates so you know when your medicines will arrive.</p>
            </article>
          </div>
        </section>

        <footer className="drugo-footer">
          <p className="footer-text">Questions? Start a chat: <a className="contact-link" href={waHref} target="_blank" rel="noopener noreferrer">{rawPhone}</a></p>
        </footer>
      </main>
    </div>
  );
}
